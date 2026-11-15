import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setTestEnv, startServer, stopServer, api, createUserDirect,
} from '../adversarial-review/helpers/setup.js';

let ctx;
let owner;
let teacher;
let studentA;
let studentB;
let ownerToken;
let teacherToken;
let tokenA;
let tokenB;
let groupA;
let groupB;
let confA;

before(async () => {
  const { dbPath } = setTestEnv({ ALLOW_PUBLIC_REGISTRATION: 'false' });
  ctx = { ...(await startServer()), dbPath };

  owner = createUserDirect(ctx.db, {
    email: 'iso.owner@lab.dev', password: 'Password123!', role: 'owner', handle: 'iso_owner',
  });
  teacher = createUserDirect(ctx.db, {
    email: 'iso.teacher@lab.dev', password: 'Password123!', role: 'teacher', handle: 'iso_teacher',
  });
  studentA = createUserDirect(ctx.db, {
    email: 'iso.a@lab.dev', password: 'Password123!', role: 'student', handle: 'iso_a', bountyPoints: 100,
  });
  studentB = createUserDirect(ctx.db, {
    email: 'iso.b@lab.dev', password: 'Password123!', role: 'student', handle: 'iso_b', bountyPoints: 500,
  });

  ownerToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: owner.email, password: 'Password123!' },
  })).data.token;
  teacherToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: teacher.email, password: 'Password123!' },
  })).data.token;
  tokenA = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: studentA.email, password: 'Password123!' },
  })).data.token;
  tokenB = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: studentB.email, password: 'Password123!' },
  })).data.token;

  groupA = (await api(ctx.baseUrl, '/api/admin/groups', {
    token: teacherToken,
    method: 'POST',
    body: { name: 'Group Alpha', kind: 'group' },
  })).data.group;
  groupB = (await api(ctx.baseUrl, '/api/admin/groups', {
    token: teacherToken,
    method: 'POST',
    body: { name: 'Group Beta', kind: 'group' },
  })).data.group;

  await api(ctx.baseUrl, `/api/admin/groups/${groupA.id}/members`, {
    token: teacherToken,
    method: 'POST',
    body: { userIds: [studentA.id] },
  });
  await api(ctx.baseUrl, `/api/admin/groups/${groupB.id}/members`, {
    token: teacherToken,
    method: 'POST',
    body: { userIds: [studentB.id] },
  });

  confA = (await api(ctx.baseUrl, '/api/conferences', {
    token: teacherToken,
    method: 'POST',
    body: {
      title: 'Alpha room',
      groupId: groupA.id,
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      durationMinutes: 60,
    },
  })).data.conference;
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

test('student B cannot fetch conference of group A by id', async () => {
  const res = await api(ctx.baseUrl, `/api/conferences/${confA.id}`, { token: tokenB });
  assert.equal(res.status, 403);
});

test('student A can fetch own group conference', async () => {
  const res = await api(ctx.baseUrl, `/api/conferences/${confA.id}`, { token: tokenA });
  assert.equal(res.status, 200);
  assert.equal(res.data.conference.id, confA.id);
});

test('schedule is membership-scoped', async () => {
  const resA = await api(ctx.baseUrl, '/api/conferences/schedule', { token: tokenA });
  const resB = await api(ctx.baseUrl, '/api/conferences/schedule', { token: tokenB });
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);
  assert.ok(resA.data.conferences.some((c) => c.id === confA.id));
  assert.ok(!resB.data.conferences.some((c) => c.id === confA.id));
});

test('student B cannot read messages of group A conference', async () => {
  const res = await api(ctx.baseUrl, `/api/conferences/${confA.id}/messages`, { token: tokenB });
  assert.equal(res.status, 403);
});

test('group ranking forbidden for non-members', async () => {
  const res = await api(ctx.baseUrl, `/api/chat/groups/${groupA.id}/ranking`, { token: tokenB });
  assert.ok([403, 404].includes(res.status));
});

test('leaderboard for student only shows classmates', async () => {
  const res = await api(ctx.baseUrl, '/api/leaderboard', { token: tokenA });
  assert.equal(res.status, 200);
  const handles = (res.data.leaderboard || []).map((u) => u.handle);
  assert.ok(handles.includes('iso_a'));
  assert.ok(!handles.includes('iso_b'));
});

test('guest leaderboard is empty', async () => {
  const res = await api(ctx.baseUrl, '/api/leaderboard');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.leaderboard, []);
});

test('access policy get/save toggles leaderboard mode', async () => {
  const meta = await api(ctx.baseUrl, '/api/admin/settings/access-policy', { token: ownerToken });
  assert.equal(meta.status, 200);
  assert.equal(meta.data.policy.leaderboard.studentMode, 'classmates');

  const saved = await api(ctx.baseUrl, '/api/admin/settings/access-policy', {
    token: ownerToken,
    method: 'PATCH',
    body: { policy: { leaderboard: { studentMode: 'hidden' } } },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.policy.leaderboard.studentMode, 'hidden');

  const board = await api(ctx.baseUrl, '/api/leaderboard', { token: tokenA });
  assert.deepEqual(board.data.leaderboard, []);

  await api(ctx.baseUrl, '/api/admin/settings/access-policy/reset', {
    token: ownerToken,
    method: 'POST',
  });
});

test('individual pod create + conference only for that student', async () => {
  const podRes = await api(ctx.baseUrl, '/api/admin/groups', {
    token: teacherToken,
    method: 'POST',
    body: { kind: 'individual', student_id: studentA.id },
  });
  assert.equal(podRes.status, 201);
  assert.equal(podRes.data.group.kind, 'individual');
  assert.equal(podRes.data.group.member_count, 1);

  const conf = (await api(ctx.baseUrl, '/api/conferences', {
    token: teacherToken,
    method: 'POST',
    body: {
      title: '1:1 with A',
      groupId: podRes.data.group.id,
      scheduledAt: new Date(Date.now() + 7200000).toISOString(),
      durationMinutes: 30,
    },
  })).data.conference;

  const okA = await api(ctx.baseUrl, `/api/conferences/${conf.id}`, { token: tokenA });
  const denyB = await api(ctx.baseUrl, `/api/conferences/${conf.id}`, { token: tokenB });
  assert.equal(okA.status, 200);
  assert.equal(denyB.status, 403);

  const second = await api(ctx.baseUrl, `/api/admin/groups/${podRes.data.group.id}/members`, {
    token: teacherToken,
    method: 'POST',
    body: { userIds: [studentB.id] },
  });
  assert.equal(second.status, 400);
});
