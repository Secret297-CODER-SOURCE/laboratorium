import db from '../db/index.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as directionService from './direction.service.js';
import * as groupService from './group.service.js';
import * as programService from './program.service.js';

const BLOCK_TYPES = new Set([
  'heading', 'text', 'list', 'image', 'video', 'link', 'divider',
  'quote', 'callout', 'steps', 'cards',
]);

const DEFAULT_BLOCK_DATA = {
  heading: { level: 2, text: 'Заголовок' },
  text: { text: 'Текст параграфу...' },
  list: { style: 'bullet', items: ['Пункт 1', 'Пункт 2'] },
  image: { url: '', caption: '', alt: '' },
  video: { url: '' },
  link: { url: '', label: 'Дізнатись більше', style: 'primary' },
  divider: {},
  quote: { text: 'Цитата', author: '' },
  callout: { variant: 'info', title: 'Підказка', text: '' },
  steps: { items: [{ title: 'Крок 1', text: 'Опис кроку' }] },
  cards: { items: [{ title: 'Картка', text: 'Опис', emoji: 'pin-card' }] },
};

function parseBlockData(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function mapBlock(row) {
  return {
    id: row.id,
    block_type: row.block_type,
    data: parseBlockData(row.data),
    sort_order: row.sort_order,
  };
}

function mapSection(row, blocks) {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    sort_order: row.sort_order,
    blocks: blocks.filter(b => b.section_id === row.id).map(mapBlock),
  };
}

function mapPage(row, sections = []) {
  if (!row) return null;
  return {
    id: row.id,
    target_type: row.target_type,
    target_id: row.target_id,
    title: row.title,
    subtitle: row.subtitle,
    cover_gradient: row.cover_gradient || 'accent',
    is_published: !!row.is_published,
    sections,
    updated_at: row.updated_at,
  };
}

function getTargetMeta(targetType, targetId) {
  if (targetType === 'direction') {
    const d = directionService.getById(targetId);
    if (!d) throw new NotFoundError('Напрямок не знайдено');
    return { type: 'direction', id: targetId, name: d.name, label: 'Напрямок' };
  }
  if (targetType === 'group') {
    const g = groupService.getGroupById(targetId);
    if (!g) throw new NotFoundError('Групу не знайдено');
    return { type: 'group', id: targetId, name: g.name, label: 'Група' };
  }
  if (targetType === 'program') {
    const p = programService.getById(targetId);
    if (!p) throw new NotFoundError('Програму не знайдено');
    return { type: 'program', id: targetId, name: p.name, label: 'Програма' };
  }
  throw new ValidationError('Невірний тип контенту');
}

function assertCanEdit(targetType, targetId, actorId, actorRole) {
  if (actorRole === 'owner' || actorRole === 'developer') return;
  if (targetType === 'direction') {
    throw new ForbiddenError('Редагувати напрямки може лише адміністратор');
  }
  if (targetType === 'group') {
    const group = groupService.getGroupById(targetId);
    if (!group) throw new NotFoundError('Групу не знайдено');
    if (group.teacher_id !== actorId) throw new ForbiddenError('Немає доступу до цієї групи');
    return;
  }
  if (targetType === 'program') {
    throw new ForbiddenError('Редагувати програми може лише адміністратор');
  }
  throw new ForbiddenError();
}

function assertCanRead(targetType, targetId, userId, userRole) {
  if (userRole === 'owner' || userRole === 'developer') return;
  if (targetType === 'direction') return;
  if (targetType === 'program') return;
  if (targetType === 'group') {
    const member = db.prepare(`
      SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?
    `).get(targetId, userId);
    const group = groupService.getGroupById(targetId);
    if (group?.teacher_id === userId) return;
    if (!member) throw new ForbiddenError('Контент доступний лише учням групи');
  }
}

function loadPageTree(targetType, targetId) {
  const page = db.prepare(`
    SELECT * FROM content_pages WHERE target_type = ? AND target_id = ?
  `).get(targetType, targetId);

  if (!page) return null;

  const sections = db.prepare(`
    SELECT * FROM content_sections WHERE page_id = ? ORDER BY sort_order, id
  `).all(page.id);

  const sectionIds = sections.map(s => s.id);
  let blocks = [];
  if (sectionIds.length) {
    blocks = db.prepare(`
      SELECT * FROM content_blocks
      WHERE section_id IN (${sectionIds.map(() => '?').join(',')})
      ORDER BY sort_order, id
    `).all(...sectionIds);
  }

  return mapPage(page, sections.map(s => mapSection(s, blocks)));
}

function getOrCreatePageRow(targetType, targetId) {
  let page = db.prepare(`
    SELECT * FROM content_pages WHERE target_type = ? AND target_id = ?
  `).get(targetType, targetId);

  if (!page) {
    const meta = getTargetMeta(targetType, targetId);
    const result = db.prepare(`
      INSERT INTO content_pages (target_type, target_id, title, subtitle, cover_gradient, is_published)
      VALUES (?, ?, ?, ?, 'accent', 0)
    `).run(targetType, targetId, meta.name, null);
    page = db.prepare('SELECT * FROM content_pages WHERE id = ?').get(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO content_sections (page_id, title, icon, sort_order)
      VALUES (?, 'Основний розділ', 'book', 0)
    `).run(page.id);
  }

  return page;
}

export function getDefaultBlockData(blockType) {
  if (!BLOCK_TYPES.has(blockType)) throw new ValidationError('Невідомий тип блоку');
  return JSON.parse(JSON.stringify(DEFAULT_BLOCK_DATA[blockType] || {}));
}

export function getPageForEditor(targetType, targetId, actorId, actorRole) {
  assertCanEdit(targetType, targetId, actorId, actorRole);
  getOrCreatePageRow(targetType, targetId);
  const page = loadPageTree(targetType, targetId);
  const meta = getTargetMeta(targetType, targetId);
  return { page, meta, blockTypes: [...BLOCK_TYPES] };
}

export function getPageForViewer(targetType, targetId, userId, userRole, { allowDraft = false } = {}) {
  const page = loadPageTree(targetType, targetId);
  if (!page) throw new NotFoundError('Сторінку не знайдено');
  if (!page.is_published && !allowDraft) {
    if (userRole === 'owner' || userRole === 'developer') {
      // ok
    } else if (targetType === 'group') {
      const group = groupService.getGroupById(targetId);
      if (group?.teacher_id !== userId) throw new NotFoundError('Сторінку не опубліковано');
    } else {
      throw new NotFoundError('Сторінку не опубліковано');
    }
  }
  assertCanRead(targetType, targetId, userId, userRole);
  const meta = getTargetMeta(targetType, targetId);
  return { page, meta };
}

export function savePage(targetType, targetId, actorId, actorRole, payload) {
  assertCanEdit(targetType, targetId, actorId, actorRole);
  const pageRow = getOrCreatePageRow(targetType, targetId);

  const title = payload.title?.trim() || pageRow.title;
  const subtitle = payload.subtitle !== undefined ? (payload.subtitle?.trim() || null) : pageRow.subtitle;
  const coverGradient = payload.cover_gradient?.trim() || pageRow.cover_gradient || 'accent';
  const isPublished = payload.is_published === true ? 1 : (payload.is_published === false ? 0 : pageRow.is_published);

  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  if (!sections.length) throw new ValidationError('Додайте хоча б один розділ');

  const saveAll = db.transaction(() => {
    db.prepare(`
      UPDATE content_pages SET title = ?, subtitle = ?, cover_gradient = ?,
        is_published = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(title, subtitle, coverGradient, isPublished, pageRow.id);

    db.prepare('DELETE FROM content_sections WHERE page_id = ?').run(pageRow.id);

    sections.forEach((section, sIdx) => {
      const sectionTitle = section.title?.trim() || `Розділ ${sIdx + 1}`;
      const sectionResult = db.prepare(`
        INSERT INTO content_sections (page_id, title, icon, sort_order)
        VALUES (?, ?, ?, ?)
      `).run(
        pageRow.id,
        sectionTitle,
        section.icon?.trim() || null,
        sIdx,
      );
      const sectionId = sectionResult.lastInsertRowid;
      const blocks = Array.isArray(section.blocks) ? section.blocks : [];

      blocks.forEach((block, bIdx) => {
        if (!BLOCK_TYPES.has(block.block_type)) return;
        db.prepare(`
          INSERT INTO content_blocks (section_id, block_type, data, sort_order)
          VALUES (?, ?, ?, ?)
        `).run(
          sectionId,
          block.block_type,
          JSON.stringify(block.data || getDefaultBlockData(block.block_type)),
          bIdx,
        );
      });
    });
  });

  saveAll();
  return loadPageTree(targetType, targetId);
}

export function getContentStatus(targetType, targetId) {
  const row = db.prepare(`
    SELECT id, is_published, updated_at FROM content_pages
    WHERE target_type = ? AND target_id = ?
  `).get(targetType, targetId);
  return {
    has_page: !!row,
    is_published: !!row?.is_published,
    updated_at: row?.updated_at || null,
  };
}

export function listStudentGroupContent(userId) {
  return db.prepare(`
    SELECT g.id, g.name, g.color, cp.is_published, cp.updated_at
    FROM study_group_members gm
    JOIN study_groups g ON g.id = gm.group_id AND g.is_active = 1
    LEFT JOIN content_pages cp ON cp.target_type = 'group' AND cp.target_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.name
  `).all(userId).map(r => ({
    id: r.id,
    name: r.name,
    color: r.color,
    has_content: !!r.is_published,
    updated_at: r.updated_at,
  }));
}
