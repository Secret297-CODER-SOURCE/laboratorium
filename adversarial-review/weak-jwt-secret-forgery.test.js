// Regression: JWT_SECRET must be set and must not be a published default.
// A missing secret refuses to start; a token signed with the old fallback
// string is rejected when a real secret is configured.
//
// Run: node --test adversarial-review/weak-jwt-secret-forgery.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';
import { setTestEnv, startServer, stopServer, api } from './helpers/setup.js';

const KNOWN_DEFAULT_SECRET = 'lab-dev-secret-change-in-production';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

let ctx;

before(async () => {
  const { dbPath } = setTestEnv({});
  ctx = { ...(await startServer()), dbPath };
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

test('loading config without JWT_SECRET throws (isolated process)', () => {
  const script = `
    process.env.JWT_SECRET = '';
    process.env.NODE_ENV = 'test';
    import('./server/config/index.js').then(() => process.exit(0)).catch((e) => {
      process.stderr.write(String(e.message || e));
      process.exit(/JWT_SECRET/.test(String(e.message || e)) ? 2 : 1);
    });
  `;
  const r = spawnSync(process.execPath, ['-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, JWT_SECRET: '' },
  });
  assert.equal(r.status, 2, `expected config to reject missing JWT_SECRET, got ${r.status}: ${r.stderr}`);
});

test('a forged token signed with the well-known fallback secret is rejected', async () => {
  const forged = jwt.sign(
    { id: 999999, email: 'attacker@evil.example', role: 'developer' },
    KNOWN_DEFAULT_SECRET,
    { expiresIn: '1h' },
  );
  const res = await api(ctx.baseUrl, '/api/admin/users', { token: forged });
  assert.equal(res.status, 401);
});

test('forged owner token signed with the fallback secret cannot reach Proxmox settings', async () => {
  const forged = jwt.sign(
    { id: 999999, email: 'attacker@evil.example', role: 'owner' },
    KNOWN_DEFAULT_SECRET,
    { expiresIn: '1h' },
  );
  const res = await api(ctx.baseUrl, '/api/admin/settings/proxmox', { token: forged });
  assert.equal(res.status, 401);
});
