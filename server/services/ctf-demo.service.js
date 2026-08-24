import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import db from '../db/index.js';
import * as labAgent from './lab-agent.service.js';
import { DEFAULT_FLAGS, DEMO_FLAGS } from './ctf-demo-flags.js';

const demoSessions = new Map();

export { DEFAULT_FLAGS };

export function buildDemoLabUrl({ userId, challengeId, deploymentId, slug }) {
  const token = jwt.sign(
    { userId, challengeId, deploymentId, slug, type: 'ctf-demo' },
    config.jwt.secret,
    { expiresIn: '4h' },
  );
  return `/lab/demo/${slug}?token=${token}`;
}

function fetchDeployment(userId, challengeId) {
  return db.prepare(`
    SELECT cd.*, c.slug, c.title
    FROM ctf_deployments cd
    JOIN challenges c ON c.id = cd.challenge_id
    WHERE cd.user_id = ? AND cd.challenge_id = ?
  `).get(userId, challengeId);
}

function ensureMockDeployment(payload) {
  const port = labAgent.allocatePort(payload.userId * 1000 + payload.challengeId);
  const containerId = `mock-ctf-u${payload.userId}-c${payload.challengeId}`;
  const targetUrl = buildDemoLabUrl(payload);
  const existing = fetchDeployment(payload.userId, payload.challengeId);

  if (existing) {
    db.prepare(`
      UPDATE ctf_deployments SET
        status = 'running',
        host_port = ?,
        container_id = ?,
        target_url = ?,
        expires_at = datetime('now', '+4 hours'),
        error_message = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(port, containerId, targetUrl, existing.id);
    return fetchDeployment(payload.userId, payload.challengeId);
  }

  db.prepare(`
    INSERT INTO ctf_deployments (user_id, challenge_id, host_port, status, container_id, target_url, expires_at)
    VALUES (?, ?, ?, 'running', ?, ?, datetime('now', '+4 hours'))
  `).run(payload.userId, payload.challengeId, port, containerId, targetUrl);

  return fetchDeployment(payload.userId, payload.challengeId);
}

export function verifyDemoToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.type !== 'ctf-demo') return null;

    const challenge = db.prepare(`
      SELECT id, slug, title FROM challenges
      WHERE id = ? AND is_active = 1 AND ctf_enabled = 1
    `).get(payload.challengeId);
    if (!challenge || challenge.slug !== payload.slug) return null;

    const mock = !labAgent.isAgentEnabled();

    if (mock) {
      let row = fetchDeployment(payload.userId, payload.challengeId);
      if (!row || row.status !== 'running') {
        row = ensureMockDeployment(payload);
      }
      return { ...payload, deployment: row };
    }

    let row = db.prepare(`
      SELECT cd.*, c.slug, c.title
      FROM ctf_deployments cd
      JOIN challenges c ON c.id = cd.challenge_id
      WHERE cd.user_id = ? AND cd.challenge_id = ?
    `).get(payload.userId, payload.challengeId);

    if (!row || row.slug !== payload.slug) return null;
    if (row.status !== 'running') return null;

    return { ...payload, deployment: row };
  } catch {
    return null;
  }
}

export function getDemoSessionKey(ctx) {
  return `${ctx.userId}:${ctx.deploymentId}`;
}

export function getDemoSession(ctx) {
  const key = getDemoSessionKey(ctx);
  if (!demoSessions.has(key)) demoSessions.set(key, { comments: [], nmapHostsFound: false });
  return demoSessions.get(key);
}

export function getExpectedFlag(slug) {
  return DEMO_FLAGS[slug] || null;
}
