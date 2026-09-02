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
    backupAutoEnabled: false,
    backupIntervalHours: 24,
    backupRetention: 3,
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
    backupAutoEnabled: stored.backupAutoEnabled ?? defaults.backupAutoEnabled,
    backupIntervalHours: parseInt(stored.backupIntervalHours ?? defaults.backupIntervalHours, 10) || 24,
    backupRetention: parseInt(stored.backupRetention ?? defaults.backupRetention, 10) || 3,
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
    backupAutoEnabled: cfg.backupAutoEnabled,
    backupIntervalHours: cfg.backupIntervalHours,
    backupRetention: cfg.backupRetention,
    configured: !!(cfg.enabled && cfg.host && cfg.tokenId && cfg.tokenSecret),
  };
}

export function saveProxmoxSettings(data) {
  // Merge over the currently stored config, not just hardcoded defaults, so a
  // partial update (e.g. the backup-schedule form, which only sends
  // backup* fields) can't blank out host/token/node/etc — every field here
  // falls back to what's already saved when the caller didn't send it.
  const merged = getProxmoxConfig();
  const host = data.host !== undefined ? data.host?.trim() : merged.host;
  const enabled = data.enabled !== undefined ? !!data.enabled : merged.enabled;
  if (enabled && !host) {
    throw new ValidationError('Вкажіть URL Proxmox');
  }
  const tokenId = data.tokenId !== undefined ? data.tokenId?.trim() : merged.tokenId;
  if (enabled && !tokenId) {
    throw new ValidationError('Вкажіть Token ID');
  }
  // Proxmox's own UI lists "User name" (root@pam) and "Token Name" (e.g.
  // laboratorium) as two separate columns — pasting just the user name here
  // is the single most common misconfiguration and produces an opaque
  // Proxmox-side error ("not able to split into user and token parts") only
  // once a real API call is attempted. Catch it here instead, immediately.
  if (enabled && tokenId && !tokenId.includes('!')) {
    throw new ValidationError(
      `Token ID має включати назву токена через "!": user@realm!назва_токена (наприклад root@pam!laboratorium), а не просто "${tokenId}"`,
    );
  }

  const tokenSecret = data.tokenSecret?.trim()
    ? data.tokenSecret.trim()
    : merged.tokenSecret;

  if (enabled && !tokenSecret) {
    throw new ValidationError('Вкажіть API Secret');
  }

  const payload = {
    enabled,
    host: host || '',
    tokenId: tokenId || '',
    tokenSecret: tokenSecret || '',
    node: data.node !== undefined ? (data.node?.trim() || 'pve') : merged.node,
    templateVmid: data.templateVmid !== undefined ? (parseInt(data.templateVmid, 10) || 9000) : merged.templateVmid,
    storage: data.storage !== undefined ? (data.storage?.trim() || 'local-lvm') : merged.storage,
    bridge: data.bridge !== undefined ? (data.bridge?.trim() || 'vmbr0') : merged.bridge,
    vmMemoryMb: data.vmMemoryMb !== undefined ? (parseInt(data.vmMemoryMb, 10) || 4096) : merged.vmMemoryMb,
    vmCores: data.vmCores !== undefined ? (parseInt(data.vmCores, 10) || 2) : merged.vmCores,
    backupAutoEnabled: data.backupAutoEnabled !== undefined ? !!data.backupAutoEnabled : merged.backupAutoEnabled,
    backupIntervalHours: data.backupIntervalHours !== undefined
      ? Math.max(1, parseInt(data.backupIntervalHours, 10) || 24)
      : merged.backupIntervalHours,
    backupRetention: data.backupRetention !== undefined
      ? Math.max(1, parseInt(data.backupRetention, 10) || 3)
      : merged.backupRetention,
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

const SMTP_KEY = 'smtp';

function smtpEnvDefaults() {
  return {
    host: config.smtp.host || '',
    port: config.smtp.port || 587,
    secure: !!config.smtp.secure,
    user: config.smtp.user || '',
    pass: config.smtp.pass || '',
    from: config.smtp.from || 'noreply@laboratorium.club',
  };
}

function loadSmtpRaw() {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(SMTP_KEY);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export function getSmtpConfig() {
  const stored = loadSmtpRaw();
  const defaults = smtpEnvDefaults();
  const src = stored ? { ...defaults, ...stored } : defaults;
  return {
    host: (src.host || '').trim(),
    port: parseInt(src.port, 10) || 587,
    secure: !!src.secure,
    user: (src.user || '').trim(),
    pass: src.pass || '',
    from: (src.from || '').trim() || 'noreply@laboratorium.club',
  };
}

export function getSmtpSettingsPublic() {
  const cfg = getSmtpConfig();
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    from: cfg.from,
    hasPassword: !!cfg.pass,
    configured: !!cfg.host,
  };
}

export function saveSmtpSettings(data) {
  const merged = getSmtpConfig();
  const host = data.host !== undefined ? data.host.trim() : merged.host;
  const user = data.user !== undefined ? data.user.trim() : merged.user;
  const from = data.from !== undefined ? (data.from.trim() || 'noreply@laboratorium.club') : merged.from;
  const port = data.port !== undefined ? (parseInt(data.port, 10) || 587) : merged.port;
  const secure = data.secure !== undefined ? !!data.secure : (port === 465 ? true : merged.secure);
  const pass = data.pass?.trim() ? data.pass.trim() : merged.pass;

  if (host && user && !pass) {
    throw new ValidationError('Вкажіть пароль SMTP');
  }

  const payload = {
    host: host || '',
    port,
    secure,
    user: user || '',
    pass: pass || '',
    from,
    updatedBy: 'owner',
  };

  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(SMTP_KEY, JSON.stringify(payload));

  return getSmtpSettingsPublic();
}
