import db from '../db/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as notificationService from './notification.service.js';
import * as groupService from './group.service.js';

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
    group_id: row.group_id,
    group_name: row.group_name || null,
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
    d.name as direction_name, g.name as group_name, u.name as author_name, u.handle as author_handle
  FROM manuals m
  LEFT JOIN content_pages cp ON cp.target_type = 'manual' AND cp.target_id = m.id
  LEFT JOIN directions d ON d.id = m.direction_id
  LEFT JOIN study_groups g ON g.id = m.group_id
  LEFT JOIN users u ON u.id = m.created_by
`;

export function listAdmin() {
  return db.prepare(`${WITH_PAGE_STATUS} ORDER BY m.sort_order, m.id`).all().map(mapManual);
}

function studentEffectiveDirectionIds(userId) {
  return db.prepare(`
    SELECT DISTINCT COALESCE(g.direction_id, p.direction_id) as direction_id
    FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id
    LEFT JOIN programs p ON p.id = g.program_id
    WHERE gm.user_id = ? AND COALESCE(g.direction_id, p.direction_id) IS NOT NULL
  `).all(userId).map((r) => r.direction_id);
}

/**
 * Visibility precedence (mirrors quizzes' group_id-then-direction fallback):
 * a manual pinned to a specific group is visible only to that group's
 * members; one with just a direction is visible to any group under that
 * direction (today's behavior); one with neither stays globally visible.
 * Staff always see every published manual, unfiltered.
 */
export function listPublished(userId, userRole) {
  const base = `${WITH_PAGE_STATUS} WHERE cp.is_published = 1`;
  if (!userId || isStaffRole(userRole)) {
    return db.prepare(`${base} ORDER BY m.sort_order, m.id`).all().map(mapManual);
  }

  const groupIds = groupService.getStudentGroupIds(userId);
  const directionIds = studentEffectiveDirectionIds(userId);

  const clauses = ['(m.group_id IS NULL AND m.direction_id IS NULL)'];
  const params = [];
  if (groupIds.length) {
    clauses.push(`m.group_id IN (${groupIds.map(() => '?').join(',')})`);
    params.push(...groupIds);
  }
  if (directionIds.length) {
    clauses.push(`(m.group_id IS NULL AND m.direction_id IN (${directionIds.map(() => '?').join(',')}))`);
    params.push(...directionIds);
  }

  return db.prepare(`${base} AND (${clauses.join(' OR ')}) ORDER BY m.sort_order, m.id`)
    .all(...params).map(mapManual);
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
  const groupId = data.group_id ? parseInt(data.group_id, 10) : null;

  const result = db.prepare(`
    INSERT INTO manuals (slug, title, direction_id, group_id, sort_order, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    slug, title, directionId || null, groupId || null,
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
  const groupId = data.group_id !== undefined
    ? (data.group_id ? parseInt(data.group_id, 10) : null)
    : existing.group_id;

  db.prepare(`
    UPDATE manuals SET slug = ?, title = ?, direction_id = ?, group_id = ?, sort_order = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    slug, title, directionId || null, groupId || null,
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

function assertManualCommentAccess(manualId, userId, userRole) {
  const visible = listPublished(userId, userRole).some((manual) => manual.id === manualId);
  if (!visible) throw new NotFoundError('Мануал не знайдено');
}

export function listComments(manualId, userId, userRole) {
  assertManualCommentAccess(manualId, userId, userRole);
  return db.prepare(`
    SELECT c.id, c.manual_id, c.user_id, c.body, c.created_at,
      u.handle, u.name
    FROM manual_comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.manual_id = ?
    ORDER BY c.created_at, c.id
  `).all(manualId);
}

export function addComment(manualId, userId, userRole, body) {
  assertManualCommentAccess(manualId, userId, userRole);
  const text = String(body || '').trim();
  if (!text) throw new ValidationError('Напишіть коментар');
  if (text.length > 2000) throw new ValidationError('Коментар має містити не більше 2000 символів');

  const result = db.prepare(`
    INSERT INTO manual_comments (manual_id, user_id, body)
    VALUES (?, ?, ?)
  `).run(manualId, userId, text);
  return db.prepare(`
    SELECT c.id, c.manual_id, c.user_id, c.body, c.created_at,
      u.handle, u.name
    FROM manual_comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
}

export function deleteComment(commentId, userId, userRole) {
  const comment = db.prepare('SELECT id, manual_id, user_id FROM manual_comments WHERE id = ?').get(commentId);
  if (!comment) throw new NotFoundError('Коментар не знайдено');
  assertManualCommentAccess(comment.manual_id, userId, userRole);
  if (comment.user_id !== userId && !isStaffRole(userRole)) throw new ForbiddenError();
  db.prepare('DELETE FROM manual_comments WHERE id = ?').run(commentId);
}
