/**
 * Lab Agent — запускається на окремій машині Proxmox з Docker.
 * laboratorium викликає POST /deploy для CTF і Docker-лабораторії.
 *
 * Запуск:
 *   LAB_AGENT_SECRET=xxx \
 *   LAB_DOCKER_HOST_IP=203.0.113.10 \
 *   LAB_USE_SSLIP=true \
 *   node lab-agent/server.js
 */
import express from 'express';
import http from 'http';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';

const UNSAFE_IMAGE = /[\s;|&$`<>(){}\\!#'"\n\r\t]/;

function assertSafeDockerImage(image) {
  const s = String(image || '').trim();
  if (!s || s.length > 256 || UNSAFE_IMAGE.test(s) || !/^[A-Za-z0-9][A-Za-z0-9._/@:+-]*$/.test(s)) {
    const err = new Error('Invalid Docker image');
    err.statusCode = 400;
    throw err;
  }
  return s;
}

function assertSafePort(port) {
  const n = Number.parseInt(port, 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    const err = new Error('Invalid port');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

const app = express();
const PORT = parseInt(process.env.LAB_AGENT_PORT || '3099', 10);
const SECRET = process.env.LAB_AGENT_SECRET || 'dev-lab-agent-secret';
const HOST_IP = process.env.LAB_DOCKER_HOST_IP || '127.0.0.1';
const USE_SSLIP = !['0', 'false', 'no'].includes(String(process.env.LAB_USE_SSLIP ?? 'true').toLowerCase());
const SSLIP_DOMAIN = process.env.LAB_SSLIP_DOMAIN || 'sslip.io';
const SCHEME = process.env.LAB_PUBLIC_SCHEME || 'http';

app.use(express.json());

function auth(req, res, next) {
  if (req.headers['x-lab-agent-key'] !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function ipToPublicHost(ip) {
  if (!USE_SSLIP || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip;
  return `${ip.replace(/\./g, '-')}.${SSLIP_DOMAIN}`;
}

function buildTargetUrl(port) {
  const host = ipToPublicHost(HOST_IP);
  return `${SCHEME}://${host}:${port}`;
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  hostIp: HOST_IP,
  publicHost: ipToPublicHost(HOST_IP),
  useSslip: USE_SSLIP,
}));

app.post('/deploy', auth, (req, res) => {
  const { name, image, port, env: envVars, extraPorts } = req.body;
  if (!name || !image || !port) {
    return res.status(400).json({ error: 'name, image, port required' });
  }

  const safeName = String(name).replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 48) || 'lab';
  let safeImage;
  let hostPort;
  let containerPort;
  let safeExtraPorts = [];
  try {
    safeImage = assertSafeDockerImage(image);
    hostPort = assertSafePort(port);
    containerPort = assertSafePort(req.body.containerPort || 80);
    const extraList = Array.isArray(extraPorts) ? extraPorts : [];
    if (extraList.length > 4) throw new Error('Too many extra ports');
    safeExtraPorts = extraList.map((ep) => ({
      hostPort: assertSafePort(ep.hostPort),
      containerPort: assertSafePort(ep.containerPort),
      label: ep.label != null ? String(ep.label).slice(0, 32) : undefined,
    }));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const envArgs = [];
  for (const [k, v] of Object.entries(envVars || {})) {
    if (!k || v == null || !/^[A-Z0-9_]+$/.test(k)) continue;
    envArgs.push('-e', `${k}=${String(v)}`);
  }
  const extraPortArgs = safeExtraPorts.flatMap((ep) => ['-p', `${ep.hostPort}:${ep.containerPort}`]);

  try {
    try {
      execFileSync('docker', ['rm', '-f', safeName], { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
    execFileSync('docker', [
      'run', '-d',
      '--name', safeName,
      '-p', `${hostPort}:${containerPort}`,
      ...extraPortArgs,
      ...envArgs,
      '--restart', 'unless-stopped',
      safeImage,
    ], { stdio: 'pipe' });
    res.json({
      containerId: safeName,
      targetUrl: buildTargetUrl(hostPort),
      hostPort,
      extraPorts: safeExtraPorts,
      publicHost: ipToPublicHost(HOST_IP),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Docker deploy failed' });
  }
});

app.post('/stop', auth, (req, res) => {
  const { containerId } = req.body;
  const safeId = String(containerId || '').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 48);
  if (!safeId) return res.status(400).json({ error: 'containerId required' });
  try {
    execFileSync('docker', ['rm', '-f', safeId], { stdio: 'pipe' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function stripRelayHeaders(headers) {
  const out = { ...headers };
  for (const h of ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade', 'host',
    'x-lab-agent-key', 'x-target-host', 'x-target-port', 'x-forward-path']) {
    delete out[h];
  }
  return out;
}

app.use('/tunnel-relay', auth, (req, res) => {
  const targetHost = req.headers['x-target-host'] || '127.0.0.1';
  const targetPort = parseInt(req.headers['x-target-port'], 10);
  const forwardPath = req.headers['x-forward-path'] || '/';

  if (!Number.isFinite(targetPort)) {
    return res.status(400).json({ error: 'x-target-port required' });
  }

  const headers = stripRelayHeaders(req.headers);
  headers.host = `${targetHost}:${targetPort}`;

  const proxyReq = http.request({
    hostname: targetHost,
    port: targetPort,
    path: forwardPath,
    method: req.method,
    headers,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, stripRelayHeaders(proxyRes.headers));
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: err.message });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[lab-agent] listening on :${PORT}`);
  console.log(`[lab-agent] public host: ${ipToPublicHost(HOST_IP)} (sslip=${USE_SSLIP})`);
});
