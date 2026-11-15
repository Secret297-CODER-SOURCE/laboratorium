import { randomBytes, createHash } from 'crypto';
import db from '../db/index.js';
import config from '../config/index.js';
import { encryptSecret, decryptSecret } from './token-crypto.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const flows = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of flows) {
    if (v.expiresAt <= now) flows.delete(k);
  }
}

function providerConfig(provider) {
  if (provider === 'github') return { ...config.gitOAuth.github, provider: 'github' };
  if (provider === 'gitlab') return { ...config.gitOAuth.gitlab, provider: 'gitlab' };
  throw new ValidationError('Невідомий Git-провайдер');
}

export function providersStatus() {
  const gh = config.gitOAuth.github;
  const gl = config.gitOAuth.gitlab;
  return {
    github: { enabled: !!(gh.clientId && gh.clientSecret) },
    gitlab: { enabled: !!(gl.clientId && gl.clientSecret) },
  };
}

export function listAccounts(userId) {
  return db.prepare(`
    SELECT id, provider, external_user_id, username, scopes, linked_at, updated_at
    FROM user_git_accounts WHERE user_id = ? ORDER BY provider
  `).all(userId);
}

export function getAccount(userId, provider) {
  return db.prepare(`
    SELECT * FROM user_git_accounts WHERE user_id = ? AND provider = ?
  `).get(userId, provider);
}

export function getAccessToken(userId, provider) {
  const row = getAccount(userId, provider);
  if (!row) return null;
  return decryptSecret(row.access_token_enc);
}

export function unlink(userId, provider) {
  db.prepare('DELETE FROM user_git_accounts WHERE user_id = ? AND provider = ?').run(userId, provider);
  return { ok: true };
}

export function startOAuth(provider, userId) {
  const cfg = providerConfig(provider);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new ValidationError(`${provider} OAuth не налаштовано`);
  }
  prune();
  const state = randomBytes(24).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  flows.set(state, {
    provider,
    userId,
    verifier,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  if (provider === 'github') {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: 'repo read:user',
      state,
      allow_signup: 'false',
    }).toString();
    return { url, state };
  }

  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL(`${cfg.baseUrl.replace(/\/+$/, '')}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'api read_user write_repository',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return { url, state };
}

async function exchangeGithub(code) {
  const cfg = config.gitOAuth.github;
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!data.access_token) throw new ValidationError(data.error_description || 'GitHub token exchange failed');
  const meRes = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${data.access_token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'laboratorium-school',
    },
    signal: AbortSignal.timeout(15000),
  });
  const me = await meRes.json();
  if (!me.id) throw new ValidationError('Не вдалося отримати профіль GitHub');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    scopes: data.scope || 'repo,read:user',
    externalUserId: String(me.id),
    username: me.login,
  };
}

async function exchangeGitlab(code, verifier) {
  const cfg = config.gitOAuth.gitlab;
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!data.access_token) throw new ValidationError(data.error_description || 'GitLab token exchange failed');
  const meRes = await fetch(`${base}/api/v4/user`, {
    headers: { authorization: `Bearer ${data.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  const me = await meRes.json();
  if (!me.id) throw new ValidationError('Не вдалося отримати профіль GitLab');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    scopes: 'api read_user write_repository',
    externalUserId: String(me.id),
    username: me.username,
  };
}

function saveAccount(userId, provider, payload) {
  db.prepare(`
    INSERT INTO user_git_accounts (
      user_id, provider, external_user_id, username, access_token_enc, refresh_token_enc, scopes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, provider) DO UPDATE SET
      external_user_id = excluded.external_user_id,
      username = excluded.username,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      scopes = excluded.scopes,
      updated_at = datetime('now')
  `).run(
    userId,
    provider,
    payload.externalUserId,
    payload.username,
    encryptSecret(payload.accessToken),
    payload.refreshToken ? encryptSecret(payload.refreshToken) : null,
    payload.scopes,
  );
}

export async function completeOAuth(provider, query) {
  const state = String(query.state || '');
  const code = String(query.code || '');
  const flow = flows.get(state);
  flows.delete(state);
  if (!flow || flow.provider !== provider || flow.expiresAt <= Date.now() || !code) {
    throw new ValidationError('OAuth сесію зіпсовано або прострочено');
  }
  const payload = provider === 'github'
    ? await exchangeGithub(code)
    : await exchangeGitlab(code, flow.verifier);
  saveAccount(flow.userId, provider, payload);
  return { userId: flow.userId, username: payload.username, provider };
}

export function requireAccount(userId, provider) {
  const row = getAccount(userId, provider);
  if (!row) throw new NotFoundError(`Спочатку підключіть ${provider}`);
  return row;
}
