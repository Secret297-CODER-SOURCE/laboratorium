import { randomBytes } from 'crypto';
import db from '../db/index.js';
import * as groupService from './group.service.js';
import { userHasGroupAccess } from './chat.service.js';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../utils/errors.js';

function generateRoomCode() {
  let code;
  do {
    code = randomBytes(4).toString('hex').toUpperCase();
  } while (db.prepare('SELECT id FROM conferences WHERE room_code = ?').get(code));
  return code;
}

export function create({ hostId, hostRole, title, description, programId, groupId, scheduledAt, durationMinutes, maxParticipants, recordingEnabled }) {
  if (!title?.trim()) throw new ValidationError('Вкажіть назву конференції');
  if (!scheduledAt) throw new ValidationError('Вкажіть дату та час');

  const scheduled = new Date(scheduledAt);
  if (isNaN(scheduled.getTime())) throw new ValidationError('Некоректна дата');

  let gid = groupId ? parseInt(groupId, 10) : null;
  if (gid) {
    const group = groupService.getGroupById(gid);
    if (!group) throw new NotFoundError('Групу не знайдено');
    if (hostRole === 'teacher' && group.teacher_id !== hostId) {
      throw new ForbiddenError('Можна створювати конференції лише для своїх груп');
    }
  } else if (hostRole === 'teacher') {
    throw new ValidationError('Оберіть групу для конференції');
  }

  const result = db.prepare(`
    INSERT INTO conferences (room_code, title, description, host_user_id, program_id, group_id, scheduled_at, duration_minutes, max_participants, recording_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateRoomCode(),
    title.trim(),
    description?.trim() || null,
    hostId,
    programId || null,
    gid,
    scheduled.toISOString(),
    durationMinutes || 60,
    maxParticipants || 30,
    recordingEnabled !== false ? 1 : 0,
  );

  const confId = result.lastInsertRowid;
  db.prepare(`INSERT INTO conference_participants (conference_id, user_id, role) VALUES (?, ?, 'host')`)
    .run(confId, hostId);

  return getById(confId);
}

export function getById(id) {
  return db.prepare(`
    SELECT c.*, u.name as host_name, u.handle as host_handle, p.name as program_name,
      g.name as group_name, g.color as group_color
    FROM conferences c
    JOIN users u ON u.id = c.host_user_id
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN study_groups g ON g.id = c.group_id
    WHERE c.id = ?
  `).get(id);
}

export function getByRoomCode(code) {
  return db.prepare(`
    SELECT c.*, u.name as host_name, u.handle as host_handle, p.name as program_name,
      g.name as group_name, g.color as group_color
    FROM conferences c
    JOIN users u ON u.id = c.host_user_id
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN study_groups g ON g.id = c.group_id
    WHERE c.room_code = ?
  `).get(code?.toUpperCase());
}

function conferenceVisibilitySql(userId, userRole, params) {
  if (['owner', 'developer'].includes(userRole)) return '';
  if (userRole === 'teacher') {
    params.push(userId, userId);
    return ` AND (c.group_id IS NULL OR c.group_id IN (
      SELECT id FROM study_groups WHERE teacher_id = ? AND is_active = 1
    ) OR c.host_user_id = ?)`;
  }
  params.push(userId, userId);
  return ` AND (c.group_id IS NULL OR c.group_id IN (
    SELECT gm.group_id FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    WHERE gm.user_id = ?
  ) OR c.host_user_id = ?)`;
}

export function list({ userId, userRole, status, from, to } = {}) {
  let sql = `
    SELECT c.*, u.name as host_name, u.handle as host_handle, p.name as program_name,
      g.name as group_name, g.color as group_color,
      (SELECT COUNT(*) FROM conference_participants cp WHERE cp.conference_id = c.id) as participant_count
    FROM conferences c
    JOIN users u ON u.id = c.host_user_id
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN study_groups g ON g.id = c.group_id
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    sql += conferenceVisibilitySql(userId, userRole, params);
  }

  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  if (from) { sql += ' AND c.scheduled_at >= ?'; params.push(from); }
  if (to) { sql += ' AND c.scheduled_at <= ?'; params.push(to); }

  sql += ' ORDER BY c.scheduled_at ASC';
  return db.prepare(sql).all(...params);
}

export function getSchedule(from, to) {
  return list({ from, to });
}

export function getUpcoming(userId, userRole, limit = 10) {
  const params = [];
  let sql = `
    SELECT c.*, u.name as host_name, u.handle as host_handle, p.name as program_name,
      g.name as group_name, g.color as group_color
    FROM conferences c
    JOIN users u ON u.id = c.host_user_id
    LEFT JOIN programs p ON p.id = c.program_id
    LEFT JOIN study_groups g ON g.id = c.group_id
    WHERE c.status IN ('scheduled', 'live') AND c.scheduled_at >= datetime('now', '-1 hour')
  `;
  if (userId) {
    sql += conferenceVisibilitySql(userId, userRole, params);
  }
  sql += ' ORDER BY c.scheduled_at ASC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function join(conferenceId, userId, userRole = 'student') {
  const conf = getById(conferenceId);
  if (!conf) throw new NotFoundError('Конференцію не знайдено');
  if (conf.status === 'cancelled') throw new ConflictError('Конференцію скасовано');
  if (conf.status === 'ended') throw new ConflictError('Конференцію завершено');

  if (conf.group_id && conf.host_user_id !== userId) {
    if (!userHasGroupAccess(conf.group_id, userId, userRole)) {
      throw new ForbiddenError('Конференція лише для учасників групи');
    }
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM conference_participants WHERE conference_id = ?').get(conferenceId).c;
  const existing = db.prepare('SELECT id FROM conference_participants WHERE conference_id = ? AND user_id = ?').get(conferenceId, userId);

  if (!existing && count >= conf.max_participants) {
    throw new ConflictError('Досягнуто ліміт учасників');
  }

  if (existing) {
    db.prepare(`UPDATE conference_participants SET joined_at = datetime('now'), left_at = NULL WHERE conference_id = ? AND user_id = ?`)
      .run(conferenceId, userId);
  } else {
    db.prepare(`INSERT INTO conference_participants (conference_id, user_id, role, joined_at) VALUES (?, ?, 'participant', datetime('now'))`)
      .run(conferenceId, userId);
  }

  return conf;
}

export function start(conferenceId, userId) {
  const conf = getById(conferenceId);
  if (!conf) throw new NotFoundError('Конференцію не знайдено');
  if (conf.host_user_id !== userId) throw new ForbiddenError('Лише ведучий може розпочати конференцію');

  db.prepare(`UPDATE conferences SET status = 'live', started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .run(conferenceId);
  return getById(conferenceId);
}

export function end(conferenceId, userId) {
  const conf = getById(conferenceId);
  if (!conf) throw new NotFoundError('Конференцію не знайдено');
  if (conf.host_user_id !== userId) throw new ForbiddenError('Лише ведучий може завершити конференцію');

  db.prepare(`UPDATE conferences SET status = 'ended', ended_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .run(conferenceId);
  return getById(conferenceId);
}

export function cancel(conferenceId, userId) {
  const conf = getById(conferenceId);
  if (!conf) throw new NotFoundError('Конференцію не знайдено');
  if (conf.host_user_id !== userId) throw new ForbiddenError('Лише ведучий може скасувати');

  db.prepare(`UPDATE conferences SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(conferenceId);
  return getById(conferenceId);
}

export function getParticipants(conferenceId) {
  return db.prepare(`
    SELECT cp.*, u.name, u.handle, u.bounty_points
    FROM conference_participants cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.conference_id = ?
    ORDER BY cp.role DESC, cp.joined_at ASC
  `).all(conferenceId);
}

export function saveMessage(conferenceId, userId, handle, message, msgType = 'text') {
  const result = db.prepare(`
    INSERT INTO conference_messages (conference_id, user_id, handle, message, msg_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(conferenceId, userId, handle, message, msgType);

  return db.prepare('SELECT * FROM conference_messages WHERE id = ?').get(result.lastInsertRowid);
}

export function getMessages(conferenceId, limit = 100) {
  return db.prepare(`
    SELECT * FROM conference_messages WHERE conference_id = ?
    ORDER BY created_at ASC LIMIT ?
  `).all(conferenceId, limit);
}

export function leave(conferenceId, userId) {
  db.prepare(`UPDATE conference_participants SET left_at = datetime('now') WHERE conference_id = ? AND user_id = ?`)
    .run(conferenceId, userId);
}
