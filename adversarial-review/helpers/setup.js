// Shared test harness for the adversarial security review.
//
// Spins up a real instance of the Laboratorium Express app (server/app.js)
// against a disposable, per-test SQLite database under adversarial-review/tmp-db/
// (NEVER the real laboratorium.db at the repo root). Each test file sets
// process.env BEFORE importing this module's startServer()/statically importing
// any server/* code, because server/config/index.js and server/db/index.js read
// process.env at import time (module-level side effects) and are only ever
// imported once per process.
//
// Run each test file individually, e.g.:
//   node --test adversarial-review/hardcoded-default-credentials.test.js

import http from 'http';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const scratchDbDir = join(__dirname, '..', 'tmp-db');
if (!existsSync(scratchDbDir)) mkdirSync(scratchDbDir, { recursive: true });

export function randSuffix() {
  return randomBytes(6).toString('hex');
}

/**
 * Sets process.env for a fresh, isolated app instance. Must be called before
 * any import of server/* modules (they read env at import time).
 */
export function setTestEnv(overrides = {}) {
  const suffix = randSuffix();
  const dbPath = join(scratchDbDir, `test-${suffix}.db`);
  const defaults = {
    NODE_ENV: 'test',
    DATABASE_PATH: dbPath,
    SEED_DATABASE: 'true',
    JWT_SECRET: `test-only-secret-${suffix}`,
    JWT_EXPIRES_IN: '7d',
    PORT: '0',
    HOST: '127.0.0.1',
    ALLOW_PUBLIC_REGISTRATION: 'false',
    CORS_ORIGIN: '*',
    LAB_USE_LOCAL_DOCKER: 'false',
    LAB_AGENT_URL: '',
    SMTP_HOST: '',
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    RATE_LIMIT_WINDOW_MS: '900000',
  };
  const merged = { ...defaults, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  return { suffix, dbPath };
}

/** Import + boot the app AFTER setTestEnv() has configured process.env. */
export async function startServer() {
  const { createApp } = await import('../../server/app.js');
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dbModule = await import('../../server/db/index.js');
  return { server, baseUrl, db: dbModule.default };
}

export async function stopServer(server, dbPath) {
  await new Promise((resolve) => server.close(() => resolve()));
  if (dbPath) {
    for (const ext of ['', '-wal', '-shm']) {
      try { rmSync(dbPath + ext); } catch { /* ignore */ }
    }
  }
}

/** Minimal fetch wrapper that talks to the running test app. */
export async function api(baseUrl, path, { method = 'GET', token, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json body */ }
  return { status: res.status, data, headers: res.headers, raw: res };
}

/** Directly insert a user into the throwaway DB (bypasses ALLOW_PUBLIC_REGISTRATION). */
export function createUserDirect(db, {
  email, password, name = 'Test User', handle, role = 'student', billingExempt = true, bountyPoints = 0,
  bcryptRounds = 4, // low rounds by default: tests only, speed. Pass the app's real
  // BCRYPT_ROUNDS (default 10) when a test specifically needs realistic bcrypt timing.
}) {
  const hash = bcrypt.hashSync(password, bcryptRounds);
  const h = handle || `u_${randSuffix()}`;
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, role, bounty_points, billing_exempt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(email.toLowerCase(), hash, name, h, role, bountyPoints, billingExempt ? 1 : 0);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

export async function loginAs(baseUrl, email, password) {
  const res = await api(baseUrl, '/api/auth/login', { method: 'POST', body: { email, password } });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data.token;
}
