// CWE-639: Authorization Bypass Through User-Controlled Key (IDOR) /
// Missing Function Level Access Control.
//
// server/services/recording.service.js:
//   export function list({ userId, conferenceId } = {}) {
//     let sql = `SELECT ... FROM recordings r ... WHERE 1=1`;
//     const params = [];
//     if (conferenceId) { sql += ' AND r.conference_id = ?'; params.push(conferenceId); }
//     ...
//   }
// `userId` is accepted as a parameter (server/controllers/recording.controller.js
// passes `req.user.id` in) but is NEVER used to filter the query -- every
// recording on the platform is returned to every caller. Likewise getById(),
// used by both GET /api/recordings/:id and GET /api/recordings/:id/stream
// and getNotes()/addNote(), performs no group-membership or
// conference-participant check at all -- only `remove()` checks
// `uploaded_by`. server/routes/recording.routes.js gates the whole router
// on nothing more than authRequired + requirePlatformAccess (paid access)
// + requireTab('page.recordings') (allowed for every role by default) --
// there is no per-recording ownership or group-membership check anywhere
// on the read path.
//
// Impact: any authenticated, paying student can list, stream/download, and
// read the private notes of EVERY recording on the platform -- including
// recordings from conferences/groups they were never a participant of --
// simply by knowing (or incrementing) a numeric recording id. They can also
// write arbitrary notes on any recording (see the companion
// recording-notes-mass-assignment.test.js for how the *author* of those
// notes can additionally be spoofed).
//
// This test has userA (in "Group A") upload a private lesson recording,
// then has userB, an unrelated student with no shared group/conference with
// userA, list all recordings, fetch userA's recording by id, stream its
// bytes, and read+add notes on it -- none of which should succeed for an
// unrelated user in a properly scoped system.
//
// Run: node --test adversarial-review/recording-idor.test.js

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

test('an unrelated student cannot list, stream or annotate another user\'s recording', async () => {
  const userA = createUserDirect(ctx.db, { email: 'owner.recording@lab.dev', password: 'Password123!', role: 'student' });
  const userB = createUserDirect(ctx.db, { email: 'stranger@lab.dev', password: 'Password123!', role: 'student' });
  const tokenA = await loginAs(ctx.baseUrl, userA.email, 'Password123!');
  const tokenB = await loginAs(ctx.baseUrl, userB.email, 'Password123!');

  // userA uploads a "private" lesson recording via the real endpoint.
  const form = new FormData();
  const fakeVideo = new Blob([Buffer.from('fake webm bytes for test')], { type: 'video/webm' });
  form.append('recording', fakeVideo, 'lesson.webm');
  form.append('title', 'Private 1:1 mentoring session');

  const uploadRes = await fetch(`${ctx.baseUrl}/api/recordings/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: form,
  });
  const uploadData = await uploadRes.json();
  assert.equal(uploadRes.status, 201, JSON.stringify(uploadData));
  const recordingId = uploadData.recording.id;

  const listRes = await api(ctx.baseUrl, '/api/recordings', { token: tokenB });
  assert.equal(listRes.status, 200);
  assert.ok(
    !listRes.data.recordings.some((r) => r.id === recordingId),
    'unrelated user must not see another user\'s private recording',
  );

  const getRes = await api(ctx.baseUrl, `/api/recordings/${recordingId}`, { token: tokenB });
  assert.equal(getRes.status, 404);

  const streamRes = await fetch(`${ctx.baseUrl}/api/recordings/${recordingId}/stream`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(streamRes.status, 404);

  const addNoteRes = await api(ctx.baseUrl, `/api/recordings/${recordingId}/notes`, {
    method: 'POST', token: tokenB, body: { content: 'A stranger was here.' },
  });
  assert.equal(addNoteRes.status, 404);
});
