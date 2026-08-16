import db from '../db/index.js';
import * as stageService from './challenge-stage.service.js';
import * as activityService from './ctf-activity.service.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { secondsBetween } from '../utils/time.js';

function assertOwnership(challenge, user) {
  if (!user) return;
  if (['owner', 'developer'].includes(user.role)) return;
  if (challenge.author_id !== user.id) {
    throw new ForbiddenError('Ви можете керувати лише власними CTF-завданнями');
  }
}

export function assertCanManage(challengeId, user) {
  const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(challengeId);
  if (!row) throw new NotFoundError('CTF не знайдено');
  assertOwnership(row, user);
  return row;
}

export function getAllForUser(userId) {
  const completedIds = db.prepare('SELECT challenge_id FROM challenge_completions WHERE user_id = ?')
    .all(userId).map(r => r.challenge_id);

  return db.prepare(`
    SELECT c.*, p.name as program_name, cs.started_at as challenge_started_at
    FROM challenges c
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN challenge_starts cs ON cs.challenge_id = c.id AND cs.user_id = ?
    WHERE c.is_active = 1
    ORDER BY c.bounty_reward
  `).all(userId).map(c => ({
    ...c,
    ctf_enabled: !!c.ctf_enabled,
    time_limit_minutes: c.time_limit_minutes,
    started_at: c.challenge_started_at,
    completed: completedIds.includes(c.id),
  }));
}

export function getById(id) {
  return db.prepare('SELECT * FROM challenges WHERE id = ? AND is_active = 1').get(id);
}

export function startChallenge(userId, challengeId) {
  const challenge = getById(challengeId);
  if (!challenge) throw new NotFoundError('Завдання не знайдено');

  const done = db.prepare('SELECT id FROM challenge_completions WHERE user_id = ? AND challenge_id = ?')
    .get(userId, challengeId);
  if (done) return { already_completed: true };

  db.prepare(`
    INSERT INTO challenge_starts (user_id, challenge_id, started_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id, challenge_id) DO NOTHING
  `).run(userId, challengeId);

  const row = db.prepare('SELECT started_at FROM challenge_starts WHERE user_id = ? AND challenge_id = ?')
    .get(userId, challengeId);
  return { started_at: row?.started_at, time_limit_minutes: challenge.time_limit_minutes };
}

export function recordCompletion(userId, challengeId) {
  const challenge = getById(challengeId);
  if (!challenge) return { error: 'not_found' };

  const done = db.prepare('SELECT id FROM challenge_completions WHERE user_id = ? AND challenge_id = ?')
    .get(userId, challengeId);
  if (done) return { error: 'conflict' };

  const start = db.prepare('SELECT started_at FROM challenge_starts WHERE user_id = ? AND challenge_id = ?')
    .get(userId, challengeId);
  const startedAt = start?.started_at || null;
  const nowRow = db.prepare("SELECT datetime('now') as now").get();
  const durationSeconds = secondsBetween(startedAt, nowRow.now);

  db.prepare(`
    INSERT INTO challenge_completions (user_id, challenge_id, started_at, duration_seconds)
    VALUES (?, ?, ?, ?)
  `).run(userId, challengeId, startedAt, durationSeconds);

  return { challenge, duration_seconds: durationSeconds };
}

export function complete(userId, challengeId) {
  const challenge = getById(challengeId);
  if (!challenge) return { error: 'not_found' };
  if (challenge.ctf_enabled) return { error: 'ctf_only' };
  return recordCompletion(userId, challengeId);
}

export function listForManage(user) {
  const params = [];
  let sql = `
    SELECT c.*, p.name as program_name, au.handle as author_handle,
      (SELECT COUNT(*) FROM challenge_stages cs WHERE cs.challenge_id = c.id) as stage_count
    FROM challenges c
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN users au ON au.id = c.author_id
    WHERE c.is_active = 1
  `;
  if (user && !['owner', 'developer'].includes(user.role)) {
    sql += ' AND c.author_id = ?';
    params.push(user.id);
  }
  sql += ' ORDER BY c.bounty_reward, c.id';
  return db.prepare(sql).all(...params).map(c => ({ ...c, ctf_enabled: !!c.ctf_enabled }));
}

export function getStagesForManage(challengeId, user) {
  const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(challengeId);
  if (!row) throw new NotFoundError('CTF не знайдено');
  assertOwnership(row, user);
  return stageService.getStagesAdmin(challengeId);
}

export function createAdmin(data, user) {
  const title = data.title?.trim();
  if (!title) throw new ValidationError('Вкажіть назву');
  const slug = data.slug?.trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48);
  const isCtf = data.ctf_enabled !== false;

  let id;
  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO challenges (slug, title, description, bounty_reward, difficulty, category, program_id, docker_image, target_port, ctf_enabled, time_limit_minutes, author_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      slug,
      title,
      data.description?.trim() || '',
      parseInt(data.bounty_reward, 10) || 50,
      data.difficulty || 'medium',
      data.category?.trim() || 'misc',
      data.program_id || null,
      data.docker_image?.trim() || null,
      parseInt(data.target_port, 10) || 80,
      isCtf ? 1 : 0,
      data.time_limit_minutes ? parseInt(data.time_limit_minutes, 10) : null,
      user?.id || null,
    );
    id = result.lastInsertRowid;

    if (isCtf) {
      stageService.replaceStages(id, data.stages || []);
    }
  });
  tx();

  if (isCtf) {
    activityService.logPublished(db.prepare('SELECT * FROM challenges WHERE id = ?').get(id));
  }

  return db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
}

export function updateAdmin(id, data, user) {
  const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
  if (!row) throw new NotFoundError('CTF не знайдено');
  assertOwnership(row, user);

  const isCtf = data.ctf_enabled !== false;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE challenges SET
        title = ?, description = ?, bounty_reward = ?, difficulty = ?, category = ?,
        program_id = ?, docker_image = ?, target_port = ?, ctf_enabled = ?,
        time_limit_minutes = ?
      WHERE id = ?
    `).run(
      data.title?.trim() || row.title,
      data.description?.trim() ?? row.description,
      parseInt(data.bounty_reward, 10) || row.bounty_reward,
      data.difficulty || row.difficulty,
      data.category?.trim() || row.category || 'misc',
      data.program_id ?? row.program_id,
      data.docker_image?.trim() ?? row.docker_image,
      parseInt(data.target_port, 10) || row.target_port || 80,
      isCtf ? 1 : 0,
      data.time_limit_minutes !== undefined
        ? (data.time_limit_minutes ? parseInt(data.time_limit_minutes, 10) : null)
        : row.time_limit_minutes,
      id,
    );

    if (isCtf && data.stages) {
      stageService.replaceStages(id, data.stages);
    }
  });
  tx();

  return db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
}

export function deleteAdmin(id, user) {
  const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
  if (!row) throw new NotFoundError('CTF не знайдено');
  assertOwnership(row, user);
  db.prepare('UPDATE challenges SET is_active = 0 WHERE id = ?').run(id);
  return { ok: true };
}
