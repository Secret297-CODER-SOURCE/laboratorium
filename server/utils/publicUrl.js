import { getLabPublicConfig } from '../services/settings.service.js';
import { attachSecureAccess, buildTunnelUrl } from '../services/tunnel-url.service.js';
import * as tunnelService from '../services/tunnel.service.js';
import { buildDemoLabUrl } from '../services/ctf-demo.service.js';

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export function isIpv4(value) {
  return IPV4_RE.test(String(value || '').trim());
}

export function ipToPublicHost(ip, cfg) {
  const c = cfg || getLabPublicConfig();
  const clean = String(ip || '').trim();
  if (!clean) return '';
  if (!c.useSslip || !isIpv4(clean)) return clean;
  const domain = c.sslipDomain || 'sslip.io';
  return `${clean.replace(/\./g, '-')}.${domain}`;
}

export function buildServiceUrl(ip, port, cfg) {
  const c = cfg || getLabPublicConfig();
  const scheme = c.scheme || 'http';
  const host = ipToPublicHost(ip, c);
  if (!host) return '';
  if (port) return `${scheme}://${host}:${port}`;
  return `${scheme}://${host}`;
}

export function buildDockerTargetUrl(hostIp, hostPort, cfg) {
  const c = cfg || getLabPublicConfig();
  const ip = hostIp || c.dockerHostIp;
  return buildServiceUrl(ip, hostPort, c);
}

/** Config for local demo when lab-agent is offline (no real Docker). */
export function mockLocalConfig(cfg) {
  const c = cfg || getLabPublicConfig();
  return {
    ...c,
    useSslip: false,
    useSecureTunnel: false,
    dockerHostIp: '127.0.0.1',
    scheme: 'http',
  };
}

export function buildVmAccess(ip, cfg, meta = {}) {
  const c = cfg || getLabPublicConfig();
  if (!ip) {
    return { ip: null, public_host: null, ssh_command: null, http_url: null, secure_url: null };
  }

  const gatewayIp = c.tunnelGatewayIp || c.dockerHostIp;
  const sshHost = c.useSslip && isIpv4(ip)
    ? ipToPublicHost(ip, c)
    : (c.useSslip && gatewayIp ? ipToPublicHost(gatewayIp, c) : ip);

  const sshUser = c.vmSshUser || 'lab';
  const sshPort = c.vmSshPort || 22;
  const directHttp = buildServiceUrl(ip, null, c);

  const base = {
    ip,
    public_host: ipToPublicHost(ip, c),
    ssh_command: `ssh ${sshUser}@${sshHost} -p ${sshPort}`,
    http_url: directHttp,
    direct_url: directHttp,
  };

  if (c.useSecureTunnel && meta.userId) {
    const token = tunnelService.ensureAccessToken({
      userId: meta.userId,
      host: ip,
      port: 80,
      resourceType: 'vm',
      resourceId: meta.userId,
    });
    if (token) {
      base.secure_url = buildTunnelUrl(token, c);
      base.http_url = base.secure_url;
      base.tunnel_token = token;
      base.access_mode = 'secure_tunnel';
    }
  }

  return base;
}

/** Секюрний доступ до довільного порту на власній VM учня (веб-сервіс, який він сам підняв). */
export function buildVmPortAccess(ip, port, cfg, meta = {}) {
  const c = cfg || getLabPublicConfig();
  if (!ip) return { url: null, direct_url: null };

  const directUrl = buildServiceUrl(ip, port, c);
  if (!c.useSecureTunnel || !meta.userId) return { url: directUrl, direct_url: directUrl };

  const token = tunnelService.ensureAccessToken({
    userId: meta.userId,
    host: ip,
    port,
    resourceType: 'vm_port',
    resourceId: meta.resourceId,
  });
  if (!token) return { url: directUrl, direct_url: directUrl };

  return { url: buildTunnelUrl(token, c), direct_url: directUrl, tunnel_token: token };
}

function parseExtraPorts(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * SSH/raw-TCP targets can never go through the HTTP-only tunnel — they're always
 * shown as a direct host:port. For nmap-scan/python-port-scanner the port is
 * deliberately withheld from the hint: finding it is the point of the challenge.
 */
function attachNetworkExtras(base, row, c, meta) {
  if (meta.mock) return base;
  const extras = parseExtraPorts(row.extra_ports);
  if (!extras.length) return base;

  const publicHost = ipToPublicHost(c.dockerHostIp, c);

  if (meta.slug === 'priv-esc-linux') {
    const sshEntry = extras.find((e) => e.label === 'ssh');
    if (sshEntry) {
      base.ssh_command = `ssh lab@${publicHost} -p ${sshEntry.hostPort}`;
      base.ssh_password = sshEntry.sshPassword || null;
    }
    return base;
  }

  base.network_targets = extras.map((e) => ({
    label: e.label,
    host: publicHost,
    hint: meta.slug === 'nmap-scan'
      ? `nmap -sV -p1-65535 ${publicHost}`
      : `python3 -c "import socket; s=socket.socket(); s.connect(('${publicHost}', PORT)); print(s.recv(1024).decode())"`,
  }));
  return base;
}

export function enrichDeploymentUrl(row, cfg, meta = {}) {
  if (!row) return row;
  const c = meta.mock ? mockLocalConfig(cfg) : (cfg || getLabPublicConfig());
  const port = row.host_port;
  if (!port) return { ...row, target_url: row.target_url, mock: !!meta.mock };

  const hostIp = c.dockerHostIp;
  let directUrl;
  if (meta.mock && meta.slug && meta.userId && meta.challengeId && meta.resourceId) {
    directUrl = buildDemoLabUrl({
      userId: meta.userId,
      challengeId: meta.challengeId,
      deploymentId: meta.resourceId,
      slug: meta.slug,
    });
  } else {
    directUrl = buildDockerTargetUrl(hostIp, port, c);
  }
  let base = {
    ...row,
    target_url: directUrl,
    direct_url: directUrl,
    public_host: ipToPublicHost(c.tunnelGatewayIp || hostIp, c),
    mock: !!meta.mock,
  };

  base = attachNetworkExtras(base, row, c, meta);

  if (!c.useSecureTunnel || !meta.userId) return base;

  return attachSecureAccess(base, c, {
    ...meta,
    host: hostIp,
    port,
    directUrl,
  });
}
