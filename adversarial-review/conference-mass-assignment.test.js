// CWE-915: Improperly Controlled Modification of Dynamically-Determined Object Attributes (mass assignment)
//
// server/controllers/conference.controller.js:
//   export async function create(req, res) {
//     const conf = conferenceService.create({
//       hostId: req.user.id,
//       hostRole: req.user.role,
//       ...req.body,                 // <-- spread AFTER the trusted fields
//     });
//   }
// Because the client-supplied `...req.body` is spread AFTER the
// server-derived `hostId`/`hostRole`, any `hostId` or `hostRole` key present
// in the JSON request body silently overrides the authenticated user's real
// id/role for this call. server/services/conference.service.js only
// enforces its "teachers may only create conferences for groups they own"
// rule when `hostRole === 'teacher'`:
//   if (hostRole === 'teacher' && group.teacher_id !== hostId) {
//     throw new ForbiddenError('Можна створювати конференції лише для своїх груп');
//   }
// A caller who is actually a teacher can therefore bypass that ownership
// check outright by sending any other value for `hostRole` in the body
// (e.g. "owner", "x", ""), and can additionally spoof `hostId` to make the
// conference (and its host_user_id) appear to belong to a completely
// different, uninvolved user.
//
// This test proves both:
//  1. teacherB (who owns no groups) creates a conference tied to a group
//     owned by teacherA, purely by setting hostRole to a non-"teacher"
//     string in the request body -- a real authorization bypass.
//  2. teacherB creates a conference whose host_user_id is spoofed to an
//     arbitrary other user id via the same mechanism -- identity spoofing.
//
// Run: node --test adversarial-review/conference-mass-assignment.test.js

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

test('spoofing hostRole in the body does not bypass the must-own-the-group check', async () => {
  const teacherA = createUserDirect(ctx.db, {
    email: 'teacherA@lab.dev', password: 'Password123!', role: 'teacher',
  });
  const teacherB = createUserDirect(ctx.db, {
    email: 'teacherB@lab.dev', password: 'Password123!', role: 'teacher',
  });
  const tokenA = await loginAs(ctx.baseUrl, teacherA.email, 'Password123!');
  const tokenB = await loginAs(ctx.baseUrl, teacherB.email, 'Password123!');

  // teacherA creates a group they own.
  const groupRes = await api(ctx.baseUrl, '/api/admin/groups', {
    method: 'POST', token: tokenA, body: { name: "TeacherA's private group" },
  });
  assert.equal(groupRes.status, 201, JSON.stringify(groupRes.data));
  const groupId = groupRes.data.group.id;
  assert.equal(groupRes.data.group.teacher_id, teacherA.id);

  // Sanity check: teacherB legitimately CANNOT create a conference for this
  // group when hostRole is left untouched (the normal, honest client path).
  const honestAttempt = await api(ctx.baseUrl, '/api/conferences', {
    method: 'POST',
    token: tokenB,
    body: {
      title: 'Honest attempt', scheduledAt: new Date(Date.now() + 3600_000).toISOString(), groupId,
    },
  });
  assert.equal(honestAttempt.status, 403, 'without tampering, teacherB is correctly forbidden from teacherA\'s group');

  // Attack: same request, but spoof hostRole so it no longer equals
  // 'teacher' and the ownership check in conference.service.js is skipped entirely.
  const attack = await api(ctx.baseUrl, '/api/conferences', {
    method: 'POST',
    token: tokenB,
    body: {
      title: 'Hijacked conference in another teacher\'s group',
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      groupId,
      hostRole: 'owner', // <-- spoofed, overrides req.user.role server-side
    },
  });

  assert.equal(attack.status, 403, `spoofed hostRole must not bypass ownership, got ${attack.status}: ${JSON.stringify(attack.data)}`);
});

test('hostId in the body cannot attribute a conference to another user', async () => {
  const teacherB = createUserDirect(ctx.db, {
    email: 'teacherB2@lab.dev', password: 'Password123!', role: 'teacher',
  });
  const victim = createUserDirect(ctx.db, {
    email: 'victim.teacher@lab.dev', password: 'Password123!', role: 'teacher',
  });
  const tokenB = await loginAs(ctx.baseUrl, teacherB.email, 'Password123!');

  const attack = await api(ctx.baseUrl, '/api/conferences', {
    method: 'POST',
    token: tokenB,
    body: {
      title: 'Spoofed host identity',
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      hostRole: 'owner', // also needed: skips the groupId requirement branch for 'teacher'
      hostId: victim.id, // <-- overrides req.user.id
    },
  });

  assert.notEqual(attack.status, 201, `hostId spoof must not create a conference, got ${attack.status}: ${JSON.stringify(attack.data)}`);
  if (attack.data?.conference) {
    assert.notEqual(attack.data.conference.host_user_id, victim.id);
  }
});
