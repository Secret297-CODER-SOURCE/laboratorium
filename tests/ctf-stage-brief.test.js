import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setTestEnv, startServer, stopServer, api, createUserDirect,
} from '../adversarial-review/helpers/setup.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('completed CTF stages keep an expandable brief of the previous prompt', () => {
  const js = read('public/dashboard.js');
  const css = read('public/dashboard.css');
  const en = read('public/i18n-en.js');

  assert.match(js, /function renderCtfStageBrief/);
  assert.match(js, /class="ctf-stage-brief"/);
  assert.match(js, /renderCtfStageBrief\(s, \{ open: true \}\)/);
  assert.match(js, /Умова етапу/);
  assert.match(js, /c\.completed \? `<p class="ctf-all-done/);
  assert.match(js, /\$\{renderCtfStageChain\(c\)\}/);
  assert.doesNotMatch(js, /c\.completed\s*\?[\s\S]{0,220}Усі стадії пройдено[\s\S]{0,80}: renderCtfStageChain/);

  assert.match(css, /\.ctf-stage-brief\s*\{/);
  assert.match(css, /\.ctf-stage-brief-toggle\s*\{/);
  assert.match(en, /'Умова етапу': 'Stage brief'/);
});

test('API still returns previous-stage descriptions after they are solved', async (t) => {
  const { dbPath } = setTestEnv({
    ALLOW_PUBLIC_REGISTRATION: 'false',
    OWNER_EMAIL: 'ctf.brief.owner@lab.dev',
    OWNER_PASSWORD: 'CtfBriefOwnerPassword123!',
  });
  const ctx = { ...(await startServer()), dbPath };
  t.after(async () => stopServer(ctx.server, ctx.dbPath));

  const student = createUserDirect(ctx.db, {
    email: 'ctf.brief.student@lab.dev',
    password: 'Password123!',
    role: 'student',
    handle: 'ctf_brief_student',
  });
  const token = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { login: student.email, password: 'Password123!' },
  })).data.token;

  const list = await api(ctx.baseUrl, '/api/lab/ctf', { token });
  assert.equal(list.status, 200, JSON.stringify(list.data));
  const challenge = (list.data.challenges || []).find((c) => c.slug === 'osint-synthetic-archive');
  assert.ok(challenge, 'seeded OSINT multi-stage challenge exists');
  assert.ok(challenge.stages.length >= 3);

  const first = challenge.stages[0];
  const second = challenge.stages[1];
  const last = challenge.stages[challenge.stages.length - 1];
  assert.equal(first.completed, false);
  assert.ok(first.description);
  assert.equal(second.description, null);

  const submit = await api(ctx.baseUrl, `/api/lab/ctf/${challenge.id}/flag`, {
    method: 'POST',
    token,
    body: { stageId: first.id, flag: 'lab{archive_2026-04-09}' },
  });
  assert.equal(submit.status, 200, JSON.stringify(submit.data));
  assert.equal(submit.data.ok, true);

  const after = await api(ctx.baseUrl, '/api/lab/ctf', { token });
  const updated = (after.data.challenges || []).find((c) => c.id === challenge.id);
  const done = updated.stages.find((s) => s.id === first.id);
  const next = updated.stages.find((s) => s.id === second.id);
  const locked = updated.stages.find((s) => s.id === last.id);

  assert.equal(done.completed, true);
  assert.match(String(done.description || ''), /2026-04-09/);
  assert.equal(next.unlocked, true);
  assert.ok(next.description);
  assert.equal(locked.unlocked, false);
  assert.equal(locked.description, null);
});
