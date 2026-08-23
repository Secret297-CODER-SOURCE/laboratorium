import db from '../db/index.js';
import * as proxmox from './proxmox.service.js';
import * as settings from './settings.service.js';
import * as labAgent from './lab-agent.service.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { assertSafeDockerImage } from '../utils/docker-ref.js';
import { buildVmAccess, enrichDeploymentUrl } from '../utils/publicUrl.js';
import { getLabPublicConfig } from './settings.service.js';

function mapUserLab(row) {
  if (!row) return null;
  const access = buildVmAccess(row.ip, undefined, { userId: row.user_id });
  return {
    ...row,
    ...access,
    proxmoxEnabled: proxmox.isEnabled(),
    proxmoxConfigured: proxmox.isConfigured(),
    agentEnabled: labAgent.isAgentEnabled(),
    consoleUrl: row.proxmox_vmid ? proxmox.getConsoleUrl(row.proxmox_vmid, row.node) : null,
  };
}

export function getUserLab(userId) {
  const row = db.prepare('SELECT * FROM user_labs WHERE user_id = ?').get(userId);
  if (!row) {
    const c = settings.getProxmoxConfig();
    return mapUserLab({
      user_id: userId,
      status: proxmox.isEnabled() ? 'provisioning' : 'pending',
      proxmox_vmid: null,
      node: c.node,
      hostname: null,
      ip: null,
      error_message: proxmox.isEnabled() ? null : 'Очікує налаштування Proxmox адміністратором',
    });
  }
  return mapUserLab(row);
}

export function listDockerDeployments(userId) {
  const cfg = getLabPublicConfig();
  const mock = !labAgent.isAgentEnabled();
  return db.prepare(`
    SELECT * FROM docker_deployments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(userId).map(row => enrichDeploymentUrl(row, cfg, {
    userId,
    resourceType: 'docker',
    resourceId: row.id,
    mock,
  }));
}

export async function provisionVm(userId, handle) {
  const existing = db.prepare('SELECT * FROM user_labs WHERE user_id = ?').get(userId);
  if (existing && existing.status === 'provisioning') {
    return getUserLab(userId);
  }
  if (existing && ['running', 'stopped'].includes(existing.status) && existing.proxmox_vmid) {
    return getUserLab(userId);
  }

  const c = settings.getProxmoxConfig();
  const hostname = `lab-${handle}`.slice(0, 32).replace(/[^a-zA-Z0-9-]/g, '');
  const vmid = await proxmox.getNextVmid();

  if (existing) {
    db.prepare(`
      UPDATE user_labs SET proxmox_vmid = ?, node = ?, hostname = ?, ip = NULL,
        status = 'provisioning', error_message = NULL, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(vmid, c.node, hostname, userId);
  } else {
    db.prepare(`
      INSERT INTO user_labs (user_id, proxmox_vmid, node, hostname, status)
      VALUES (?, ?, ?, ?, 'provisioning')
    `).run(userId, vmid, c.node, hostname);
  }

  try {
    const cloned = await proxmox.cloneVm({ vmid, name: hostname, userId });
    await proxmox.startVm(vmid, cloned.node);
    const ip = cloned.ip || `10.10.10.${(userId % 200) + 10}`;

    db.prepare(`
      UPDATE user_labs SET status = 'running', ip = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(ip, userId);

    return getUserLab(userId);
  } catch (err) {
    db.prepare(`
      UPDATE user_labs SET status = 'error', error_message = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(err.message, userId);
    throw err;
  }
}

/** Автоматичне створення VM для нового учня (фоново) */
export function scheduleProvisionForStudent(userId, handle) {
  if (!proxmox.isEnabled()) return;
  setImmediate(() => {
    provisionVm(userId, handle).catch((err) => {
      console.error(`[lab] auto-provision user ${userId}:`, err.message);
    });
  });
}

/** Створити VM усім учням без машини (після налаштування Proxmox) */
export async function provisionMissingStudents() {
  const students = db.prepare(`
    SELECT u.id, u.handle FROM users u
    WHERE u.role = 'student'
      AND u.id NOT IN (SELECT user_id FROM user_labs WHERE status IN ('provisioning','running','stopped'))
  `).all();

  let started = 0;
  for (const s of students) {
    scheduleProvisionForStudent(s.id, s.handle);
    started += 1;
  }
  return { started };
}

export async function startVm(userId) {
  const lab = db.prepare('SELECT * FROM user_labs WHERE user_id = ?').get(userId);
  if (!lab?.proxmox_vmid) throw new NotFoundError('Машина ще створюється');
  await proxmox.startVm(lab.proxmox_vmid, lab.node);
  db.prepare(`UPDATE user_labs SET status = 'running', updated_at = datetime('now') WHERE user_id = ?`).run(userId);
  return getUserLab(userId);
}

export async function stopVm(userId) {
  const lab = db.prepare('SELECT * FROM user_labs WHERE user_id = ?').get(userId);
  if (!lab?.proxmox_vmid) throw new NotFoundError('Машина не знайдена');
  await proxmox.stopVm(lab.proxmox_vmid, lab.node);
  db.prepare(`UPDATE user_labs SET status = 'stopped', updated_at = datetime('now') WHERE user_id = ?`).run(userId);
  return getUserLab(userId);
}

export async function resetVm(userId, handle) {
  const lab = db.prepare('SELECT * FROM user_labs WHERE user_id = ?').get(userId);
  if (lab?.proxmox_vmid) {
    await proxmox.deleteVm(lab.proxmox_vmid, lab.node).catch(() => {});
    db.prepare('DELETE FROM user_labs WHERE user_id = ?').run(userId);
  }
  return provisionVm(userId, handle);
}

export async function deployDocker(userId, { image, name }) {
  const imageName = assertSafeDockerImage(image);

  const deployName = (name?.trim() || `user-${userId}-${Date.now()}`).replace(/[^a-zA-Z0-9-_]/g, '-');
  const port = labAgent.allocatePort(userId + Date.now());

  const result = db.prepare(`
    INSERT INTO docker_deployments (user_id, name, image, host_port, status)
    VALUES (?, ?, ?, ?, 'deploying')
  `).run(userId, deployName, imageName, port);

  const deployId = result.lastInsertRowid;

  try {
    const deployed = await labAgent.deployContainer({
      name: deployName,
      image: imageName,
      port,
    });

    db.prepare(`
      UPDATE docker_deployments SET container_id = ?, target_url = ?, host_port = ?,
        status = 'running', updated_at = datetime('now')
      WHERE id = ?
    `).run(deployed.containerId, deployed.targetUrl, deployed.hostPort, deployId);

    return enrichDeploymentUrl(
      db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deployId),
      getLabPublicConfig(),
      { userId, resourceType: 'docker', resourceId: deployId, mock: !labAgent.isAgentEnabled() },
    );
  } catch (err) {
    db.prepare(`
      UPDATE docker_deployments SET status = 'error', error_message = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(err.message, deployId);
    throw err;
  }
}

export async function stopDocker(userId, deployId) {
  const row = db.prepare('SELECT * FROM docker_deployments WHERE id = ? AND user_id = ?').get(deployId, userId);
  if (!row) throw new NotFoundError('Деплой не знайдено');
  await labAgent.stopContainer(row.container_id);
  db.prepare(`UPDATE docker_deployments SET status = 'stopped', updated_at = datetime('now') WHERE id = ?`).run(deployId);
  return enrichDeploymentUrl(
    db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(deployId),
    getLabPublicConfig(),
    { userId, resourceType: 'docker', resourceId: deployId, mock: !labAgent.isAgentEnabled() },
  );
}

export function getLabOverview(userId, handle) {
  const pub = getLabPublicConfig();
  return {
    vm: getUserLab(userId),
    dockerDeployments: listDockerDeployments(userId),
    infra: {
      proxmoxEnabled: proxmox.isEnabled(),
      proxmoxConfigured: proxmox.isConfigured(),
      agentEnabled: labAgent.isAgentEnabled(),
      mockMode: !proxmox.isConfigured() && !labAgent.isAgentEnabled(),
      publicAccess: {
        useSslip: pub.useSslip,
        sslipDomain: pub.sslipDomain,
        scheme: pub.scheme,
        dockerHostIp: pub.dockerHostIp,
        useSecureTunnel: pub.useSecureTunnel,
        tunnelGatewayIp: pub.tunnelGatewayIp,
      },
    },
  };
}
