import db from '../db/index.js';

const MAX_MESSAGE_LEN = 2000;
const MAX_STACK_LEN = 8000;

/**
 * Records an unexpected error (server crash, uncaught exception, or a
 * client-reported JS error) for the owner's "Помилки" admin panel. Wrapped
 * in its own try/catch so a logging failure can never mask — or crash
 * the handling of — the original error.
 */
export function log({ source, message, stack, method, path, statusCode, userId, userAgent }) {
  try {
    db.prepare(`
      INSERT INTO error_logs (source, message, stack, method, path, status_code, user_id, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      source,
      String(message || 'Unknown error').slice(0, MAX_MESSAGE_LEN),
      stack ? String(stack).slice(0, MAX_STACK_LEN) : null,
      method || null,
      path || null,
      statusCode || null,
      userId || null,
      userAgent ? String(userAgent).slice(0, 500) : null,
    );
  } catch (err) {
    console.error('[error-log] failed to persist error log:', err.message);
  }
}

export function list({ source, limit = 100, cursor } = {}) {
  const pageSize = Math.min(parseInt(limit, 10) || 100, 300);
  const params = [];
  let sql = 'SELECT * FROM error_logs WHERE 1=1';
  if (source) { sql += ' AND source = ?'; params.push(source); }
  if (cursor) { sql += ' AND id < ?'; params.push(cursor); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(pageSize);

  const rows = db.prepare(sql).all(...params);
  const nextCursor = rows.length === pageSize ? rows[rows.length - 1].id : null;
  return { errors: rows, nextCursor };
}

export function clear() {
  db.prepare('DELETE FROM error_logs').run();
  return { ok: true };
}
