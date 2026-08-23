// CWE-841 (Improper Enforcement of Behavioral Workflow) / CWE-798-style
// flag oracle -- the "grading" flags are not actually secret from the
// player, defeating the entire point of the CTF scoring system.
//
// server/services/ctf-demo-flags.js hardcodes plaintext flags:
//   'sql-injection': 'lab{sqli_master}', 'buffer-overflow': 'lab{stack_smash}', ...
// server/db/seed.js seeds real, bounty-earning challenges with these EXACT
// slugs (nmap-scan, sql-injection, xss-stored, buffer-overflow,
// malware-static, python-port-scanner, ghidra-crackme, priv-esc-linux).
// server/services/ctf.service.js ensureCtfMetadata() bcrypt-hashes these
// same DEFAULT_FLAGS values into challenges.flag_hash / challenge_stages
// .flag_hash -- i.e. the flag a student must submit to
// POST /api/lab/ctf/:id/flag to earn real bounty points IS one of these
// hardcoded constants.
//
// Whenever the lab-agent/Proxmox infrastructure isn't configured (the
// default -- labAgent.isAgentEnabled() is false unless LAB_AGENT_URL or
// LAB_USE_LOCAL_DOCKER is set), starting a challenge
// (POST /api/lab/ctf/:id/start) hands the student a "mock demo" URL under
// /lab/demo/<slug> (server/controllers/ctf-demo.controller.js). Several of
// these mock pages reveal the SAME plaintext flag directly in the HTTP
// response after a trivial, non-representative trigger that requires no
// real exploitation skill, e.g.:
//   - sql-injection: username "admin"/password "admin" (no injection needed)
//   - buffer-overflow: any input string longer than 32 characters
//   - priv-esc-linux: any command containing the substring "root"
//   - ghidra-crackme: the password is printed in the page's own hint text
//
// Impact: any authenticated student can claim full bounty for ALL 8 seeded
// CTF challenges (1130 points total) without performing any real exploit,
// by reading the flag straight out of the demo page's HTTP response and
// resubmitting it to the real scoring endpoint. This test proves the full
// round trip for one challenge (sql-injection, 100 pts): start it, trigger
// the trivial demo condition, scrape the flag from the HTML, submit it to
// the real /api/lab/ctf/:id/flag endpoint, and confirm bounty was awarded.
//
// Run: node --test adversarial-review/ctf-flag-oracle.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setTestEnv, startServer, stopServer, api, createUserDirect, loginAs,
} from './helpers/setup.js';

let ctx;

before(async () => {
  const { dbPath } = setTestEnv({});
  ctx = { ...(await startServer()), dbPath };
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

test('mock demo pages do not reveal scoring flags or award bounty', async () => {
  const student = createUserDirect(ctx.db, {
    email: 'ctf.farmer@lab.dev',
    password: 'Password123!',
    role: 'student',
    billingExempt: true,
  });
  const token = await loginAs(ctx.baseUrl, student.email, 'Password123!');

  const before0 = await api(ctx.baseUrl, '/api/auth/me', { token });
  const startingBounty = before0.data.user.bounty_points;

  // 1. Discover the real, seeded "sql-injection" challenge (100 bounty pts)
  const list = await api(ctx.baseUrl, '/api/lab/ctf', { token });
  assert.equal(list.status, 200);
  const challenge = list.data.challenges.find((c) => c.slug === 'sql-injection');
  assert.ok(challenge, 'seeded sql-injection challenge exists');
  const stageId = challenge.stages[0].id;
  assert.equal(challenge.bounty_reward, 100);

  // 2. Start it through the real, intended API (no infra configured -> mock demo mode)
  const start = await api(ctx.baseUrl, `/api/lab/ctf/${challenge.id}/start`, { method: 'POST', token });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  assert.equal(start.data.deployment.mock, true, 'infra not configured in this test env -> mock demo mode, the realistic default');
  const demoUrl = start.data.deployment.target_url;
  assert.match(demoUrl, /^\/lab\/demo\/sql-injection\?token=/);

  // 3. Trigger the trivial, non-representative "solve" condition of the
  // mock demo (plain admin/admin login -- not an actual SQL injection).
  const demoLoginRes = await fetch(`${ctx.baseUrl}${demoUrl.replace('/lab/demo/sql-injection', '/lab/demo/sql-injection/login')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=admin&password=admin',
  });
  const demoHtml = await demoLoginRes.text();
  assert.equal(demoLoginRes.status, 200);

  // 4. Scrape the plaintext flag straight out of the HTTP response body --
  // no exploitation, no infra access, just reading the page the server sent us.
  const match = demoHtml.match(/<div class="flag-box">[\s\S]*?<code>([^<]+)<\/code>/);
  const scrapedFlag = match?.[1] || '';
  assert.notEqual(scrapedFlag, 'lab{sqli_master}', 'demo must not reveal the real scoring flag');

  const submitScraped = scrapedFlag
    ? await api(ctx.baseUrl, `/api/lab/ctf/${challenge.id}/flag`, {
      method: 'POST',
      token,
      body: { stageId, flag: scrapedFlag },
    })
    : { status: 400, data: {} };
  if (scrapedFlag) {
    assert.notEqual(submitScraped.data?.bounty_earned, 100);
    assert.notEqual(submitScraped.data?.ok, true);
  }

  const after0 = await api(ctx.baseUrl, '/api/auth/me', { token });
  assert.equal(after0.data.user.bounty_points, startingBounty, 'demo path must not award scoring bounty');
});
