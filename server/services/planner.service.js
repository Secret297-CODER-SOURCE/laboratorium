import db from '../db/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const STATUSES = ['todo', 'doing', 'done'];
const PRIORITIES = ['low', 'normal', 'high'];

export function list(ownerUserId, { status } = {}) {
  let sql = `
    SELECT * FROM admin_planner_items
    WHERE owner_user_id = ?
  `;
  const params = [ownerUserId];
  if (status && STATUSES.includes(status)) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ` ORDER BY
    CASE status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END,
    CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
    COALESCE(due_at, '9999') ASC,
    id DESC`;
  return db.prepare(sql).all(...params);
}

export function create(ownerUserId, input = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new ValidationError('Вкажіть назву задачі');
  const status = STATUSES.includes(input.status) ? input.status : 'todo';
  const priority = PRIORITIES.includes(input.priority) ? input.priority : 'normal';
  const result = db.prepare(`
    INSERT INTO admin_planner_items (
      owner_user_id, title, body, due_at, status, priority, related_type, related_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ownerUserId,
    title.slice(0, 200),
    String(input.body || '').trim().slice(0, 2000) || null,
    input.due_at || null,
    status,
    priority,
    input.related_type || null,
    input.related_id || null,
  );
  return db.prepare('SELECT * FROM admin_planner_items WHERE id = ?').get(result.lastInsertRowid);
}

export function update(ownerUserId, id, input = {}) {
  const existing = db.prepare('SELECT * FROM admin_planner_items WHERE id = ? AND owner_user_id = ?')
    .get(id, ownerUserId);
  if (!existing) throw new NotFoundError('Задачу не знайдено');
  const status = input.status && STATUSES.includes(input.status) ? input.status : existing.status;
  const priority = input.priority && PRIORITIES.includes(input.priority) ? input.priority : existing.priority;
  db.prepare(`
    UPDATE admin_planner_items SET
      title = ?, body = ?, due_at = ?, status = ?, priority = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    String(input.title ?? existing.title).trim().slice(0, 200),
    input.body !== undefined ? (String(input.body || '').trim().slice(0, 2000) || null) : existing.body,
    input.due_at !== undefined ? (input.due_at || null) : existing.due_at,
    status,
    priority,
    id,
  );
  return db.prepare('SELECT * FROM admin_planner_items WHERE id = ?').get(id);
}

export function remove(ownerUserId, id) {
  const result = db.prepare('DELETE FROM admin_planner_items WHERE id = ? AND owner_user_id = ?')
    .run(id, ownerUserId);
  if (!result.changes) throw new NotFoundError('Задачу не знайдено');
  return { ok: true };
}
