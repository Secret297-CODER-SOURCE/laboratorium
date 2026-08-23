// CWE-798: Use of Hard-coded Credentials
//
// Impact: server/db/seed.js unconditionally (re)creates an 'owner' admin
// account and 'student'/'teacher' test accounts on EVERY server start via
// syncCatalog(db) -- which runs both when SEED_DATABASE=true (seedDatabase
// calls syncCatalog at the end) AND when SEED_DATABASE=false, the setting
// .env.example itself recommends for production ("SEED_DATABASE=false на
// проді — ок"). If the operator does not explicitly set OWNER_EMAIL /
// OWNER_PASSWORD / TEST_STUDENT_PASSWORD / TEST_TEACHER_PASSWORD in their
// real environment, the exact fallback values hardcoded in source
// (server/db/seed.js, and mirrored again in .env.example) are used:
//
//   OWNER_EMAIL    = maks.47.turbo@gmail.com   (the project owner's own email)
//   OWNER_PASSWORD = LaboratoriumOwner2026
//   TEST_STUDENT_EMAIL/PASSWORD = test.student@lab.dev / TestLab2026!
//   TEST_TEACHER_EMAIL/PASSWORD = test.teacher@lab.dev / TestTeacher2026!
//
// Anyone who has read the (this) source tree therefore knows working
// credentials for a top-privilege 'owner' account unless the operator has
// overridden every one of those four env vars. Worse: ensureOwner()/
// ensureTestStudent()/ensureTestTeacher() *upsert* on every boot, resetting
// the password hash and role each time -- so even if an admin notices the
// test accounts and deletes them or changes their password by hand, the
// next server restart silently recreates them with the hardcoded password.
//
// This test proves that a completely fresh instance, booted with NO
// OWNER_*/TEST_*_PASSWORD overrides (exactly like a naive first deploy),
// ends up with a live, working 'owner' (platform-admin) account reachable
// with the plaintext password baked into the repository -- and that this
// account can reach the most sensitive admin endpoint (user management).
//
// This test runs ONLY against a disposable local DB under adversarial-review/tmp-db/.
// It never touches the real repo-root laboratorium.db or laboratorium.club.
//
// Run: node --test adversarial-review/hardcoded-default-credentials.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTestEnv, startServer, stopServer, api } from './helpers/setup.js';

const DEFAULT_OWNER_EMAIL = 'maks.47.turbo@gmail.com';
const DEFAULT_OWNER_PASSWORD = 'LaboratoriumOwner2026';
const DEFAULT_STUDENT_EMAIL = 'test.student@lab.dev';
const DEFAULT_STUDENT_PASSWORD = 'TestLab2026!';
const DEFAULT_TEACHER_EMAIL = 'test.teacher@lab.dev';
const DEFAULT_TEACHER_PASSWORD = 'TestTeacher2026!';

let ctx;

before(async () => {
  // Explicitly unset any OWNER_*/TEST_*_* overrides so seed.js falls back to
  // the hardcoded defaults baked into server/db/seed.js -- this is exactly
  // what happens on a deploy where the operator forgot (or didn't know) to
  // set these in their real .env.
  const { dbPath } = setTestEnv({
    OWNER_EMAIL: '',
    OWNER_PASSWORD: '',
    TEST_STUDENT_EMAIL: '',
    TEST_STUDENT_PASSWORD: '',
    TEST_TEACHER_EMAIL: '',
    TEST_TEACHER_PASSWORD: '',
    SEED_DATABASE: 'true',
  });
  ctx = { ...(await startServer()), dbPath };
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

test('fresh instance does not auto-create an owner account at the old hardcoded email/password', async () => {
  const login = await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: DEFAULT_OWNER_EMAIL, password: DEFAULT_OWNER_PASSWORD },
  });

  assert.equal(login.status, 401, `hardcoded owner credentials must be rejected, got ${login.status}: ${JSON.stringify(login.data)}`);
  assert.equal(login.data.token, undefined);
});

test('fresh instance does not auto-create test student/teacher accounts at hardcoded passwords', async () => {
  const student = await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: DEFAULT_STUDENT_EMAIL, password: DEFAULT_STUDENT_PASSWORD },
  });
  assert.equal(student.status, 401);

  const teacher = await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: DEFAULT_TEACHER_EMAIL, password: DEFAULT_TEACHER_PASSWORD },
  });
  assert.equal(teacher.status, 401);
});
