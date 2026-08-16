import db from '../db/index.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { STUDENT_MEMBER_ROLES } from '../utils/roles.js';

function mapArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    group_id: row.group_id,
    title: row.title,
    content: row.content,
    status: row.status,
    submitted_at: row.submitted_at,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    group_name: row.group_name,
    author_handle: row.author_handle,
    author_name: row.author_name,
  };
}

const articleSelect = `
  SELECT a.*, g.name as group_name, u.handle as author_handle, u.name as author_name
  FROM articles a
  LEFT JOIN study_groups g ON g.id = a.group_id
  LEFT JOIN users u ON u.id = a.user_id
`;

export function studentCanWriteArticles(userId) {
  const row = db.prepare(`
    SELECT 1 as ok
    FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    WHERE gm.user_id = ? AND gm.member_role = 'author'
    LIMIT 1
  `).get(userId);
  return !!row;
}

export function getStudentMemberRoles(userId) {
  const roles = db.prepare(`
    SELECT DISTINCT gm.member_role
    FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    WHERE gm.user_id = ?
  `).all(userId).map(r => r.member_role);
  return roles.filter(r => r && r !== 'student');
}

export function listForUser(userId) {
  return db.prepare(`
    ${articleSelect}
    WHERE a.user_id = ?
    ORDER BY a.updated_at DESC
  `).all(userId).map(mapArticle);
}

export function getById(articleId, userId) {
  const row = db.prepare(`${articleSelect} WHERE a.id = ? AND a.user_id = ?`).get(articleId, userId);
  if (!row) throw new NotFoundError('Статтю не знайдено');
  return mapArticle(row);
}

function assertAuthorAccess(userId) {
  if (!studentCanWriteArticles(userId)) {
    throw new ForbiddenError('Роль «Автор» не призначена. Зверніться до викладача.');
  }
}

export function create(userId, { title, content, group_id }) {
  assertAuthorAccess(userId);
  const trimmedTitle = title?.trim();
  const trimmedContent = content?.trim();
  if (!trimmedTitle) throw new ValidationError('Вкажіть заголовок статті');
  if (!trimmedContent) throw new ValidationError('Напишіть текст статті');

  let groupId = group_id ? parseInt(group_id, 10) : null;
  if (groupId) {
    const membership = db.prepare(`
      SELECT 1 FROM study_group_members
      WHERE group_id = ? AND user_id = ? AND member_role = 'author'
    `).get(groupId, userId);
    if (!membership) groupId = null;
  }

  if (!groupId) {
    const firstGroup = db.prepare(`
      SELECT gm.group_id FROM study_group_members gm
      JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
      WHERE gm.user_id = ? AND gm.member_role = 'author'
      ORDER BY gm.joined_at LIMIT 1
    `).get(userId);
    groupId = firstGroup?.group_id || null;
  }

  const result = db.prepare(`
    INSERT INTO articles (user_id, group_id, title, content, status)
    VALUES (?, ?, ?, ?, 'draft')
  `).run(userId, groupId, trimmedTitle, trimmedContent);

  return mapArticle(db.prepare(`${articleSelect} WHERE a.id = ?`).get(result.lastInsertRowid));
}

export function update(userId, articleId, { title, content }) {
  assertAuthorAccess(userId);
  const article = getById(articleId, userId);
  if (article.status !== 'draft') {
    throw new ValidationError('Редагувати можна лише чернетки');
  }

  const trimmedTitle = title?.trim();
  const trimmedContent = content?.trim();
  if (!trimmedTitle) throw new ValidationError('Вкажіть заголовок статті');
  if (!trimmedContent) throw new ValidationError('Напишіть текст статті');

  db.prepare(`
    UPDATE articles SET title = ?, content = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(trimmedTitle, trimmedContent, articleId, userId);

  return getById(articleId, userId);
}

export function submit(userId, articleId) {
  assertAuthorAccess(userId);
  const article = getById(articleId, userId);
  if (article.status !== 'draft') {
    throw new ValidationError('Статтю вже надіслано');
  }

  db.prepare(`
    UPDATE articles SET status = 'submitted', submitted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(articleId, userId);

  return getById(articleId, userId);
}

export function listSubmittedForTeacher(actorId, actorRole) {
  let sql = `
    ${articleSelect}
    WHERE a.status IN ('submitted', 'published')
  `;
  const params = [];

  if (actorRole === 'teacher') {
    sql += ` AND a.group_id IN (SELECT id FROM study_groups WHERE teacher_id = ? AND is_active = 1)`;
    params.push(actorId);
  }

  sql += ' ORDER BY a.submitted_at DESC, a.updated_at DESC LIMIT 100';
  return db.prepare(sql).all(...params).map(mapArticle);
}
