import { Agent } from 'undici';
import * as settings from './settings.service.js';
import config from '../config/index.js';
import { ValidationError } from '../utils/errors.js';

function cfg() {
  return settings.getProxmoxConfig();
}

// Proxmox almost always runs behind its own self-signed certificate (the
// default install has no real TLS cert), so Node's global fetch — which
// rejects unverified certs by default — fails every request with the opaque
// "fetch failed" error before ever reaching Proxmox's API. PROXMOX_REJECT_UNAUTHORIZED
// defaults to false precisely for this reason; this dispatcher is what actually
// applies that setting (it used to exist in config but was never wired in).
let insecureDispatcher = null;
function insecureDispatcherIfNeeded() {
  if (config.proxmox.rejectUnauthorized) return undefined;
  if (!insecureDispatcher) insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  return insecureDispatcher;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Every mutating Proxmox call (clone/config/start/stop/delete/snapshot) is a
 * background task that returns a UPID immediately — the actual work can take
 * anywhere from under a second to several minutes. Firing the next request
 * right away (as this code used to) races the previous task: Proxmox hasn't
 * released its lock on the VM config file yet, so the next call fails with
 * "can't lock file ... got timeout", or the config file doesn't exist yet if
 * a clone hasn't finished writing it. Waiting for `status: stopped` here is
 * what makes every VM lifecycle action wait its turn.
 */
async function waitForTask(node, upid, { timeoutMs = 10 * 60 * 1000, intervalMs = 1500 } = {}) {
  if (!upid || typeof upid !== 'string' || !upid.startsWith('UPID:')) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await request('GET', `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`);
    if (status?.status === 'stopped') {
      if (status.exitstatus && status.exitstatus !== 'OK') {
        throw new ValidationError(`Proxmox: завдання ${status.type || ''} завершилось з помилкою: ${status.exitstatus}`);
      }
      return;
    }
    await sleep(intervalMs);
  }
  throw new ValidationError('Proxmox: перевищено час очікування виконання завдання (операція триває надто довго)');
}

async function request(method, path, body = null) {
  const c = cfg();
  if (!c.enabled || !c.tokenId || !c.tokenSecret) return null;

  const url = `${c.host.replace(/\/$/, '')}/api2/json${path}`;
  const headers = {
    Authorization: `PVEAPIToken=${c.tokenId}=${c.tokenSecret}`,
  };
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      dispatcher: insecureDispatcherIfNeeded(),
    });
  } catch (err) {
    throw new ValidationError(`Proxmox: не вдалося з'єднатися з ${c.host} (${err.cause?.message || err.message})`);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json.errors || json.message || res.statusText;
    throw new ValidationError(`Proxmox: ${typeof err === 'object' ? JSON.stringify(err) : err}`);
  }
  return json.data;
}

export function isEnabled() {
  const c = cfg();
  return !!(c.enabled && c.host && c.tokenId && c.tokenSecret);
}

export function isConfigured() {
  return isEnabled();
}

export async function getNextVmid() {
  if (!isEnabled()) return 10000 + Math.floor(Math.random() * 5000);
  const cluster = await request('GET', '/cluster/nextid');
  return parseInt(cluster, 10);
}

export async function cloneVm({ vmid, name, userId }) {
  const c = cfg();

  if (!isEnabled()) {
    return {
      vmid: 10000 + userId,
      node: c.node,
      hostname: name,
      ip: `10.10.${Math.floor(userId / 254) + 1}.${(userId % 254) + 10}`,
      mock: true,
    };
  }

  const cloneUpid = await request('POST', `/nodes/${c.node}/qemu/${c.templateVmid}/clone`, {
    newid: vmid,
    name,
    full: 1,
    storage: c.storage,
  });
  await waitForTask(c.node, cloneUpid);

  const configUpid = await request('PUT', `/nodes/${c.node}/qemu/${vmid}/config`, {
    cores: c.vmCores,
    memory: c.vmMemoryMb,
    net0: `virtio,bridge=${c.bridge}`,
    // Enables the QEMU Guest Agent *channel* on the hypervisor side — file
    // browsing / system info in the student dashboard need this, but it's a
    // no-op until qemu-guest-agent is also installed and running inside the
    // guest OS itself (must be baked into the template before cloning).
    agent: '1',
  });
  await waitForTask(c.node, configUpid);

  return { vmid, node: c.node, hostname: name, ip: null, mock: false };
}

export async function startVm(vmid, node) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { status: 'running', mock: true };
  const upid = await request('POST', `/nodes/${n}/qemu/${vmid}/status/start`);
  await waitForTask(n, upid, { timeoutMs: 60_000 });
  return { status: 'running' };
}

export async function stopVm(vmid, node) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { status: 'stopped', mock: true };
  const upid = await request('POST', `/nodes/${n}/qemu/${vmid}/status/stop`);
  await waitForTask(n, upid, { timeoutMs: 60_000 });
  return { status: 'stopped' };
}

export async function deleteVm(vmid, node) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { ok: true, mock: true };
  await stopVm(vmid, n).catch(() => {});
  const upid = await request('DELETE', `/nodes/${n}/qemu/${vmid}`);
  await waitForTask(n, upid, { timeoutMs: 120_000 });
  return { ok: true };
}

export async function getVmStatusCurrent(vmid, node) {
  const n = node || cfg().node;
  if (!isEnabled()) return null;
  return request('GET', `/nodes/${n}/qemu/${vmid}/status/current`);
}

function isAgentUnavailableError(err) {
  return /guest agent/i.test(err?.message || '');
}

/**
 * CPU/RAM/uptime come straight from the hypervisor — no guest agent needed.
 * OS name and real per-filesystem disk usage need qemu-guest-agent actually
 * running inside the guest, which isn't guaranteed (must be installed in the
 * template OS beforehand); this degrades gracefully to `agentAvailable: false`
 * instead of failing the whole panel when it isn't.
 */
export async function getSystemInfo(vmid, node) {
  const n = node || cfg().node;
  if (!isEnabled()) {
    return {
      cpu: 0.12, mem: 512 * 1024 * 1024, maxmem: 1024 * 1024 * 1024, uptime: 3600,
      agentAvailable: false, os: null, filesystems: [], mock: true,
    };
  }

  const status = await getVmStatusCurrent(vmid, n);
  const base = {
    cpu: status?.cpu ?? null,
    mem: status?.mem ?? null,
    maxmem: status?.maxmem ?? null,
    disk: status?.disk ?? null,
    maxdisk: status?.maxdisk ?? null,
    uptime: status?.uptime ?? null,
    netin: status?.netin ?? null,
    netout: status?.netout ?? null,
  };

  try {
    const [osinfo, fsinfo] = await Promise.all([
      request('GET', `/nodes/${n}/qemu/${vmid}/agent/get-osinfo`),
      request('GET', `/nodes/${n}/qemu/${vmid}/agent/get-fsinfo`),
    ]);
    return {
      ...base,
      agentAvailable: true,
      os: osinfo?.result || null,
      filesystems: fsinfo?.result || [],
    };
  } catch (err) {
    if (isAgentUnavailableError(err)) {
      return { ...base, agentAvailable: false, os: null, filesystems: [] };
    }
    throw err;
  }
}

/**
 * Runs a binary via the guest agent's exec (argv array, no shell involved —
 * arguments are passed to execve() directly, so paths with spaces/quotes are
 * inherently safe and there's no injection surface).
 */
export async function agentExec(vmid, node, argv, { timeoutMs = 15_000 } = {}) {
  const n = node || cfg().node;
  if (!isEnabled()) return { exited: true, exitcode: 0, out: '', err: '', mock: true };

  const [command, ...args] = argv;
  const started = await request('POST', `/nodes/${n}/qemu/${vmid}/agent/exec`, {
    command: [command, ...args],
  });
  const pid = started?.pid;
  if (!pid) throw new ValidationError("Proxmox: не вдалося запустити команду в гостьовій ОС");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await request('GET', `/nodes/${n}/qemu/${vmid}/agent/exec-status?pid=${pid}`);
    if (status?.exited) {
      return {
        exited: true,
        exitcode: status.exitcode ?? 0,
        out: status['out-data'] || '',
        err: status['err-data'] || '',
      };
    }
    await sleep(300);
  }
  throw new ValidationError('Proxmox: команда в гостьовій ОС виконується задовго');
}

/** Список файлів у директорії гостьової ОС через `find` (без shell — безпечно до шляхів). */
export async function agentListDir(vmid, node, path) {
  const result = await agentExec(vmid, node, [
    'find', path, '-mindepth', '1', '-maxdepth', '1', '-printf', '%y\t%s\t%T@\t%f\n',
  ]);
  if (result.mock) {
    return [
      { type: 'd', size: 0, mtime: Date.now() / 1000, name: 'приклад-папки' },
      { type: 'f', size: 1234, mtime: Date.now() / 1000, name: 'приклад-файлу.txt' },
    ];
  }
  if (result.exitcode !== 0) {
    throw new ValidationError(result.err?.trim() || 'Не вдалося прочитати директорію');
  }
  return result.out.split('\n').filter(Boolean).map((line) => {
    const [type, size, mtime, ...nameParts] = line.split('\t');
    return { type, size: parseInt(size, 10) || 0, mtime: parseFloat(mtime) || 0, name: nameParts.join('\t') };
  }).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'd' ? -1 : 1)));
}

const MAX_VIEWABLE_FILE_BYTES = 512 * 1024;

export async function agentReadFile(vmid, node, path) {
  const n = node || cfg().node;
  if (!isEnabled()) return { content: '// mock-режим — реального файлу немає', truncated: false };

  const sizeCheck = await agentExec(vmid, node, ['stat', '-c', '%s', path]);
  const size = parseInt(sizeCheck.out?.trim(), 10);
  if (Number.isFinite(size) && size > MAX_VIEWABLE_FILE_BYTES) {
    throw new ValidationError(`Файл завеликий для перегляду (${(size / 1024).toFixed(0)} KB, максимум ${MAX_VIEWABLE_FILE_BYTES / 1024} KB)`);
  }

  const data = await request('GET', `/nodes/${n}/qemu/${vmid}/agent/file-read?file=${encodeURIComponent(path)}`);
  return { content: data?.content ?? '', truncated: !!data?.truncated };
}

export async function agentWriteFile(vmid, node, path, content) {
  const n = node || cfg().node;
  if (!isEnabled()) return { ok: true, mock: true };
  await request('POST', `/nodes/${n}/qemu/${vmid}/agent/file-write`, { file: path, content });
  return { ok: true };
}

export async function createSnapshot(vmid, node, snapname, description) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { ok: true, mock: true };
  const upid = await request('POST', `/nodes/${n}/qemu/${vmid}/snapshot`, { snapname, description: description || undefined });
  await waitForTask(n, upid, { timeoutMs: 5 * 60_000 });
  return { ok: true };
}

export async function listSnapshots(vmid, node) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return [];
  const data = await request('GET', `/nodes/${n}/qemu/${vmid}/snapshot`);
  return (data || []).filter((s) => s.name !== 'current');
}

export async function rollbackSnapshot(vmid, node, snapname) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { ok: true, mock: true };
  const upid = await request('POST', `/nodes/${n}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}/rollback`);
  await waitForTask(n, upid, { timeoutMs: 5 * 60_000 });
  return { ok: true };
}

export async function deleteSnapshot(vmid, node, snapname) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return { ok: true, mock: true };
  const upid = await request('DELETE', `/nodes/${n}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}`);
  await waitForTask(n, upid, { timeoutMs: 2 * 60_000 });
  return { ok: true };
}

/** Поточний стан реальної VM на Proxmox — для прив'язки вже існуючої машини до учня. */
export async function getVmStatus(vmid, node) {
  const c = cfg();
  const n = node || c.node;
  if (!isEnabled()) return null;
  return request('GET', `/nodes/${n}/qemu/${vmid}/status/current`);
}

export function getConsoleUrl(vmid, node) {
  const c = cfg();
  if (!isEnabled() || !vmid) return null;
  const n = node || c.node;
  return `${c.host.replace(/\/$/, '')}/?console=kvm&novnc=1&vmid=${vmid}&node=${n}`;
}
