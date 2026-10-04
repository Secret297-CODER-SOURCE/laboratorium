import db from '../db/index.js';
import { ValidationError } from '../utils/errors.js';

export function add(userId, authorId, body) {
  const text = body?.trim();
  if (!text) throw new ValidationError('Нотатка не може бути порожньою');

  const result = db.prepare(`
    INSERT INTO user_notes (user_id, author_id, body) VALUES (?, ?, ?)
  `).run(userId, authorId || null, text);

  return db.prepare(`
    SELECT n.*, u.name as author_name, u.handle as author_handle
    FROM user_notes n LEFT JOIN users u ON u.id = n.author_id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);
}

export function list(userId) {
  return db.prepare(`
    SELECT n.*, u.name as author_name, u.handle as author_handle
    FROM user_notes n LEFT JOIN users u ON u.id = n.author_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
  `).all(userId);
}

export function remove(noteId) {
  db.prepare('DELETE FROM user_notes WHERE id = ?').run(noteId);
  return { ok: true };
}
