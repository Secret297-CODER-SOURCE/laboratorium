import db from '../db/index.js';
import * as webpush from './webpush.service.js';
import { NotFoundError } from '../utils/errors.js';

let io = null;

/** Викликається один раз при старті сервера (server/index.js), щоб мати доступ до socket.io. */
export function setIo(ioInstance) {
  io = ioInstance;
}

function emitToUser(userId, event, data) {
  io?.to(`user:${userId}`).emit(event, data);
}

function mapNotification(row) {
  if (!row) return null;
  return {
    ...row,
    read: !!row.read_at,
    data: row.data ? JSON.parse(row.data) : null,
  };
}

function insertOne(userId, { type, title, body = null, link = null, data = null }) {
  const result = db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, link, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, type, title, body || null, link || null, data ? JSON.stringify(data) : null);
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
}

/** Створює сповіщення одному користувачу: пишеться в БД, штовхається в realtime і як web push. */
export function notifyUser(userId, payload) {
  const mapped = mapNotification(insertOne(userId, payload));
  emitToUser(userId, 'notification:new', mapped);
  webpush.sendToUser(userId, {
    title: payload.title,
    body: payload.body,
    link: payload.link,
  }).catch((err) => console.error('[notifications] push send error:', err.message));
  return mapped;
}

/** Те саме сповіщення декільком користувачам одразу (розсилка, груповий тригер). */
export function notifyUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter((id) => Number.isInteger(id) && id > 0))];
  return ids.map((id) => notifyUser(id, payload));
}

export function listNotifications(userId, { unreadOnly = false, limit = 30, beforeId } = {}) {
  const conditions = ['user_id = ?'];
  const params = [userId];
  if (unreadOnly) conditions.push('read_at IS NULL');
  if (beforeId) {
    conditions.push('id < ?');
    params.push(parseInt(beforeId, 10));
  }
  params.push(Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100));

  const rows = db.prepare(`
    SELECT * FROM notifications WHERE ${conditions.join(' AND ')}
    ORDER BY id DESC LIMIT ?
  `).all(...params);
  return rows.map(mapNotification);
}

export function getUnreadCount(userId) {
  return db.prepare(`
    SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read_at IS NULL
  `).get(userId).c;
}

export function markRead(userId, id) {
  const row = db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw new NotFoundError('Сповіщення не знайдено');
  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`).run(id);
  return { ok: true };
}

export function markAllRead(userId) {
  db.prepare(`
    UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL
  `).run(userId);
  return { ok: true };
}

export function deleteNotification(userId, id) {
  const result = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId);
  if (!result.changes) throw new NotFoundError('Сповіщення не знайдено');
  return { ok: true };
}

/** Чи вже надсилали сповіщення такого типу з такими даними (де-дуп для фонових/періодичних тригерів). */
export function hasNotificationLike(userId, type, dataMatch) {
  const rows = db.prepare(`
    SELECT data FROM notifications WHERE user_id = ? AND type = ? ORDER BY id DESC LIMIT 20
  `).all(userId, type);
  return rows.some((r) => {
    if (!r.data) return false;
    try {
      const parsed = JSON.parse(r.data);
      return Object.entries(dataMatch).every(([k, v]) => parsed[k] === v);
    } catch {
      return false;
    }
  });
}

/** Ідентифікатори учнів для ручної розсилки (адмін/викладач): усі, група або програма. */
export function resolveStudentAudience({ audienceType, groupId, programId }) {
  if (audienceType === 'group' && groupId) {
    return db.prepare(`
      SELECT u.id FROM users u
      JOIN study_group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ? AND u.role = 'student'
    `).all(groupId).map((r) => r.id);
  }
  if (audienceType === 'program' && programId) {
    return db.prepare(`
      SELECT DISTINCT u.id FROM users u
      JOIN enrollments e ON e.user_id = u.id
      WHERE e.program_id = ? AND u.role = 'student'
    `).all(programId).map((r) => r.id);
  }
  return db.prepare(`SELECT id FROM users WHERE role = 'student'`).all().map((r) => r.id);
}
