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
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

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
  const { name, image, port, env: envVars } = req.body;
  if (!name || !image || !port) {
    return res.status(400).json({ error: 'name, image, port required' });
  }

  const safeName = String(name).replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 48);
  const containerPort = parseInt(req.body.containerPort, 10) || 80;
  const envFlags = Object.entries(envVars || {})
    .filter(([k, v]) => k && v != null && String(k).match(/^[A-Z0-9_]+$/))
    .map(([k, v]) => `-e ${k}=${String(v).replace(/"/g, '\\"')}`)
    .join(' ');

  try {
    execSync(`docker rm -f ${safeName} 2>/dev/null || true`, { stdio: 'ignore' });
    execSync(
      `docker run -d --name ${safeName} -p ${port}:${containerPort} ${envFlags} --restart unless-stopped ${image}`,
      { stdio: 'pipe' },
    );
    res.json({
      containerId: safeName,
      targetUrl: buildTargetUrl(port),
      hostPort: port,
      publicHost: ipToPublicHost(HOST_IP),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Docker deploy failed' });
  }
});

app.post('/stop', auth, (req, res) => {
  const { containerId } = req.body;
  if (!containerId) return res.status(400).json({ error: 'containerId required' });
  try {
    execSync(`docker rm -f ${containerId}`, { stdio: 'pipe' });
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
