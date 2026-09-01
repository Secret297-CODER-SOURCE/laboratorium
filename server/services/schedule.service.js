import db from '../db/index.js';
import * as groupService from './group.service.js';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

function mapLesson(row) {
  if (!row) return null;
  return {
    ...row,
    is_cancelled: !!row.is_cancelled,
    absence_count: row.absence_count ?? 0,
    member_count: row.member_count ?? 0,
    has_absence: !!row.has_absence,
    my_absence: row.absence_id ? {
      id: row.absence_id,
      reason: row.absence_reason,
      status: row.absence_status,
      created_at: row.absence_created_at,
    } : null,
  };
}

function assertGroupManage(groupId, actorId, actorRole) {
  const group = groupService.getGroupById(groupId);
  if (!group) throw new NotFoundError('Групу не знайдено');
  if (['owner', 'developer'].includes(actorRole)) return group;
  if (group.teacher_id !== actorId) throw new ForbiddenError('Немає доступу до групи');
  return group;
}

function isGroupMember(groupId, userId) {
  const group = groupService.getGroupById(groupId);
  if (!group) return false;
  if (group.teacher_id === userId) return true;
  return !!db.prepare('SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

function getLessonById(id) {
  const row = db.prepare(`
    SELECT l.*, g.name as group_name, g.color as group_color,
      u.name as teacher_name, u.handle as teacher_handle
    FROM lessons l
    JOIN study_groups g ON g.id = l.group_id
    JOIN users u ON u.id = l.teacher_id
    WHERE l.id = ?
  `).get(id);
  return mapLesson(row);
}

export function listLessons(actorId, actorRole, { groupId, from, to } = {}) {
  let sql = `
    SELECT l.*, g.name as group_name, g.color as group_color,
      u.name as teacher_name, u.handle as teacher_handle,
      (SELECT COUNT(*) FROM study_group_members gm WHERE gm.group_id = l.group_id) as member_count,
      (SELECT COUNT(*) FROM lesson_absences la WHERE la.lesson_id = l.id) as absence_count
    FROM lessons l
    JOIN study_groups g ON g.id = l.group_id AND g.is_active = 1
    JOIN users u ON u.id = l.teacher_id
    WHERE l.is_cancelled = 0
  `;
  const params = [];

  if (groupId) {
    assertGroupManage(groupId, actorId, actorRole);
    sql += ' AND l.group_id = ?';
    params.push(groupId);
  } else if (actorRole === 'teacher') {
    sql += ' AND g.teacher_id = ?';
    params.push(actorId);
  }

  if (from) {
    sql += ' AND l.lesson_at >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND l.lesson_at <= ?';
    params.push(to);
  }

  sql += ' ORDER BY l.lesson_at ASC';
  return db.prepare(sql).all(...params).map(mapLesson);
}

export function listStudentLessons(userId, { from, to } = {}) {
  const fromDt = from || new Date(Date.now() - 7 * 86400000).toISOString();
  const toDt = to || new Date(Date.now() + 60 * 86400000).toISOString();

  return db.prepare(`
    SELECT l.*, g.name as group_name, g.color as group_color,
      u.name as teacher_name, u.handle as teacher_handle,
      la.id as absence_id, la.reason as absence_reason, la.status as absence_status,
      la.created_at as absence_created_at
    FROM lessons l
    JOIN study_groups g ON g.id = l.group_id AND g.is_active = 1
    JOIN study_group_members gm ON gm.group_id = g.id AND gm.user_id = ?
    JOIN users u ON u.id = l.teacher_id
    LEFT JOIN lesson_absences la ON la.lesson_id = l.id AND la.user_id = ?
    WHERE l.is_cancelled = 0 AND l.lesson_at >= ? AND l.lesson_at <= ?
    ORDER BY l.lesson_at ASC
  `).all(userId, userId, fromDt, toDt).map(mapLesson);
}

export function createLesson(actorId, actorRole, data) {
  const groupId = parseInt(data.group_id, 10);
  assertGroupManage(groupId, actorId, actorRole);

  const title = data.title?.trim();
  const lessonAt = data.lesson_at?.trim();
  if (!title) throw new ValidationError('Вкажіть назву заняття');
  if (!lessonAt) throw new ValidationError('Вкажіть дату і час');

  const group = groupService.getGroupById(groupId);
  const result = db.prepare(`
    INSERT INTO lessons (group_id, teacher_id, title, lesson_at, duration_minutes, topic, location)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    groupId,
    group.teacher_id,
    title,
    lessonAt,
    parseInt(data.duration_minutes, 10) || 90,
    data.topic?.trim() || null,
    data.location?.trim() || null,
  );

  return getLessonById(result.lastInsertRowid);
}

export function updateLesson(lessonId, actorId, actorRole, data) {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new NotFoundError('Заняття не знайдено');
  assertGroupManage(lesson.group_id, actorId, actorRole);

  db.prepare(`
    UPDATE lessons SET
      title = ?, lesson_at = ?, duration_minutes = ?, topic = ?, location = ?,
      is_cancelled = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.title?.trim() || lesson.title,
    data.lesson_at?.trim() || lesson.lesson_at,
    data.duration_minutes !== undefined ? (parseInt(data.duration_minutes, 10) || 90) : lesson.duration_minutes,
    data.topic !== undefined ? (data.topic?.trim() || null) : lesson.topic,
    data.location !== undefined ? (data.location?.trim() || null) : lesson.location,
    data.is_cancelled === true ? 1 : (data.is_cancelled === false ? 0 : (lesson.is_cancelled ? 1 : 0)),
    lessonId,
  );

  return getLessonById(lessonId);
}

export function deleteLesson(lessonId, actorId, actorRole) {
  return updateLesson(lessonId, actorId, actorRole, { is_cancelled: true });
}

export function reportAbsence(userId, lessonId, reason) {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new NotFoundError('Заняття не знайдено');
  if (!isGroupMember(lesson.group_id, userId)) {
    throw new ForbiddenError('Ви не в цій групі');
  }

  const text = reason?.trim();
  if (!text || text.length < 3) {
    throw new ValidationError('Вкажіть причину відсутності (мінімум 3 символи)');
  }

  const lessonEnd = new Date(lesson.lesson_at);
  lessonEnd.setMinutes(lessonEnd.getMinutes() + (lesson.duration_minutes || 90));
  if (new Date() > lessonEnd) {
    throw new ValidationError('Заняття вже завершилось — відсутність не можна повідомити');
  }

  const existing = db.prepare('SELECT id FROM lesson_absences WHERE lesson_id = ? AND user_id = ?').get(lessonId, userId);
  if (existing) throw new ConflictError('Ви вже повідомили про відсутність на це заняття');

  const result = db.prepare(`
    INSERT INTO lesson_absences (lesson_id, user_id, reason)
    VALUES (?, ?, ?)
  `).run(lessonId, userId, text);

  return db.prepare(`
    SELECT la.*, u.name, u.handle, l.title as lesson_title, l.lesson_at, l.teacher_id, g.name as group_name
    FROM lesson_absences la
    JOIN users u ON u.id = la.user_id
    JOIN lessons l ON l.id = la.lesson_id
    JOIN study_groups g ON g.id = l.group_id
    WHERE la.id = ?
  `).get(result.lastInsertRowid);
}

export function listAbsences(actorId, actorRole, { groupId, status } = {}) {
  let sql = `
    SELECT la.*, u.name as student_name, u.handle as student_handle,
      l.title as lesson_title, l.lesson_at, l.group_id,
      g.name as group_name, g.color as group_color,
      t.name as teacher_name
    FROM lesson_absences la
    JOIN users u ON u.id = la.user_id
    JOIN lessons l ON l.id = la.lesson_id
    JOIN study_groups g ON g.id = l.group_id
    JOIN users t ON t.id = g.teacher_id
    WHERE l.is_cancelled = 0
  `;
  const params = [];

  if (groupId) {
    assertGroupManage(groupId, actorId, actorRole);
    sql += ' AND l.group_id = ?';
    params.push(groupId);
  } else if (actorRole === 'teacher') {
    sql += ' AND g.teacher_id = ?';
    params.push(actorId);
  }

  if (status) {
    sql += ' AND la.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY l.lesson_at DESC, la.created_at DESC LIMIT 100';
  return db.prepare(sql).all(...params);
}

export function acknowledgeAbsence(absenceId, actorId, actorRole) {
  const row = db.prepare(`
    SELECT la.*, l.group_id FROM lesson_absences la
    JOIN lessons l ON l.id = la.lesson_id WHERE la.id = ?
  `).get(absenceId);
  if (!row) throw new NotFoundError('Запис не знайдено');
  assertGroupManage(row.group_id, actorId, actorRole);

  db.prepare(`
    UPDATE lesson_absences SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = datetime('now')
    WHERE id = ?
  `).run(actorId, absenceId);

  return db.prepare('SELECT * FROM lesson_absences WHERE id = ?').get(absenceId);
}

export function getScheduleStats(actorId, actorRole, { groupId, weeks = 8 } = {}) {
  const w = Math.min(Math.max(parseInt(weeks, 10) || 8, 4), 16);
  const since = new Date();
  since.setDate(since.getDate() - w * 7);

  let groupFilter = '';
  const params = [since.toISOString()];

  if (groupId) {
    assertGroupManage(groupId, actorId, actorRole);
    groupFilter = ' AND l.group_id = ?';
    params.push(groupId);
  } else if (actorRole === 'teacher') {
    groupFilter = ' AND g.teacher_id = ?';
    params.push(actorId);
  }

  const weekly = db.prepare(`
    SELECT strftime('%Y-W%W', l.lesson_at) as week,
      COUNT(DISTINCT l.id) as lessons,
      COUNT(la.id) as absences
    FROM lessons l
    JOIN study_groups g ON g.id = l.group_id
    LEFT JOIN lesson_absences la ON la.lesson_id = l.id
    WHERE l.is_cancelled = 0 AND l.lesson_at >= ? ${groupFilter}
    GROUP BY week
    ORDER BY week ASC
  `).all(...params);

  const byStudent = db.prepare(`
    SELECT u.id, u.name, u.handle,
      COUNT(DISTINCT l.id) as total_lessons,
      COUNT(DISTINCT la.id) as absences
    FROM study_group_members gm
    JOIN users u ON u.id = gm.user_id
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    LEFT JOIN lessons l ON l.group_id = g.id AND l.is_cancelled = 0 AND l.lesson_at >= ?
    LEFT JOIN lesson_absences la ON la.lesson_id = l.id AND la.user_id = u.id
    WHERE 1=1 ${groupFilter}
    GROUP BY u.id
    ORDER BY absences DESC, u.handle ASC
    LIMIT 200
  `).all(...params);

  let pendingSql = `
    SELECT COUNT(*) as c FROM lesson_absences la
    JOIN lessons l ON l.id = la.lesson_id
    JOIN study_groups g ON g.id = l.group_id
    WHERE la.status = 'reported'
  `;
  const pendingParams = [];
  if (groupId) {
    pendingSql += ' AND l.group_id = ?';
    pendingParams.push(groupId);
  } else if (actorRole === 'teacher') {
    pendingSql += ' AND g.teacher_id = ?';
    pendingParams.push(actorId);
  }
  const pendingCount = db.prepare(pendingSql).get(...pendingParams)?.c || 0;

  return {
    weekly,
    byStudent: byStudent.map(s => ({
      ...s,
      attendance_pct: s.total_lessons > 0
        ? Math.round(((s.total_lessons - s.absences) / s.total_lessons) * 100)
        : 100,
    })),
    pending_absences: pendingCount,
  };
}
