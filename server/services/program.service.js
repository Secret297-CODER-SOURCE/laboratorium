import db from '../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as directionService from './direction.service.js';
import * as tabAccessService from './tab-access.service.js';

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `prog_${Date.now().toString(36)}`;
}

function mapProgram(p) {
  if (!p) return null;
  return {
    ...p,
    tags: p.tags ? p.tags.split(',') : [],
    is_active: !!p.is_active,
    is_featured: !!p.is_featured,
  };
}

export function getAll() {
  return db.prepare(`
    SELECT p.*, d.name as direction_name, d.slug as direction_slug
    FROM programs p
    LEFT JOIN directions d ON d.id = p.direction_id
    WHERE p.is_active = 1
    ORDER BY p.sort_order, p.id
  `).all().map(mapProgram);
}

export function getAllAdmin() {
  return db.prepare(`
    SELECT p.*, d.name as direction_name
    FROM programs p
    LEFT JOIN directions d ON d.id = p.direction_id
    ORDER BY p.sort_order, p.id
  `).all().map(mapProgram);
}

export function getById(id) {
  return mapProgram(db.prepare('SELECT * FROM programs WHERE id = ?').get(id));
}

/**
 * Programs a student may newly discover/enroll in: excludes programs under
 * a closed direction (direction.is_active = 0) or one denied for this user
 * via a tab-access rule. Deliberately NOT used for already-enrolled
 * students (getEnrollments) or for teacher/owner group management (getAll)
 * — closing a direction must stop *new* engagement without touching
 * existing enrollments or groups already tied to it.
 */
export function getAvailableForEnrollment(user) {
  return getAll().filter((p) => {
    if (!p.direction_id) return true;
    const direction = directionService.getById(p.direction_id);
    if (direction && !direction.is_active) return false;
    return tabAccessService.isDirectionAllowed(user, p.direction_id);
  });
}

export function getEnrollments(userId) {
  return db.prepare(`
    SELECT e.*, p.name as program_name, p.slug, p.level, p.duration, p.bounty_reward
    FROM enrollments e
    JOIN programs p ON p.id = e.program_id
    WHERE e.user_id = ?
    ORDER BY e.enrolled_at DESC
  `).all(userId);
}

export function enroll(userId, programId, user) {
  const program = getById(programId);
  if (!program || !program.is_active) return { error: 'not_found' };
  if (program.direction_id) {
    const direction = directionService.getById(program.direction_id);
    if (direction && !direction.is_active) return { error: 'not_found' };
    if (!tabAccessService.isDirectionAllowed(user, program.direction_id)) return { error: 'not_found' };
  }

  const existing = db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND program_id = ?')
    .get(userId, programId);
  if (existing) return { error: 'conflict' };

  db.prepare(`INSERT INTO enrollments (user_id, program_id, progress, status) VALUES (?, ?, 0, 'active')`)
    .run(userId, programId);

  return { program };
}

export function updateProgress(userId, enrollmentId, progress) {
  const value = Math.min(100, Math.max(0, parseInt(progress, 10) || 0));
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ? AND user_id = ?')
    .get(enrollmentId, userId);
  if (!enrollment) return { error: 'not_found' };

  const wasComplete = enrollment.progress >= 100;
  db.prepare('UPDATE enrollments SET progress = ?, status = ? WHERE id = ?')
    .run(value, value >= 100 ? 'completed' : 'active', enrollmentId);

  return { enrollment, value, wasComplete, justCompleted: !wasComplete && value >= 100 };
}

export function create(data) {
  const name = data.name?.trim();
  if (!name) throw new ValidationError('Вкажіть назву програми');

  const slug = data.slug?.trim() || slugify(name);
  if (db.prepare('SELECT id FROM programs WHERE slug = ?').get(slug)) {
    throw new ConflictError('Slug вже зайнято');
  }

  const result = db.prepare(`
    INSERT INTO programs (slug, name, level, duration, bounty_reward, description, tags,
      direction_id, sort_order, is_featured, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug, name,
    data.level?.trim() || 'Foundation',
    data.duration?.trim() || '3 місяці',
    parseInt(data.bounty_reward, 10) || 0,
    data.description?.trim() || null,
    Array.isArray(data.tags) ? data.tags.join(',') : (data.tags?.trim() || null),
    data.direction_id ? parseInt(data.direction_id, 10) : null,
    parseInt(data.sort_order, 10) || 0,
    data.is_featured ? 1 : 0,
    data.is_active === false ? 0 : 1,
  );

  return getById(result.lastInsertRowid);
}

export function update(id, data) {
  const existing = getById(id);
  if (!existing) throw new NotFoundError('Програму не знайдено');

  const name = data.name?.trim() || existing.name;
  const slug = data.slug?.trim() || existing.slug;

  if (slug !== existing.slug && db.prepare('SELECT id FROM programs WHERE slug = ? AND id != ?').get(slug, id)) {
    throw new ConflictError('Slug вже зайнято');
  }

  db.prepare(`
    UPDATE programs SET slug = ?, name = ?, level = ?, duration = ?, bounty_reward = ?,
      description = ?, tags = ?, direction_id = ?, sort_order = ?, is_featured = ?,
      is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    slug, name,
    data.level?.trim() || existing.level,
    data.duration?.trim() || existing.duration,
    data.bounty_reward !== undefined ? parseInt(data.bounty_reward, 10) : existing.bounty_reward,
    data.description !== undefined ? (data.description?.trim() || null) : existing.description,
    data.tags !== undefined
      ? (Array.isArray(data.tags) ? data.tags.join(',') : (data.tags?.trim() || null))
      : (existing.tags?.join?.(',') || existing.tags || null),
    data.direction_id !== undefined ? (data.direction_id ? parseInt(data.direction_id, 10) : null) : existing.direction_id,
    data.sort_order !== undefined ? (parseInt(data.sort_order, 10) || 0) : existing.sort_order,
    data.is_featured !== undefined ? (data.is_featured ? 1 : 0) : (existing.is_featured ? 1 : 0),
    data.is_active === false ? 0 : (data.is_active === true ? 1 : (existing.is_active ? 1 : 0)),
    id,
  );

  return getById(id);
}

export function remove(id) {
  const existing = getById(id);
  if (!existing) throw new NotFoundError('Програму не знайдено');
  db.prepare('UPDATE programs SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  return { ok: true };
}
