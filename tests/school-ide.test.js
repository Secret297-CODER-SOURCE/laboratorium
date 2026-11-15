import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setTestEnv, startServer, stopServer, api, createUserDirect,
} from '../adversarial-review/helpers/setup.js';

let ctx;
let owner;
let student;
let ownerToken;
let studentToken;
let encryptSecret;
let decryptSecret;
let parseAllowedRemoteUrl;

before(async () => {
  const { dbPath } = setTestEnv({
    ALLOW_PUBLIC_REGISTRATION: 'false',
    GIT_TOKEN_ENCRYPTION_KEY: 'test-git-token-key-school-ide',
    GITHUB_CLIENT_ID: 'gh-test-id',
    GITHUB_CLIENT_SECRET: 'gh-test-secret',
  });
  ctx = { ...(await startServer()), dbPath };
  ({ encryptSecret, decryptSecret } = await import('../server/services/token-crypto.service.js'));
  ({ parseAllowedRemoteUrl } = await import('../server/services/git-remote.service.js'));
  owner = createUserDirect(ctx.db, {
    email: 'ide.owner@lab.dev', password: 'Password123!', role: 'owner', handle: 'ide_owner',
  });
  student = createUserDirect(ctx.db, {
    email: 'ide.student@lab.dev', password: 'Password123!', role: 'student', handle: 'ide_student',
  });
  ownerToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: owner.email, password: 'Password123!' },
  })).data.token;
  studentToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: student.email, password: 'Password123!' },
  })).data.token;
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

test('token encrypt/decrypt roundtrip', () => {
  const plain = 'gho_test_token_value_123';
  const enc = encryptSecret(plain);
  assert.notEqual(enc, plain);
  assert.match(enc, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(decryptSecret(enc), plain);
});

test('git remote URL allowlist', () => {
  const gh = parseAllowedRemoteUrl('https://github.com/org/repo.git');
  assert.equal(gh.provider, 'github');
  assert.ok(gh.url.includes('github.com'));
  const gl = parseAllowedRemoteUrl('https://gitlab.com/group/proj');
  assert.equal(gl.provider, 'gitlab');
  assert.throws(() => parseAllowedRemoteUrl('https://evil.example/repo.git'));
  assert.throws(() => parseAllowedRemoteUrl('git@github.com:org/repo.git'));
  assert.throws(() => parseAllowedRemoteUrl('https://user:pass@github.com/org/repo.git'));
});

test('git oauth accounts endpoint + providers status', async () => {
  const res = await api(ctx.baseUrl, '/api/git-oauth/accounts', { token: ownerToken });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.accounts));
  assert.equal(res.data.providers.github.enabled, true);
  assert.equal(res.data.providers.gitlab.enabled, false);
});

test('git oauth start returns authorize url', async () => {
  const res = await api(ctx.baseUrl, '/api/git-oauth/github/start', { token: ownerToken });
  assert.equal(res.status, 200);
  assert.ok(String(res.data.url).includes('github.com/login/oauth/authorize'));
  assert.ok(String(res.data.url).includes('client_id=gh-test-id'));
});

test('circuit project CRUD + diagnose from template', async () => {
  const created = await api(ctx.baseUrl, '/api/circuits/projects', {
    token: ownerToken,
    method: 'POST',
    body: { template: 'blink', title: 'Blink test' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.project.kind, 'wokwi');
  assert.ok(created.data.project.metadata?.diagram);

  const id = created.data.project.id;
  const list = await api(ctx.baseUrl, '/api/circuits/projects', { token: ownerToken });
  assert.ok(list.data.projects.some((p) => p.id === id));

  const diag = await api(ctx.baseUrl, `/api/circuits/projects/${id}/diagnose`, { token: ownerToken });
  assert.equal(diag.status, 200);
  assert.ok(Array.isArray(diag.data.checks));
  assert.ok(diag.data.checks.some((c) => c.id === 'has_led' && c.pass));

  const forbidden = await api(ctx.baseUrl, `/api/circuits/projects/${id}`, { token: studentToken });
  assert.equal(forbidden.status, 403);

  const del = await api(ctx.baseUrl, `/api/circuits/projects/${id}`, {
    token: ownerToken,
    method: 'DELETE',
  });
  assert.equal(del.status, 200);
});

test('web workspace create with template', async () => {
  const res = await api(ctx.baseUrl, '/api/code/workspaces', {
    token: ownerToken,
    method: 'POST',
    body: { name: 'Landing demo', language: 'web', template: 'landing' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.workspace.language, 'web');
  assert.ok(res.data.workspace.files.some((f) => f.path === 'index.html'));
  assert.ok(res.data.workspace.files.some((f) => f.path === 'README.md'));
});

test('tab access includes dash.code and dash.circuits', async () => {
  const res = await api(ctx.baseUrl, '/api/tab-access', { token: ownerToken });
  assert.equal(res.status, 200);
  assert.ok(res.data.allowed.includes('dash.code'));
  assert.ok(res.data.allowed.includes('dash.circuits'));
});
