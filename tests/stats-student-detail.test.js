import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setTestEnv, startServer, stopServer, api, createUserDirect,
} from '../adversarial-review/helpers/setup.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let ctx;
let owner;
let student;
let ownerToken;
let studentToken;

before(async () => {
  const { dbPath } = setTestEnv({
    ALLOW_PUBLIC_REGISTRATION: 'false',
    OWNER_EMAIL: 'stats.owner@lab.dev',
    OWNER_PASSWORD: 'StatsOwnerPassword123!',
  });
  ctx = { ...(await startServer()), dbPath };
  owner = createUserDirect(ctx.db, {
    email: 'stats.owner2@lab.dev', password: 'Password123!', role: 'owner', handle: 'stats_owner',
  });
  student = createUserDirect(ctx.db, {
    email: 'stats.student@lab.dev', password: 'Password123!', role: 'student', handle: 'stats_student',
  });
  ownerToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: owner.email, password: 'Password123!' },
  })).data.token;
  studentToken = (await api(ctx.baseUrl, '/api/auth/login', {
    method: 'POST', body: { login: student.email, password: 'Password123!' },
  })).data.token;
});

after(async () => {
  await stopServer(ctx.server, ctx.dbPath);
});

test('student stats SQL joins study_groups for quiz group_name', () => {
  const src = readFileSync(join(root, 'server/services/stats.service.js'), 'utf8');
  const quizzes = src.slice(src.indexOf('const quizzes = db.prepare'), src.indexOf('const challenges = db.prepare'));
  assert.match(quizzes, /LEFT JOIN study_groups g ON g\.id = q\.group_id/);
});

test('GET /api/admin/stats/students/:id succeeds when the student has quiz attempts', async () => {
  const group = ctx.db.prepare(`
    INSERT INTO study_groups (name, teacher_id) VALUES ('Stats group', ?)
  `).run(owner.id);
  ctx.db.prepare(`
    INSERT INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `).run(group.lastInsertRowid, student.id, owner.id);
  const quiz = ctx.db.prepare(`
    INSERT INTO quizzes (group_id, title, is_active) VALUES (?, 'Quiz A', 1)
  `).run(group.lastInsertRowid);
  ctx.db.prepare(`
    INSERT INTO quiz_attempts (quiz_id, user_id, score_percent, passed, submitted_at)
    VALUES (?, ?, 80, 1, datetime('now'))
  `).run(quiz.lastInsertRowid, student.id);

  const res = await api(ctx.baseUrl, `/api/admin/stats/students/${student.id}`, { token: ownerToken });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.student.id, student.id);
  assert.equal(res.data.quizzes.length, 1);
  assert.equal(res.data.quizzes[0].group_name, 'Stats group');
});

test('homework file submit stores the file and returns it on the assignment', async () => {
  const group = ctx.db.prepare(`
    INSERT INTO study_groups (name, teacher_id) VALUES ('HW files group', ?)
  `).run(owner.id);
  ctx.db.prepare(`
    INSERT INTO study_group_members (group_id, user_id, added_by) VALUES (?, ?, ?)
  `).run(group.lastInsertRowid, student.id, owner.id);
  const task = await api(ctx.baseUrl, '/api/admin/tasks', {
    method: 'POST',
    token: ownerToken,
    body: { group_id: group.lastInsertRowid, title: 'File homework', description: 'Attach a file' },
  });
  assert.equal(task.status, 201, JSON.stringify(task.data));
  const listed = await api(ctx.baseUrl, '/api/tasks', { token: studentToken });
  const assignment = listed.data.tasks.find((item) => item.task_id === task.data.task.id);
  assert.ok(assignment);
  assert.equal((await api(ctx.baseUrl, `/api/tasks/${assignment.id}/take`, {
    method: 'POST', token: studentToken,
  })).status, 200);

  const fd = new FormData();
  fd.append('note', '');
  fd.append('files', new Blob(['hello homework'], { type: 'text/plain' }), 'дз.txt');
  const res = await fetch(`${ctx.baseUrl}/api/tasks/${assignment.id}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.assignment.status, 'review');
  assert.equal(data.assignment.submission_files.length, 1);
  assert.match(data.assignment.submission_files[0].original_name, /дз\.txt|dz\.txt|\.txt$/i);
  assert.match(data.assignment.submission_files[0].url, /\/uploads\/task-submissions\//);
});
