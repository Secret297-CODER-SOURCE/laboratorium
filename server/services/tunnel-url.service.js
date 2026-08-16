import config from '../config/index.js';
import { getLabPublicConfig } from './settings.service.js';
import * as tunnelService from './tunnel.service.js';

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

function isIpv4(value) {
  return IPV4_RE.test(String(value || '').trim());
}

function ipToPublicHost(ip, cfg) {
  const c = cfg || getLabPublicConfig();
  const clean = String(ip || '').trim();
  if (!clean) return '';
  if (!c.useSslip || !isIpv4(clean)) return clean;
  const domain = c.sslipDomain || 'sslip.io';
  return `${clean.replace(/\./g, '-')}.${domain}`;
}

function appBaseUrl() {
  return String(config.appUrl || '').replace(/\/$/, '');
}

export function buildTunnelUrl(token, cfg) {
  const c = cfg || getLabPublicConfig();
  if (!token) return '';
  const gatewayIp = c.tunnelGatewayIp || c.dockerHostIp;
  const useSslipGateway = c.useSslip && c.useSecureTunnel && gatewayIp && isIpv4(gatewayIp);
  const scheme = c.useSecureTunnel ? 'https' : (c.scheme || 'http');

  if (useSslipGateway) {
    const host = ipToPublicHost(gatewayIp, c);
    return `${scheme}://${host}/lab/t/${token}`;
  }
  return `${appBaseUrl()}/lab/t/${token}`;
}

export function attachSecureAccess(row, cfg, meta) {
  if (!row || !cfg?.useSecureTunnel || !meta?.userId) return row;
  const host = meta.host || cfg.dockerHostIp;
  const port = meta.port || row.host_port;
  if (!host || !port) return row;

  const token = tunnelService.ensureAccessToken({
    userId: meta.userId,
    host,
    port,
    resourceType: meta.resourceType,
    resourceId: meta.resourceId ?? row.id,
  });
  if (!token) return row;

  const secureUrl = buildTunnelUrl(token, cfg);
  const directUrl = meta.directUrl || row.target_url;
  const gatewayIp = cfg.tunnelGatewayIp || cfg.dockerHostIp;

  return {
    ...row,
    target_url: secureUrl,
    secure_url: secureUrl,
    direct_url: directUrl,
    tunnel_token: token,
    public_host: cfg.useSslip && gatewayIp ? ipToPublicHost(gatewayIp, cfg) : row.public_host,
    access_mode: 'secure_tunnel',
  };
}
