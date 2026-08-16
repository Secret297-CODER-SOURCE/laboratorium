import db from '../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `dir_${Date.now().toString(36)}`;
}

function mapDirection(row) {
  if (!row) return null;
  return { ...row, is_active: !!row.is_active };
}

export function getAllActive() {
  return db.prepare(`
    SELECT * FROM directions WHERE is_active = 1 ORDER BY sort_order, id
  `).all().map(mapDirection);
}

export function getAll() {
  return db.prepare('SELECT * FROM directions ORDER BY sort_order, id').all().map(mapDirection);
}

export function getById(id) {
  return mapDirection(db.prepare('SELECT * FROM directions WHERE id = ?').get(id));
}

export function getPublicWithPrograms() {
  const directions = getAllActive();
  const programs = db.prepare(`
    SELECT * FROM programs WHERE is_active = 1 ORDER BY sort_order, id
  `).all().map(p => ({ ...p, tags: p.tags ? p.tags.split(',') : [], is_featured: !!p.is_featured }));

  const contentFlags = db.prepare(`
    SELECT target_id, is_published FROM content_pages WHERE target_type = 'direction'
  `).all();
  const contentMap = Object.fromEntries(contentFlags.map(r => [r.target_id, !!r.is_published]));

  return directions.map(d => ({
    ...d,
    programs: programs.filter(p => p.direction_id === d.id),
    has_content: !!contentMap[d.id],
  }));
}

export function create(data) {
  const name = data.name?.trim();
  if (!name) throw new ValidationError('Вкажіть назву напрямку');

  const slug = data.slug?.trim() || slugify(name);
  if (db.prepare('SELECT id FROM directions WHERE slug = ?').get(slug)) {
    throw new ConflictError('Slug вже зайнято');
  }

  const result = db.prepare(`
    INSERT INTO directions (slug, name, description, icon, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    slug, name, data.description?.trim() || null, data.icon?.trim() || null,
    parseInt(data.sort_order, 10) || 0, data.is_active === false ? 0 : 1,
  );

  return getById(result.lastInsertRowid);
}

export function update(id, data) {
  const existing = getById(id);
  if (!existing) throw new NotFoundError('Напрямок не знайдено');

  const name = data.name?.trim() || existing.name;
  const slug = data.slug?.trim() || existing.slug;

  if (slug !== existing.slug && db.prepare('SELECT id FROM directions WHERE slug = ? AND id != ?').get(slug, id)) {
    throw new ConflictError('Slug вже зайнято');
  }

  db.prepare(`
    UPDATE directions SET slug = ?, name = ?, description = ?, icon = ?,
      sort_order = ?, is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    slug, name,
    data.description !== undefined ? (data.description?.trim() || null) : existing.description,
    data.icon !== undefined ? (data.icon?.trim() || null) : existing.icon,
    data.sort_order !== undefined ? (parseInt(data.sort_order, 10) || 0) : existing.sort_order,
    data.is_active === false ? 0 : (data.is_active === true ? 1 : (existing.is_active ? 1 : 0)),
    id,
  );

  return getById(id);
}

export function remove(id) {
  const existing = getById(id);
  if (!existing) throw new NotFoundError('Напрямок не знайдено');

  const progCount = db.prepare('SELECT COUNT(*) as c FROM programs WHERE direction_id = ?').get(id).c;
  if (progCount > 0) throw new ValidationError('Спочатку видаліть або перемістіть програми цього напрямку');

  db.prepare('DELETE FROM directions WHERE id = ?').run(id);
  return { ok: true };
}
