import db from '../db/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as notificationService from './notification.service.js';

function isStaffRole(role) {
  return role === 'owner' || role === 'developer' || role === 'teacher';
}

function slugify(text) {
  return String(text || '').toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || `manual_${Date.now().toString(36)}`;
}

function mapManual(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    direction_id: row.direction_id,
    direction_name: row.direction_name || null,
    review_status: row.review_status || 'draft',
    sort_order: row.sort_order,
    created_by: row.created_by,
    author_name: row.author_name || null,
    author_handle: row.author_handle || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_published: !!row.is_published,
    page_updated_at: row.page_updated_at || null,
  };
}

const WITH_PAGE_STATUS = `
  SELECT m.*, cp.is_published, cp.updated_at as page_updated_at,
    d.name as direction_name, u.name as author_name, u.handle as author_handle
  FROM manuals m
  LEFT JOIN content_pages cp ON cp.target_type = 'manual' AND cp.target_id = m.id
  LEFT JOIN directions d ON d.id = m.direction_id
  LEFT JOIN users u ON u.id = m.created_by
`;

export function listAdmin() {
  return db.prepare(`${WITH_PAGE_STATUS} ORDER BY m.sort_order, m.id`).all().map(mapManual);
}

export function listPublished() {
  return db.prepare(`${WITH_PAGE_STATUS} WHERE cp.is_published = 1 ORDER BY m.sort_order, m.id`).all().map(mapManual);
}

/** Мануали користувача — власні чернетки/надіслані/опубліковані, для «Мої мануали». */
export function listMine(userId) {
  return db.prepare(`${WITH_PAGE_STATUS} WHERE m.created_by = ? ORDER BY m.updated_at DESC`).all(userId).map(mapManual);
}

export function listPublishedForDirections(directionIds) {
  const ids = [...new Set((directionIds || []).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];
  return db.prepare(`
    ${WITH_PAGE_STATUS}
    WHERE cp.is_published = 1 AND m.direction_id IN (${ids.map(() => '?').join(',')})
    ORDER BY m.sort_order, m.id
  `).all(...ids).map(mapManual);
}

export function getById(id) {
  return mapManual(db.prepare(`${WITH_PAGE_STATUS} WHERE m.id = ?`).get(id));
}

export function getBySlug(slug) {
  return mapManual(db.prepare(`${WITH_PAGE_STATUS} WHERE m.slug = ?`).get(slug));
}

export function create(actorId, data) {
  const title = data.title?.trim();
  if (!title) throw new ValidationError('Вкажіть назву мануала');

  const slug = data.slug?.trim() ? slugify(data.slug) : slugify(title);
  if (db.prepare('SELECT id FROM manuals WHERE slug = ?').get(slug)) {
    throw new ConflictError('Slug вже зайнято');
  }

  const directionId = data.direction_id ? parseInt(data.direction_id, 10) : null;

  const result = db.prepare(`
    INSERT INTO manuals (slug, title, direction_id, sort_order, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    slug, title, directionId || null,
    parseInt(data.sort_order, 10) || 0, actorId || null,
  );

  return getById(result.lastInsertRowid);
}

function assertCanManage(actorId, actorRole, manual) {
  if (!manual) throw new NotFoundError('Мануал не знайдено');
  if (isStaffRole(actorRole)) return;
  if (manual.created_by !== actorId) throw new ForbiddenError('Ви можете керувати лише власними мануалами');
}

/** Single manual, permission-checked — for the self-service builder's status/direction sidebar. */
export function getForActor(actorId, actorRole, id) {
  const manual = getById(id);
  assertCanManage(actorId, actorRole, manual);
  return manual;
}

export function update(actorId, actorRole, id, data) {
  const existing = getById(id);
  assertCanManage(actorId, actorRole, existing);

  const title = data.title?.trim() || existing.title;
  const slug = data.slug?.trim() ? slugify(data.slug) : existing.slug;

  if (slug !== existing.slug && db.prepare('SELECT id FROM manuals WHERE slug = ? AND id != ?').get(slug, id)) {
    throw new ConflictError('Slug вже зайнято');
  }

  const directionId = data.direction_id !== undefined
    ? (data.direction_id ? parseInt(data.direction_id, 10) : null)
    : existing.direction_id;

  db.prepare(`
    UPDATE manuals SET slug = ?, title = ?, direction_id = ?, sort_order = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    slug, title, directionId || null,
    data.sort_order !== undefined ? (parseInt(data.sort_order, 10) || 0) : existing.sort_order,
    id,
  );

  return getById(id);
}

export function remove(actorId, actorRole, id) {
  const existing = getById(id);
  assertCanManage(actorId, actorRole, existing);

  const removeAll = db.transaction(() => {
    db.prepare(`DELETE FROM content_pages WHERE target_type = 'manual' AND target_id = ?`).run(id);
    db.prepare('DELETE FROM manuals WHERE id = ?').run(id);
  });
  removeAll();

  return { ok: true };
}

/** Автор надсилає власний чернетковий мануал на перевірку — сповіщає весь штат один раз. */
export function submitForReview(actorId, id) {
  const manual = getById(id);
  if (!manual) throw new NotFoundError('Мануал не знайдено');
  if (manual.created_by !== actorId) throw new ForbiddenError('Це не ваш мануал');
  if (manual.is_published) throw new ValidationError('Мануал вже опубліковано');

  const hasContent = db.prepare(`
    SELECT 1 FROM content_pages cp
    JOIN content_sections cs ON cs.page_id = cp.id
    JOIN content_blocks cb ON cb.section_id = cs.id
    WHERE cp.target_type = 'manual' AND cp.target_id = ?
    LIMIT 1
  `).get(id);
  if (!hasContent) throw new ValidationError('Додайте вміст мануала перед надсиланням на перевірку');

  db.prepare(`UPDATE manuals SET review_status = 'submitted', updated_at = datetime('now') WHERE id = ?`).run(id);

  const staffIds = db.prepare(`SELECT id FROM users WHERE role IN ('owner', 'developer', 'teacher')`).all().map((r) => r.id);
  const alreadyNotified = staffIds.filter((sid) => !notificationService.hasNotificationLike(sid, 'manual_review', { manualId: id }));
  notificationService.notifyUsers(alreadyNotified, {
    type: 'manual_review',
    title: `Новий мануал на перевірку: ${manual.title}`,
    body: `Автор: ${manual.author_name || 'учень'}`,
    link: `/content-builder.html?type=manual&id=${id}`,
    data: { manualId: id },
  });

  return getById(id);
}

/** Штат повертає мануал у чернетку (наприклад, після відхилення на модерації). */
export function returnToDraft(actorId, actorRole, id) {
  const manual = getById(id);
  if (!manual) throw new NotFoundError('Мануал не знайдено');
  if (!isStaffRole(actorRole)) throw new ForbiddenError();

  db.prepare(`UPDATE manuals SET review_status = 'draft', updated_at = datetime('now') WHERE id = ?`).run(id);
  if (manual.created_by) {
    notificationService.notifyUser(manual.created_by, {
      type: 'manual_returned',
      title: `Мануал повернено на доопрацювання: ${manual.title}`,
      body: 'Перевірте зауваження та надішліть повторно, коли будете готові.',
      link: `/content-builder.html?type=manual&id=${id}`,
      data: { manualId: id },
    });
  }
  return getById(id);
}
