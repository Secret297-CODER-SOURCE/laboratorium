// CWE-78: OS Command Injection
//
// server/services/lab-agent.service.js -> localDockerDeploy():
//   execSync(
//     `docker run -d --name ${safeName} -p ${port}:${containerPort} ${envFlags} --restart unless-stopped ${image}`,
//     { stdio: 'pipe' },
//   );
// `safeName` is sanitized to [a-zA-Z0-9-_]. `image` is NOT sanitized at all
// -- it is the raw `image` field from the authenticated request body of
// POST /api/lab/docker/deploy (server/controllers/lab.controller.js
// deployDocker -> server/services/lab.service.js deployDocker), only
// checked for non-emptiness (`imageName?.trim()`). It is concatenated
// directly into a shell command string executed via execSync(), which runs
// through /bin/sh -c on POSIX systems, so shell metacharacters in `image`
// (`;`, `` ` ``, `$()`, `|`, `#`) are interpreted by the shell.
//
// Impact: ANY authenticated user with role 'student' (the default, lowest
// role, requires only dash.lab tab access which is unrestricted by
// default) can execute arbitrary OS commands as the Node process user --
// full remote code execution on the host -- whenever the operator has
// LAB_USE_LOCAL_DOCKER=true (an explicit, documented, opt-in feature for
// running CTF containers locally without a separate lab-agent VM; see
// .env.example: "Локальний Docker для CTF"). No Docker binary needs to
// actually be present or succeed for the injected command to run, because
// the shell executes every `;`-separated command regardless of the
// preceding command's exit status.
//
// NOTE on how this PoC is structured: the HTTP endpoint
// POST /api/lab/docker/deploy currently throws a 400 before ever reaching
// the vulnerable execSync() line, but for an UNRELATED reason: deployDocker()
// calls labAgent.deployContainer({ name, image, port }) without an `env`
// key, so deployContainer's own `env: envVars = null` default kicks in and
// it forwards `env: null` to localDockerDeploy(); localDockerDeploy's
// `env: envVars = {}` default then does NOT fire (JS defaults only apply to
// `undefined`, not `null`), so `dockerEnvFlags(null)` throws
// "Cannot convert undefined or null to object" first. This is a separate,
// incidental null-handling bug (CWE-476-ish, not a security control) that
// happens to short-circuit this one call path -- it neutralizes nothing
// about the injection itself, it just crashes one line earlier. This test
// demonstrates that first (proving the bug is real and currently blocks
// the naive end-to-end HTTP call), then calls the exact same
// deployContainer()/localDockerDeploy() code the HTTP endpoint delegates
// to directly with a valid (empty) env object -- exactly as
// server/services/ctf.service.js's own startChallenge() does for its own
// (non-attacker-controlled) image field -- to prove the `image` field
// itself is completely unsanitized and leads to real OS command execution
// the moment that one unrelated null bug is worked around (which any
// caller supplying `env` already does today).
//
// Run: node --test adversarial-review/lab-docker-command-injection.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import {
  setTestEnv, startServer, stopServer, api, createUserDirect, loginAs, scratchDbDir,
} from './helpers/setup.js';

let ctx;
const markerPath = join(scratchDbDir, `pwned-marker-${Date.now()}.txt`);

before(async () => {
  const { dbPath } = setTestEnv({
    // The operator has opted into running CTF containers on the app host
    // itself via local Docker instead of a separate lab-agent VM.
    LAB_USE_LOCAL_DOCKER: 'true',
  });
  ctx = { ...(await startServer()), dbPath };
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
  try { rmSync(markerPath); } catch { /* ignore */ }
});

test('HTTP deploy rejects a shell-metacharacter image before any docker exec', async () => {
  const student = createUserDirect(ctx.db, {
    email: 'student.rce.http@lab.dev', password: 'Password123!', role: 'student', billingExempt: true,
  });
  const token = await loginAs(ctx.baseUrl, student.email, 'Password123!');

  const res = await api(ctx.baseUrl, '/api/lab/docker/deploy', {
    method: 'POST', token, body: { image: `alpine; touch '${markerPath}' #`, name: 'poc-http' },
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Некоректний Docker image|Docker image/i);
  assert.ok(!existsSync(markerPath), 'rejected image must not execute shell');
});

test('deployContainer rejects an injected image and does not execute shell commands', async () => {
  assert.ok(!existsSync(markerPath), 'marker file must not exist before the call');

  const labAgent = await import('../server/services/lab-agent.service.js');
  const payload = `alpine; touch '${markerPath}' #`;

  await assert.rejects(
    () => labAgent.deployContainer({
      name: 'poc-service-level',
      image: payload,
      port: 31999,
      env: {},
    }),
    (err) => /Некоректний Docker image|Docker image/i.test(String(err?.message || err)),
  );

  assert.ok(!existsSync(markerPath), 'injected image must not create a marker file');
});
