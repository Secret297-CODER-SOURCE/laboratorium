import { execSync } from 'child_process';
import config from '../config/index.js';
import { ValidationError } from '../utils/errors.js';
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

function dockerEnvFlags(envVars = {}) {
  return Object.entries(envVars)
    .filter(([k, v]) => k && v != null && /^[A-Z0-9_]+$/.test(k))
    .map(([k, v]) => `-e ${k}=${String(v).replace(/"/g, '\\"')}`)
    .join(' ');
}

function localDockerDeploy({ name, image, port, containerPort = 80, env: envVars = {} }) {
  const safeName = String(name).replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 48);
  const envFlags = dockerEnvFlags(envVars);
  execSync(`docker rm -f ${safeName} 2>/dev/null || true`, { stdio: 'ignore' });
  execSync(
    `docker run -d --name ${safeName} -p ${port}:${containerPort} ${envFlags} --restart unless-stopped ${image}`,
    { stdio: 'pipe' },
  );
  const cfg = getLabPublicConfig();
  const hostIp = cfg.dockerHostIp || config.labAgent.hostIp || '127.0.0.1';
  return {
    containerId: safeName,
    targetUrl: buildDockerTargetUrl(hostIp, port, cfg),
    hostPort: port,
    containerPort,
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
    publicHost: hostIp,
    mock: true,
  };
}

export function isAgentEnabled() {
  return !!config.labAgent.url || !!config.labAgent.useLocalDocker;
}

export async function deployContainer({
  name, image, port, containerPort = 80, demoMeta = null, env: envVars = null,
}) {
  if (!image?.trim()) throw new ValidationError('Вкажіть Docker image');

  const agentResult = await agentRequest('/deploy', {
    name, image, port, containerPort, env: envVars || undefined,
  });
  const cfg = getLabPublicConfig();
  const hostIp = cfg.dockerHostIp || config.labAgent.hostIp;

  if (agentResult) {
    return {
      containerId: agentResult.containerId,
      targetUrl: buildDockerTargetUrl(hostIp, agentResult.hostPort || port, cfg),
      hostPort: agentResult.hostPort || port,
      containerPort,
      publicHost: hostIp,
      mock: false,
    };
  }

  if (config.labAgent.useLocalDocker) {
    try {
      return localDockerDeploy({ name, image, port, containerPort, env: envVars });
    } catch (err) {
      throw new ValidationError(err.message || 'Local Docker deploy failed');
    }
  }

  return mockDeploy({ name, image, port, containerPort, demoMeta });
}

export async function stopContainer(containerId) {
  if (!containerId) return { ok: true };
  const result = await agentRequest('/stop', { containerId });
  if (result) return result;
  if (config.labAgent.useLocalDocker) {
    try {
      execSync(`docker rm -f ${containerId}`, { stdio: 'pipe' });
    } catch {
      /* already gone */
    }
  }
  return { ok: true, mock: !config.labAgent.useLocalDocker };
}

export function allocatePort(seed) {
  const start = config.labAgent.portRangeStart;
  const end = config.labAgent.portRangeEnd;
  const range = end - start;
  return start + (seed % range);
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
