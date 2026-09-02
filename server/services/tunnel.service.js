import { randomBytes } from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import db from '../db/index.js';
import config from '../config/index.js';
import { getLabPublicConfig } from './settings.service.js';

const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/;

function newToken() {
  return randomBytes(24).toString('base64url');
}

function ttlHours(cfg) {
  return cfg.tunnelTokenHours || config.labPublic.tunnelTokenHours || 72;
}

export function isPrivateHost(host) {
  return PRIVATE_IP_RE.test(String(host || '').trim());
}

export function resolveTunnelTarget(host, port, cfg) {
  const cleanHost = String(host || '').trim();
  const cleanPort = parseInt(port, 10);
  if (!cleanHost || !Number.isFinite(cleanPort)) return null;

  // Relaying through the agent only makes sense when there's an actual
  // *remote* lab-agent HTTP endpoint to relay through (LAB_AGENT_URL).
  // labAgent.isAgentEnabled() is also true for local-Docker mode, where
  // containers run on this same host and are reachable directly — routing
  // those through agentRelayRequest() crashed on `new URL('')` since there's
  // no agent URL to build a request against (ERR_INVALID_URL on every tunnel).
  if (config.labAgent.url) {
    const agentReachable = isPrivateHost(cleanHost) || cleanHost === cfg.dockerHostIp;
    if (agentReachable) {
      return {
        host: cleanHost === cfg.dockerHostIp ? '127.0.0.1' : cleanHost,
        port: cleanPort,
        viaAgent: true,
      };
    }
  }

  return { host: cleanHost, port: cleanPort, viaAgent: false };
}

export function ensureAccessToken({
  userId,
  host,
  port,
  resourceType = null,
  resourceId = null,
  viaAgent = false,
}) {
  const cfg = getLabPublicConfig();
  if (!cfg.useSecureTunnel) return null;

  const target = resolveTunnelTarget(host, port, cfg) || { host, port, viaAgent };
  const existing = resourceType && resourceId
    ? db.prepare(`
        SELECT token FROM lab_tunnel_tokens
        WHERE user_id = ? AND resource_type = ? AND resource_id = ?
          AND target_host = ? AND target_port = ?
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        ORDER BY id DESC LIMIT 1
      `).get(userId, resourceType, resourceId, target.host, target.port)
    : null;

  if (existing?.token) return existing.token;

  const token = newToken();
  const hours = ttlHours(cfg);
  db.prepare(`
    INSERT INTO lab_tunnel_tokens (
      token, user_id, target_host, target_port, via_agent,
      resource_type, resource_id, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' hours'))
  `).run(
    token, userId, target.host, target.port, target.viaAgent ? 1 : 0,
    resourceType, resourceId, hours,
  );
  return token;
}

export function lookupToken(token) {
  if (!token || token.length < 16) return null;
  const row = db.prepare(`
    SELECT * FROM lab_tunnel_tokens
    WHERE token = ?
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(token);
  return row || null;
}

function stripHopByHop(headers) {
  const out = { ...headers };
  for (const h of ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade', 'host']) {
    delete out[h];
  }
  return out;
}

function agentRelayRequest(req, res, target, forwardPath) {
  const agentUrl = new URL(config.labAgent.url);
  const headers = stripHopByHop(req.headers);
  headers['x-lab-agent-key'] = config.labAgent.secret;
  headers['x-target-host'] = target.host;
  headers['x-target-port'] = String(target.port);
  headers['x-forward-path'] = forwardPath || '/';

  const isTls = agentUrl.protocol === 'https:';
  const proto = isTls ? https : http;

  const agentReq = proto.request({
    hostname: agentUrl.hostname,
    port: agentUrl.port || (isTls ? 443 : 80),
    path: '/tunnel-relay',
    method: req.method,
    headers,
    rejectUnauthorized: false,
  }, (agentRes) => {
    res.writeHead(agentRes.statusCode || 502, stripHopByHop(agentRes.headers));
    agentRes.pipe(res);
  });

  agentReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Тунель недоступний: ${err.message}` });
    } else {
      res.end();
    }
  });

  req.pipe(agentReq);
}

function directProxyRequest(req, res, target, forwardPath) {
  const path = forwardPath || '/';
  const headers = stripHopByHop(req.headers);
  headers.host = `${target.host}:${target.port}`;

  const isTls = target.port === 443;
  const proto = isTls ? https : http;
  const proxyReq = proto.request({
    hostname: target.host,
    port: target.port,
    path,
    method: req.method,
    headers,
    rejectUnauthorized: false,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, stripHopByHop(proxyRes.headers));
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Ціль недоступна: ${err.message}` });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
}

export function handleTunnelProxy(req, res, tokenValue, forwardPath) {
  const row = lookupToken(tokenValue);
  if (!row) {
    return res.status(401).json({ error: 'Токен доступу недійсний або прострочений' });
  }

  const target = {
    host: row.target_host,
    port: row.target_port,
    viaAgent: !!row.via_agent,
  };

  // Re-check config.labAgent.url directly (not just the stored via_agent flag)
  // so tokens issued before the resolveTunnelTarget fix — which could carry
  // via_agent=1 with no agent URL configured — self-heal immediately instead
  // of crashing until they expire.
  if (target.viaAgent && config.labAgent.url) {
    return agentRelayRequest(req, res, target, forwardPath);
  }
  return directProxyRequest(req, res, target, forwardPath);
}

export function parseTunnelPath(urlPath) {
  const match = String(urlPath || '').match(/^\/lab\/t\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  return {
    token: match[1],
    forwardPath: match[2] || '/',
  };
}

export function parseSslipHost(hostname, cfg) {
  const domain = (cfg.sslipDomain || 'sslip.io').replace(/\./g, '\\.');
  const re = new RegExp(`^(\\d+-\\d+-\\d+-\\d+)\\.${domain}$`, 'i');
  const m = String(hostname || '').match(re);
  if (!m) return null;
  return m[1].replace(/-/g, '.');
}

export function trySslipHostTunnel(req, res, next) {
  const cfg = getLabPublicConfig();
  if (!cfg.useSecureTunnel || !cfg.useSslip) return next();

  const ip = parseSslipHost(req.hostname, cfg);
  if (!ip) return next();

  const gatewayIp = cfg.tunnelGatewayIp || cfg.dockerHostIp;
  if (ip !== gatewayIp) return next();

  const parsed = parseTunnelPath(req.url);
  if (!parsed) {
    return res.status(400).send('Використовуйте https://HOST/lab/t/TOKEN для безпечного тунелю sslip.io');
  }
  return handleTunnelProxy(req, res, parsed.token, parsed.forwardPath);
}
