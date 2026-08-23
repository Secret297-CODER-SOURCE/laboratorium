// CWE-915: Improperly Controlled Modification of Dynamically-Determined
// Object Attributes (mass assignment) -- authorship spoofing.
//
// server/controllers/recording.controller.js:
//   export async function addNote(req, res) {
//     const note = recordingService.addNote({
//       recordingId: parseInt(req.params.id, 10),
//       userId: req.user.id,
//       ...req.body,                 // <-- spread AFTER the trusted userId
//     });
//   }
// Exactly like the conference-creation controller, the trusted
// `userId: req.user.id` is spread over by `...req.body` if the client
// includes its own `userId` field in the JSON body. recordingService.addNote()
// does not verify that `userId` matches the authenticated caller, and
// inserts whatever value it is given as the note's author.
//
// Impact: any authenticated user can post a note on a recording (see
// recording-idor.test.js for how they can reach ANY recording on the
// platform) that is permanently attributed in the database to a
// completely different, uninvolved user id of their choosing --
// impersonation / forged attribution (e.g. framing a teacher or another
// student for a comment they never wrote). Interestingly this also *locks
// the real attacker out* of editing/deleting their own note afterwards,
// since updateNote()/deleteNote() correctly check `note.user_id !==
// req.user.id` -- but the forged attribution against the victim already
// stands.
//
// Run: node --test adversarial-review/recording-notes-mass-assignment.test.js

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

test('note authorship cannot be spoofed via userId in the request body', async () => {
  const owner = createUserDirect(ctx.db, { email: 'rec.owner2@lab.dev', password: 'Password123!', role: 'student' });
  const attacker = createUserDirect(ctx.db, { email: 'note.attacker@lab.dev', password: 'Password123!', role: 'student' });
  const victim = createUserDirect(ctx.db, { email: 'framed.victim@lab.dev', password: 'Password123!', role: 'teacher' });

  const ownerToken = await loginAs(ctx.baseUrl, owner.email, 'Password123!');
  const attackerToken = await loginAs(ctx.baseUrl, attacker.email, 'Password123!');

  const form = new FormData();
  const fakeVideo = new Blob([Buffer.from('fake webm bytes')], { type: 'video/webm' });
  form.append('recording', fakeVideo, 'lesson.webm');
  form.append('title', 'Some lesson');
  const uploadRes = await fetch(`${ctx.baseUrl}/api/recordings/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: form,
  });
  const uploadData = await uploadRes.json();
  assert.equal(uploadRes.status, 201);
  const recordingId = uploadData.recording.id;

  // attacker posts a note but forges its authorship as `victim` (a teacher
  // who never touched this recording or endpoint).
  const attack = await api(ctx.baseUrl, `/api/recordings/${recordingId}/notes`, {
    method: 'POST',
    token: attackerToken,
    body: {
      content: 'This inflammatory comment was NOT written by the account it is attributed to.',
      userId: victim.id, // <-- overrides req.user.id server-side
    },
  });

  assert.equal(attack.status, 404, 'unrelated attacker cannot write notes on another user\'s recording');

  const ownerNote = await api(ctx.baseUrl, `/api/recordings/${recordingId}/notes`, {
    method: 'POST',
    token: ownerToken,
    body: {
      content: 'Owner note with spoofed userId in the body',
      userId: victim.id,
    },
  });
  assert.equal(ownerNote.status, 201, JSON.stringify(ownerNote.data));
  assert.equal(ownerNote.data.note.user_id, owner.id, 'note authorship stays with the authenticated caller');
  assert.notEqual(ownerNote.data.note.user_id, victim.id);
});
