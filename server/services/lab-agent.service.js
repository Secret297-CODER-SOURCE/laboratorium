import { execFileSync, execFile } from 'child_process';
import { promisify } from 'util';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import config from '../config/index.js';
import db from '../db/index.js';
import { ValidationError } from '../utils/errors.js';
import {
  assertSafeContainerName,
  assertSafeDockerImage,
  assertSafePort,
  dockerEnvArgs,
} from '../utils/docker-ref.js';
import { getLabPublicConfig } from './settings.service.js';
import { buildDockerTargetUrl, mockLocalConfig } from '../utils/publicUrl.js';
import { buildDemoLabUrl } from './ctf-demo.service.js';

async function agentRequest(path, body) {
  if (!config.labAgent.url) return null;

  const res = await fetch(`${config.labAgent.url.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Lab-Agent-Key': config.labAgent.secret,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ValidationError(data.error || 'Lab agent error');
  }
  return data;
}

function localDockerDeploy({
  name, image, port, containerPort = 80, env: envVars = {}, extraPorts = [],
}) {
  const safeName = assertSafeContainerName(name);
  const safeImage = assertSafeDockerImage(image);
  const hostPort = assertSafePort(port);
  const cPort = assertSafePort(containerPort);
  const safeExtraPorts = extraPorts.map((ep) => ({
    hostPort: assertSafePort(ep.hostPort),
    containerPort: assertSafePort(ep.containerPort),
  }));
  try {
    execFileSync('docker', ['rm', '-f', safeName], { stdio: 'ignore' });
  } catch {
    /* already gone */
  }
  const extraPortArgs = safeExtraPorts.flatMap((ep) => ['-p', `${ep.hostPort}:${ep.containerPort}`]);
  execFileSync('docker', [
    'run', '-d',
    '--name', safeName,
    '-p', `${hostPort}:${cPort}`,
    ...extraPortArgs,
    ...dockerEnvArgs(envVars || {}),
    '--restart', 'unless-stopped',
    safeImage,
  ], { stdio: 'pipe' });
  const cfg = getLabPublicConfig();
  const hostIp = cfg.dockerHostIp || config.labAgent.hostIp || '127.0.0.1';
  return {
    containerId: safeName,
    targetUrl: buildDockerTargetUrl(hostIp, hostPort, cfg),
    hostPort,
    containerPort: cPort,
    extraPorts: safeExtraPorts,
    publicHost: hostIp,
    mock: false,
    localDocker: true,
  };
}

function mockDeploy({ name, image, port, containerPort = 80, demoMeta }) {
  if (demoMeta?.slug) {
    return {
      containerId: `mock-${name}`,
      targetUrl: buildDemoLabUrl(demoMeta),
      hostPort: port,
      containerPort,
      extraPorts: [],
      publicHost: 'demo',
      mock: true,
      demo: true,
    };
  }
  const cfg = mockLocalConfig(getLabPublicConfig());
  const hostIp = cfg.dockerHostIp;
  return {
    containerId: `mock-${name}`,
    targetUrl: buildDockerTargetUrl(hostIp, port, cfg),
    hostPort: port,
    containerPort,
    extraPorts: [],
    publicHost: hostIp,
    mock: true,
  };
}

export function isAgentEnabled() {
  return !!config.labAgent.url || !!config.labAgent.useLocalDocker;
}

export async function deployContainer({
  name, image, port, containerPort = 80, demoMeta = null, env: envVars = null, extraPorts = [],
}) {
  const safeImage = assertSafeDockerImage(image);

  const agentResult = await agentRequest('/deploy', {
    name, image: safeImage, port, containerPort, env: envVars || undefined,
    extraPorts: extraPorts.length ? extraPorts : undefined,
  });
  const cfg = getLabPublicConfig();
  const hostIp = cfg.dockerHostIp || config.labAgent.hostIp;

  if (agentResult) {
    return {
      containerId: agentResult.containerId,
      targetUrl: buildDockerTargetUrl(hostIp, agentResult.hostPort || port, cfg),
      hostPort: agentResult.hostPort || port,
      containerPort,
      extraPorts: agentResult.extraPorts || [],
      publicHost: hostIp,
      mock: false,
    };
  }

  if (config.labAgent.useLocalDocker) {
    try {
      return localDockerDeploy({
        name, image: safeImage, port, containerPort, env: envVars || {}, extraPorts,
      });
    } catch (err) {
      throw new ValidationError(err.message || 'Local Docker deploy failed');
    }
  }

  return mockDeploy({ name, image: safeImage, port, containerPort, demoMeta });
}

export async function stopContainer(containerId) {
  if (!containerId) return { ok: true };
  const result = await agentRequest('/stop', { containerId });
  if (result) return result;
  if (config.labAgent.useLocalDocker) {
    try {
      execFileSync('docker', ['rm', '-f', assertSafeContainerName(containerId)], { stdio: 'pipe' });
    } catch {
      /* already gone */
    }
  }
  return { ok: true, mock: !config.labAgent.useLocalDocker };
}

function collectUsedPorts() {
  const used = new Set();
  const ctfRows = db.prepare(`
    SELECT host_port, extra_ports FROM ctf_deployments WHERE status IN ('running', 'deploying')
  `).all();
  for (const row of ctfRows) {
    if (row.host_port) used.add(row.host_port);
    if (row.extra_ports) {
      try {
        const parsed = JSON.parse(row.extra_ports);
        if (Array.isArray(parsed)) {
          for (const p of parsed) if (p?.hostPort) used.add(p.hostPort);
        }
      } catch {
        /* malformed, ignore */
      }
    }
  }
  const dockerRows = db.prepare(`
    SELECT host_port FROM docker_deployments WHERE status IN ('running', 'deploying')
  `).all();
  for (const row of dockerRows) {
    if (row.host_port) used.add(row.host_port);
  }
  return used;
}

export function allocatePorts(count, seed) {
  const start = config.labAgent.portRangeStart;
  const end = config.labAgent.portRangeEnd;
  const range = end - start;
  if (count > range) throw new ValidationError('Немає вільних портів у діапазоні');

  const used = collectUsedPorts();
  const offset = ((seed % range) + range) % range;
  const picked = [];
  for (let i = 0; i < range && picked.length < count; i++) {
    const port = start + ((offset + i) % range);
    if (!used.has(port)) picked.push(port);
  }
  if (picked.length < count) {
    throw new ValidationError('Немає вільних портів у діапазоні');
  }
  return picked;
}

export function allocatePort(seed) {
  return allocatePorts(1, seed)[0];
}

export function getPublicInfra() {
  const cfg = getLabPublicConfig();
  return {
    useSslip: cfg.useSslip,
    sslipDomain: cfg.sslipDomain,
    dockerHostIp: cfg.dockerHostIp,
    scheme: cfg.scheme,
    localDocker: !!config.labAgent.useLocalDocker,
    ctfImage: config.labAgent.ctfImage,
  };
}

const execFileAsync = promisify(execFile);

/**
 * Builds (or rebuilds) the CTF challenge Docker image from the bundled
 * challenges/ctf-lab/ source, using the host Docker daemon via the mounted
 * /var/run/docker.sock (Docker-outside-of-Docker) — no manual `npm run
 * ctf:build` step needed. Runs in the background at server startup; never
 * throws, only logs, so it can't block or crash boot. Docker's own layer
 * cache makes repeat builds on unchanged source fast, and picks up real
 * source changes automatically on the next deploy/restart.
 */
export async function ensureCtfImageBuilt() {
  if (!config.labAgent.useLocalDocker) return;

  const buildContext = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'challenges', 'ctf-lab');
  if (!existsSync(buildContext)) {
    console.warn(`[lab-agent] CTF image build context not found at ${buildContext} — real Docker CTF challenges will fail to deploy.`);
    return;
  }

  const image = config.labAgent.ctfImage;
  console.log(`[lab-agent] Building CTF challenge image ${image} from ${buildContext} ...`);
  try {
    await execFileAsync('docker', ['build', '-t', image, buildContext], { timeout: 5 * 60 * 1000 });
    console.log(`[lab-agent] CTF challenge image ${image} ready.`);
  } catch (err) {
    console.error(`[lab-agent] Failed to build CTF challenge image ${image}: ${err.message}`);
    console.error('[lab-agent] Check that /var/run/docker.sock is mounted and reachable by the app user.');
  }
}
