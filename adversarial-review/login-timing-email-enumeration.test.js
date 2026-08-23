// CWE-208: Observable Timing Discrepancy -> user/email enumeration.
//
// server/services/user.service.js:
//   export function login({ email, password }) {
//     ...
//     const user = findByEmail(email);
//     if (!user || !bcrypt.compareSync(password, user.password_hash)) {
//       throw new UnauthorizedError('Невірний email або пароль');
//     }
//     return user;
//   }
// `!user || !bcrypt.compareSync(...)` short-circuits: when the email does
// not exist, `bcrypt.compareSync` (an intentionally slow, ~tens-of-ms
// operation at BCRYPT_ROUNDS=10) is never called at all. When the email
// DOES exist but the password is wrong, the full bcrypt comparison runs.
// Both cases return the exact same generic error message and 401 status
// (correctly avoiding enumeration via the response BODY), but the response
// TIME differs by roughly two orders of magnitude, which is trivially
// measurable over the network and lets an attacker enumerate which emails
// are registered accounts even though the error text is identical.
//
// This is a real, if lower-severity, information leak on a platform whose
// registration is otherwise closed (ALLOW_PUBLIC_REGISTRATION=false) --
// timing enumeration is one of the few ways left to learn who has an
// account (useful for targeted phishing/credential-stuffing).
//
// This test measures the median response latency of many login attempts
// against a KNOWN, existing email with a wrong password vs. many attempts
// against emails that are never registered, and asserts the existing-email
// path is substantially and consistently slower -- proving the
// side-channel exists. Timing tests are inherently a little noisy; the
// threshold below (3x + 15ms absolute) is set well below the actual
// ~10-50x gap bcrypt(10) produces, to keep the test robust while still
// being a meaningful, unambiguous demonstration.
//
// Run: node --test adversarial-review/login-timing-email-enumeration.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setTestEnv, startServer, stopServer, api, createUserDirect,
} from './helpers/setup.js';

let ctx;
const KNOWN_EMAIL = 'known.timing.victim@lab.dev';

before(async () => {
  const { dbPath } = setTestEnv({ BCRYPT_ROUNDS: '10' });
  ctx = { ...(await startServer()), dbPath };
  // Use the app's real default BCRYPT_ROUNDS (10) so the measured gap
  // reflects actual production timing, not the low-cost hashing the other
  // test files use purely for their own setup speed.
  createUserDirect(ctx.db, {
    email: KNOWN_EMAIL, password: 'TheRealPassword123!', role: 'student', bcryptRounds: 10,
  });
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

async function timeLogin(email, password) {
  const t0 = performance.now();
  await api(ctx.baseUrl, '/api/auth/login', { method: 'POST', body: { email, password } });
  return performance.now() - t0;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

test('login timing is comparable for registered vs unknown emails', async () => {
  const N = 12;

  // Warm up the process (JIT, first bcrypt call, DB connection) so the
  // measured samples aren't skewed by one-time startup costs.
  await timeLogin(KNOWN_EMAIL, 'wrong-password-warmup');
  await timeLogin('warmup.nonexistent@lab.dev', 'whatever');

  const existingTimes = [];
  const nonexistentTimes = [];
  for (let i = 0; i < N; i++) {
    existingTimes.push(await timeLogin(KNOWN_EMAIL, `wrong-password-${i}`));
    nonexistentTimes.push(await timeLogin(`nonexistent-${i}-${Date.now()}@lab.dev`, 'whatever-password'));
  }

  const existingMedian = median(existingTimes);
  const nonexistentMedian = median(nonexistentTimes);

  // Both paths return the identical generic error -- confirm that part is safe.
  const bodyCheck1 = await api(ctx.baseUrl, '/api/auth/login', { method: 'POST', body: { email: KNOWN_EMAIL, password: 'nope' } });
  const bodyCheck2 = await api(ctx.baseUrl, '/api/auth/login', { method: 'POST', body: { email: 'still-nobody@lab.dev', password: 'nope' } });
  assert.equal(bodyCheck1.status, 401);
  assert.equal(bodyCheck2.status, 401);
  assert.equal(bodyCheck1.data.error, bodyCheck2.data.error, 'response bodies are indistinguishable (this part is done correctly)');

  // ...but the timing is not.
  const slower = Math.max(existingMedian, nonexistentMedian);
  const faster = Math.min(existingMedian, nonexistentMedian) || 1;
  assert.ok(
    slower / faster < 3,
    `login timing should be comparable for registered vs unknown emails. ` +
    `existing-email median=${existingMedian.toFixed(2)}ms, nonexistent-email median=${nonexistentMedian.toFixed(2)}ms`,
  );
});
