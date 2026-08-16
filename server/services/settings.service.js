import db from '../db/index.js';
import config from '../config/index.js';
import { ValidationError } from '../utils/errors.js';

const SETTINGS_KEY = 'proxmox';

function envDefaults() {
  return {
    enabled: config.proxmox.enabled,
    host: config.proxmox.host || '',
    tokenId: config.proxmox.tokenId || '',
    tokenSecret: config.proxmox.tokenSecret || '',
    node: config.proxmox.node || 'pve',
    templateVmid: config.proxmox.templateVmid || 9000,
    storage: config.proxmox.storage || 'local-lvm',
    bridge: config.proxmox.bridge || 'vmbr0',
    vmMemoryMb: config.proxmox.vmMemoryMb || 4096,
    vmCores: config.proxmox.vmCores || 2,
  };
}

function loadRaw() {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(SETTINGS_KEY);
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

export function getProxmoxConfig() {
  const stored = loadRaw();
  const defaults = envDefaults();
  return {
    enabled: stored.enabled ?? defaults.enabled,
    host: stored.host || defaults.host,
    tokenId: stored.tokenId || defaults.tokenId,
    tokenSecret: stored.tokenSecret || defaults.tokenSecret,
    node: stored.node || defaults.node,
    templateVmid: parseInt(stored.templateVmid ?? defaults.templateVmid, 10),
    storage: stored.storage || defaults.storage,
    bridge: stored.bridge || defaults.bridge,
    vmMemoryMb: parseInt(stored.vmMemoryMb ?? defaults.vmMemoryMb, 10),
    vmCores: parseInt(stored.vmCores ?? defaults.vmCores, 10),
  };
}

export function getProxmoxSettingsPublic() {
  const cfg = getProxmoxConfig();
  return {
    enabled: !!cfg.enabled,
    host: cfg.host,
    tokenId: cfg.tokenId,
    hasTokenSecret: !!cfg.tokenSecret,
    node: cfg.node,
    templateVmid: cfg.templateVmid,
    storage: cfg.storage,
    bridge: cfg.bridge,
    vmMemoryMb: cfg.vmMemoryMb,
    vmCores: cfg.vmCores,
    configured: !!(cfg.enabled && cfg.host && cfg.tokenId && cfg.tokenSecret),
  };
}

export function saveProxmoxSettings(data) {
  const current = loadRaw();
  const host = data.host?.trim();
  if (data.enabled && !host) {
    throw new ValidationError('Вкажіть URL Proxmox');
  }
  if (data.enabled && !data.tokenId?.trim()) {
    throw new ValidationError('Вкажіть Token ID');
  }

  const tokenSecret = data.tokenSecret?.trim()
    ? data.tokenSecret.trim()
    : (current.tokenSecret || '');

  if (data.enabled && !tokenSecret) {
    throw new ValidationError('Вкажіть API Secret');
  }

  const payload = {
    enabled: !!data.enabled,
    host: host || '',
    tokenId: data.tokenId?.trim() || '',
    tokenSecret,
    node: data.node?.trim() || 'pve',
    templateVmid: parseInt(data.templateVmid, 10) || 9000,
    storage: data.storage?.trim() || 'local-lvm',
    bridge: data.bridge?.trim() || 'vmbr0',
    vmMemoryMb: parseInt(data.vmMemoryMb, 10) || 4096,
    vmCores: parseInt(data.vmCores, 10) || 2,
    updatedBy: 'owner',
  };

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(SETTINGS_KEY, JSON.stringify(payload));

  return getProxmoxSettingsPublic();
}

const LAB_PUBLIC_KEY = 'lab_public';

function labPublicEnvDefaults() {
  return {
    useSslip: config.labPublic.useSslip,
    sslipDomain: config.labPublic.sslipDomain,
    scheme: config.labPublic.scheme,
    dockerHostIp: config.labPublic.dockerHostIp,
    vmSshUser: config.labPublic.vmSshUser,
    vmSshPort: config.labPublic.vmSshPort,
    useSecureTunnel: config.labPublic.useSecureTunnel,
    tunnelGatewayIp: config.labPublic.tunnelGatewayIp,
    tunnelTokenHours: config.labPublic.tunnelTokenHours,
  };
}

function loadLabPublicRaw() {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(LAB_PUBLIC_KEY);
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

export function getLabPublicConfig() {
  const stored = loadLabPublicRaw();
  const defaults = labPublicEnvDefaults();
  return {
    useSslip: stored.useSslip ?? defaults.useSslip,
    sslipDomain: stored.sslipDomain || defaults.sslipDomain,
    scheme: stored.scheme || defaults.scheme,
    dockerHostIp: stored.dockerHostIp || defaults.dockerHostIp,
    vmSshUser: stored.vmSshUser || defaults.vmSshUser,
    vmSshPort: parseInt(stored.vmSshPort ?? defaults.vmSshPort, 10),
    useSecureTunnel: stored.useSecureTunnel ?? defaults.useSecureTunnel,
    tunnelGatewayIp: stored.tunnelGatewayIp || defaults.tunnelGatewayIp || stored.dockerHostIp || defaults.dockerHostIp,
    tunnelTokenHours: parseInt(stored.tunnelTokenHours ?? defaults.tunnelTokenHours, 10) || 72,
  };
}

export function getLabPublicSettingsPublic() {
  const cfg = getLabPublicConfig();
  const gateway = cfg.tunnelGatewayIp || cfg.dockerHostIp;
  const exampleHost = cfg.useSslip ? `${gateway.replace(/\./g, '-')}.${cfg.sslipDomain}` : gateway;
  return {
    ...cfg,
    exampleVm: cfg.useSslip
      ? `ssh ${cfg.vmSshUser}@10-10-10-5.${cfg.sslipDomain}`
      : `ssh ${cfg.vmSshUser}@10.10.10.5`,
    exampleDocker: cfg.useSecureTunnel
      ? `https://${exampleHost}/lab/t/TOKEN`
      : (cfg.useSslip
        ? `${cfg.scheme}://${exampleHost}:31001`
        : `${cfg.scheme}://${cfg.dockerHostIp}:31001`),
    exampleTunnel: cfg.useSecureTunnel
      ? `https://${exampleHost}/lab/t/TOKEN`
      : null,
  };
}

export function saveLabPublicSettings(data) {
  const dockerHostIp = data.dockerHostIp?.trim();
  if (!dockerHostIp) {
    throw new ValidationError('Вкажіть IP Docker-хоста (публічний)');
  }

  const payload = {
    useSslip: data.useSslip !== false,
    sslipDomain: data.sslipDomain?.trim() || 'sslip.io',
    scheme: data.scheme?.trim() || 'http',
    dockerHostIp,
    vmSshUser: data.vmSshUser?.trim() || 'lab',
    vmSshPort: parseInt(data.vmSshPort, 10) || 22,
    useSecureTunnel: data.useSecureTunnel !== false,
    tunnelGatewayIp: data.tunnelGatewayIp?.trim() || dockerHostIp,
    tunnelTokenHours: parseInt(data.tunnelTokenHours, 10) || 72,
    updatedBy: 'owner',
  };

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(LAB_PUBLIC_KEY, JSON.stringify(payload));

  return getLabPublicSettingsPublic();
}
