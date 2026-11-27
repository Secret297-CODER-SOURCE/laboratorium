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

test('notification click awaits persist before navigating', () => {
  const js = read('public/notifications.js');
  assert.match(js, /await api\(`\/notifications\/\$\{id\}\/read`/);
  assert.match(js, /keepalive: true/);
  assert.match(js, /notif-item--read/);
  const svc = read('server/services/notification.service.js');
  assert.match(svc, /notification:read/);
  assert.match(svc, /read_at IS NULL/);
});

test('marking a notification read survives a subsequent list', async (t) => {
  const { dbPath } = setTestEnv({
    ALLOW_PUBLIC_REGISTRATION: 'false',
    OWNER_EMAIL: 'notif.owner@lab.dev',
    OWNER_PASSWORD: 'NotifOwnerPassword123!',
  });
  const ctx = { ...(await startServer()), dbPath };
  t.after(async () => stopServer(ctx.server, ctx.dbPath));

  const owner = createUserDirect(ctx.db, {
    email: 'notif.owner2@lab.dev', password: 'Password123!', role: 'owner', handle: 'notif_owner',
  });
  const student = createUserDirect(ctx.db, {
    email: 'notif.student@lab.dev', password: 'Password123!', role: 'student', handle: 'notif_student',
  });
  const ownerToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: owner.email, password: 'Password123!' },
  })).data.token;
  const studentToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: student.email, password: 'Password123!' },
  })).data.token;

  const sent = await api(ctx.baseUrl, '/api/admin/announcements', {
    method: 'POST',
    token: ownerToken,
    body: { title: 'Read-state drill', body: 'Please open this', audienceType: 'all' },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));

  const first = await api(ctx.baseUrl, '/api/notifications?limit=20', { token: studentToken });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const item = (first.data.notifications || []).find((n) => n.title === 'Read-state drill');
  assert.ok(item, 'student should receive the announcement');
  assert.equal(item.read, false);

  const unread = await api(ctx.baseUrl, '/api/notifications/unread-count', { token: studentToken });
  assert.ok(unread.data.count >= 1);

  const marked = await api(ctx.baseUrl, `/api/notifications/${item.id}/read`, {
    method: 'POST',
    token: studentToken,
  });
  assert.equal(marked.status, 200, JSON.stringify(marked.data));
  assert.equal(marked.data.read, true);

  const second = await api(ctx.baseUrl, '/api/notifications?limit=20', { token: studentToken });
  const again = (second.data.notifications || []).find((n) => n.id === item.id);
  assert.equal(again.read, true);

  const unreadAfter = await api(ctx.baseUrl, '/api/notifications/unread-count', { token: studentToken });
  assert.ok(unreadAfter.data.count < unread.data.count);
});
