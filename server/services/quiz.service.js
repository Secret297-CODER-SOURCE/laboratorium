import db from '../db/index.js';
import * as groupService from './group.service.js';
import { addBounty } from './bounty.service.js';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { secondsBetween } from '../utils/time.js';

function parseOptions(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function studentGroupIds(userId) {
  return db.prepare('SELECT group_id FROM study_group_members WHERE user_id = ?')
    .all(userId).map(r => r.group_id);
}

function studentProgramIds(userId) {
  return db.prepare('SELECT program_id FROM enrollments WHERE user_id = ?')
    .all(userId).map(r => r.program_id);
}

function canAccessQuiz(userId, quiz) {
  if (!quiz?.is_active) return false;
  if (quiz.group_id) {
    const member = db.prepare(
      'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?',
    ).get(quiz.group_id, userId);
    return !!member;
  }
  if (quiz.program_id) {
    const enr = db.prepare(
      'SELECT 1 FROM enrollments WHERE program_id = ? AND user_id = ?',
    ).get(quiz.program_id, userId);
    return !!enr;
  }
  return false;
}

function mapQuizRow(row, userId = null) {
  if (!row) return null;
  const questions = db.prepare(`
    SELECT id, sort_order, question_text, options_json
    FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order, id
  `).all(row.id);

  const attempt = userId
    ? db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?').get(row.id, userId)
    : null;

  return {
    id: row.id,
    group_id: row.group_id,
    program_id: row.program_id,
    title: row.title,
    description: row.description,
    pass_percent: row.pass_percent,
    bounty_reward: row.bounty_reward,
    time_limit_minutes: row.time_limit_minutes,
    is_active: !!row.is_active,
    group_name: row.group_name,
    program_name: row.program_name,
    question_count: questions.length,
    questions: questions.map(q => ({
      id: q.id,
      sort_order: q.sort_order,
      question_text: q.question_text,
      options: parseOptions(q.options_json).map(o => ({ id: o.id, text: o.text })),
    })),
    attempt: attempt ? {
      id: attempt.id,
      score_percent: attempt.score_percent,
      passed: !!attempt.passed,
      started_at: attempt.started_at,
      submitted_at: attempt.submitted_at,
      duration_seconds: attempt.duration_seconds,
    } : null,
  };
}

export function listForStudent(userId) {
  const groupIds = studentGroupIds(userId);
  const programIds = studentProgramIds(userId);
  if (!groupIds.length && !programIds.length) return [];

  const clauses = [];
  const params = [];
  if (groupIds.length) {
    clauses.push(`q.group_id IN (${groupIds.map(() => '?').join(',')})`);
    params.push(...groupIds);
  }
  if (programIds.length) {
    clauses.push(`q.program_id IN (${programIds.map(() => '?').join(',')})`);
    params.push(...programIds);
  }

  const rows = db.prepare(`
    SELECT q.*, g.name as group_name, p.name as program_name
    FROM quizzes q
    LEFT JOIN study_groups g ON g.id = q.group_id
    LEFT JOIN programs p ON p.id = q.program_id
    WHERE q.is_active = 1 AND (${clauses.join(' OR ')})
    ORDER BY q.created_at DESC
  `).all(...params);

  return rows.map(r => {
    const q = mapQuizRow(r, userId);
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      pass_percent: q.pass_percent,
      bounty_reward: q.bounty_reward,
      time_limit_minutes: q.time_limit_minutes,
      group_name: q.group_name,
      program_name: q.program_name,
      question_count: q.question_count,
      attempt: q.attempt,
    };
  });
}

export function getForStudent(userId, quizId) {
  const row = db.prepare(`
    SELECT q.*, g.name as group_name, p.name as program_name
    FROM quizzes q
    LEFT JOIN study_groups g ON g.id = q.group_id
    LEFT JOIN programs p ON p.id = q.program_id
    WHERE q.id = ? AND q.is_active = 1
  `).get(quizId);
  if (!row) throw new NotFoundError('Тест не знайдено');
  if (!canAccessQuiz(userId, row)) throw new ForbiddenError('Немає доступу до цього тесту');
  return mapQuizRow(row, userId);
}

export function startQuiz(userId, quizId) {
  const row = db.prepare('SELECT * FROM quizzes WHERE id = ? AND is_active = 1').get(quizId);
  if (!row) throw new NotFoundError('Тест не знайдено');
  if (!canAccessQuiz(userId, row)) throw new ForbiddenError('Немає доступу');

  const existing = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?')
    .get(quizId, userId);
  if (existing?.submitted_at) throw new ConflictError('Ви вже проходили цей тест');

  if (!existing) {
    db.prepare(`
      INSERT INTO quiz_attempts (quiz_id, user_id, started_at)
      VALUES (?, ?, datetime('now'))
    `).run(quizId, userId);
  }

  const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?')
    .get(quizId, userId);

  return {
    started_at: attempt.started_at,
    time_limit_minutes: row.time_limit_minutes,
  };
}

export function submitAttempt(userId, quizId, answers) {
  const row = db.prepare('SELECT * FROM quizzes WHERE id = ? AND is_active = 1').get(quizId);
  if (!row) throw new NotFoundError('Тест не знайдено');
  if (!canAccessQuiz(userId, row)) throw new ForbiddenError('Немає доступу');

  const existing = db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?')
    .get(quizId, userId);
  if (existing?.submitted_at) throw new ConflictError('Ви вже проходили цей тест');

  const questions = db.prepare(`
    SELECT id, options_json FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order, id
  `).all(quizId);
  if (!questions.length) throw new ValidationError('У тесті немає питань');

  let correct = 0;
  for (const q of questions) {
    const opts = parseOptions(q.options_json);
    const correctIds = new Set(opts.filter(o => o.correct).map(o => o.id));
    const given = new Set((answers?.[q.id] || answers?.[String(q.id)] || []).map(String));
    if (correctIds.size === given.size && [...correctIds].every(id => given.has(id))) {
      correct += 1;
    }
  }

  const scorePercent = Math.round((correct / questions.length) * 100);
  const passed = scorePercent >= (row.pass_percent || 70);
  const nowRow = db.prepare("SELECT datetime('now') as now").get();
  const startedAt = existing?.started_at || nowRow.now;
  const durationSeconds = secondsBetween(startedAt, nowRow.now);

  db.prepare(`
    INSERT INTO quiz_attempts (quiz_id, user_id, score_percent, passed, answers_json, started_at, submitted_at, duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(quiz_id, user_id) DO UPDATE SET
      score_percent = excluded.score_percent,
      passed = excluded.passed,
      answers_json = excluded.answers_json,
      submitted_at = datetime('now'),
      duration_seconds = excluded.duration_seconds
  `).run(quizId, userId, scorePercent, passed ? 1 : 0, JSON.stringify(answers || {}), startedAt, durationSeconds);

  if (passed && row.bounty_reward > 0) {
    addBounty(userId, row.bounty_reward, `Тест: ${row.title}`);
  }

  return {
    score_percent: scorePercent,
    passed,
    pass_percent: row.pass_percent,
    bounty_earned: passed ? row.bounty_reward : 0,
    correct,
    total: questions.length,
    duration_seconds: durationSeconds,
  };
}

export function listForTeacher(actorId, actorRole) {
  const groups = groupService.listGroups(actorId, actorRole);
  const groupIds = groups.map(g => g.id);
  if (!groupIds.length) return [];

  return db.prepare(`
    SELECT q.*, g.name as group_name, p.name as program_name,
      (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count,
      (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id AND submitted_at IS NOT NULL) as attempts_count
    FROM quizzes q
    LEFT JOIN study_groups g ON g.id = q.group_id
    LEFT JOIN programs p ON p.id = q.program_id
    WHERE q.group_id IN (${groupIds.map(() => '?').join(',')})
    ORDER BY q.created_at DESC
  `).all(...groupIds);
}

export function createQuiz(actorId, data) {
  const title = data.title?.trim();
  if (!title) throw new ValidationError('Вкажіть назву тесту');
  if (!data.group_id) throw new ValidationError('Оберіть групу');

  const group = db.prepare('SELECT id FROM study_groups WHERE id = ?').get(data.group_id);
  if (!group) throw new NotFoundError('Групу не знайдено');

  const questions = Array.isArray(data.questions) ? data.questions : [];
  if (!questions.length) throw new ValidationError('Додайте хоча б одне питання');

  const result = db.prepare(`
    INSERT INTO quizzes (group_id, program_id, title, description, pass_percent, bounty_reward, time_limit_minutes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.group_id,
    data.program_id || null,
    title,
    data.description?.trim() || null,
    parseInt(data.pass_percent, 10) || 70,
    parseInt(data.bounty_reward, 10) || 50,
    data.time_limit_minutes ? parseInt(data.time_limit_minutes, 10) : null,
    actorId,
  );

  const quizId = result.lastInsertRowid;
  const insertQ = db.prepare(`
    INSERT INTO quiz_questions (quiz_id, sort_order, question_text, options_json)
    VALUES (?, ?, ?, ?)
  `);

  questions.forEach((q, i) => {
    const text = q.question_text?.trim() || q.text?.trim();
    if (!text) return;
    const options = (q.options || []).map((o, j) => ({
      id: o.id || String.fromCharCode(97 + j),
      text: o.text?.trim() || '',
      correct: !!o.correct,
    })).filter(o => o.text);
    if (options.length < 2) return;
    if (!options.some(o => o.correct)) options[0].correct = true;
    insertQ.run(quizId, i, text, JSON.stringify(options));
  });

  return db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
}

export function deleteQuiz(actorId, actorRole, quizId) {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) throw new NotFoundError('Тест не знайдено');
  const groups = groupService.listGroups(actorId, actorRole).map(g => g.id);
  if (!groups.includes(quiz.group_id)) throw new ForbiddenError('Немає доступу');
  db.prepare('UPDATE quizzes SET is_active = 0 WHERE id = ?').run(quizId);
  return { ok: true };
}
