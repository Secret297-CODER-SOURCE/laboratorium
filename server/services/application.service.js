import db from '../db/index.js';
import { ValidationError } from '../utils/errors.js';
import { isValidEmail } from '../utils/validators.js';

export function create({ name, email, program, message, userId = null, direction_id = null }) {
  if (!name?.trim() || !email?.trim()) {
    throw new ValidationError('Заповніть обов\'язкові поля');
  }
  if (!program?.trim() && !direction_id) {
    throw new ValidationError('Оберіть напрямок');
  }
  if (!isValidEmail(email)) {
    throw new ValidationError('Некоректний email');
  }

  let programLabel = program?.trim() || '';
  if (direction_id) {
    const dir = db.prepare('SELECT name FROM directions WHERE id = ?').get(direction_id);
    if (dir) programLabel = dir.name;
  }

  db.prepare(`
    INSERT INTO applications (name, email, program, message, user_id, status, direction_id)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(name.trim(), email.toLowerCase(), programLabel, message?.trim() || '', userId, direction_id || null);

  return true;
}

export function getLeaderboard(limit = 20) {
  return db.prepare(`
    SELECT id, handle, name, bounty_points FROM users
    ORDER BY bounty_points DESC LIMIT ?
  `).all(limit);
}
