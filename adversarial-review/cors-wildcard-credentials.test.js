// CWE-942: Permissive Cross-domain Policy with Untrusted Domains.
//
// server/app.js:
//   app.use(cors({
//     origin: config.cors.origin === '*' ? true : config.cors.origin.split(','),
//     credentials: true,
//   }));
// server/config/index.js: `cors: { origin: env('CORS_ORIGIN', '*') }` -- '*'
// is the DEFAULT when CORS_ORIGIN is not set in the environment (the
// shipped .env.example correctly sets a specific origin for production,
// but nothing in the app enforces that -- a misconfigured/incomplete .env,
// a docker-compose override that drops the var, or simply running the
// container with defaults reproduces this).
// When config.cors.origin is '*', the `cors` package is given `origin:
// true`, which does NOT send the literal header value "*" -- it dynamically
// REFLECTS whatever Origin header the browser sent back as
// Access-Control-Allow-Origin, while Access-Control-Allow-Credentials is
// always "true". This is the textbook "reflected origin + credentials"
// misconfiguration: it tells every browser that literally any website is
// allowed to make credentialed cross-site requests to this API.
//
// Real-world impact here is reduced (not eliminated) because the app's own
// frontend authenticates with a Bearer JWT stored in localStorage rather
// than cookies (public/auth.js) -- a random third-party site cannot read
// another origin's localStorage, so it can't attach the victim's token by
// itself. However: (a) this remains a real defense-in-depth failure should
// any endpoint ever rely on cookies (or start doing so) or in any
// browser/extension context where the token leaks into a place a
// cross-origin script can reach it, and (b) it is exploitable together
// with the stored-XSS finding (see chat-upload-stored-xss.test.js): a
// script that already runs on this app's own origin (e.g. after chat XSS)
// combined with any credentialed same-site cookie in a future session flow
// would be trivially replayable from anywhere.
//
// This test proves the misconfiguration is live in the default
// configuration (CORS_ORIGIN unset) by sending a request with an
// arbitrary, unrelated Origin header and confirming the server reflects it
// with credentials allowed.
//
// Run: node --test adversarial-review/cors-wildcard-credentials.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTestEnv, startServer, stopServer } from './helpers/setup.js';

let ctx;

before(async () => {
  const { dbPath } = setTestEnv({ CORS_ORIGIN: undefined }); // fall back to config default '*'
  ctx = { ...(await startServer()), dbPath };
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

test('unset CORS_ORIGIN does not reflect an arbitrary Origin with credentials', async () => {
  const evilOrigin = 'https://totally-unrelated-attacker-site.example';

  const res = await fetch(`${ctx.baseUrl}/api/auth/status`, {
    headers: { Origin: evilOrigin },
  });

  const allowOrigin = res.headers.get('access-control-allow-origin');
  const allowCreds = res.headers.get('access-control-allow-credentials');

  assert.equal(res.status, 200);
  assert.notEqual(allowOrigin, evilOrigin, 'unset CORS_ORIGIN must not reflect an arbitrary Origin');
  assert.notEqual(allowCreds, 'true');
});

test('preflight from an arbitrary origin is not approved with credentials', async () => {
  const evilOrigin = 'https://another-random-attacker.example';

  const res = await fetch(`${ctx.baseUrl}/api/admin/users`, {
    method: 'OPTIONS',
    headers: {
      Origin: evilOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });

  assert.notEqual(res.headers.get('access-control-allow-origin'), evilOrigin);
  assert.notEqual(res.headers.get('access-control-allow-credentials'), 'true');
});
