import db from '../db/index.js';
import { ValidationError } from '../utils/errors.js';
import * as contentService from './content.service.js';
import * as programService from './program.service.js';

const FORMAT = 'laboratorium-training-programs';
const VERSION = 1;
const MAX_PROGRAMS = 500;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function cleanPage(page) {
  if (!page) return null;
  return {
    title: page.title,
    subtitle: page.subtitle,
    cover_gradient: page.cover_gradient,
    is_published: page.is_published,
    sections: page.sections.map((section) => ({
      title: section.title,
      icon: section.icon,
      blocks: section.blocks.map((block) => ({
        block_type: block.block_type,
        data: block.data,
      })),
    })),
  };
}

export function exportPrograms() {
  const programs = programService.getAllAdmin().map((program) => {
    const {
      id, direction_id, direction_name, direction_slug, ...fields
    } = program;
    return {
      ...fields,
      tags: program.tags,
      direction_slug: direction_slug || null,
      content: cleanPage(contentService.getProgramPageForExport(id)),
    };
  });

  return {
    format: FORMAT,
    version: VERSION,
    exported_at: new Date().toISOString(),
    programs,
  };
}

function validateImport(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('JSON має містити об’єкт експорту програм');
  }
  if (payload.format !== FORMAT || payload.version !== VERSION) {
    throw new ValidationError(`Підтримується формат ${FORMAT}, версія ${VERSION}`);
  }
  if (!Array.isArray(payload.programs) || payload.programs.length === 0 || payload.programs.length > MAX_PROGRAMS) {
    throw new ValidationError(`Додайте від 1 до ${MAX_PROGRAMS} програм у полі programs`);
  }

  const seen = new Set();
  return payload.programs.map((program, index) => {
    const label = `Програма ${index + 1}`;
    if (!program || typeof program !== 'object' || Array.isArray(program)) {
      throw new ValidationError(`${label}: очікується JSON-об’єкт`);
    }
    if (typeof program.slug !== 'string' || !SLUG_PATTERN.test(program.slug.trim())) {
      throw new ValidationError(`${label}: slug має містити лише літери, цифри, дефіс або підкреслення`);
    }
    const slug = program.slug.trim().toLowerCase();
    if (seen.has(slug)) throw new ValidationError(`${label}: slug "${slug}" повторюється`);
    seen.add(slug);
    if (typeof program.name !== 'string' || !program.name.trim()) {
      throw new ValidationError(`${label} (${slug}): вкажіть name`);
    }
    for (const field of ['level', 'duration', 'description']) {
      if (program[field] !== undefined && program[field] !== null && typeof program[field] !== 'string') {
        throw new ValidationError(`${label} (${slug}): ${field} має бути рядком`);
      }
    }
    for (const field of ['bounty_reward', 'sort_order']) {
      if (program[field] !== undefined && (!Number.isInteger(program[field]) || program[field] < 0)) {
        throw new ValidationError(`${label} (${slug}): ${field} має бути невід’ємним цілим числом`);
      }
    }
    for (const field of ['is_featured', 'is_active']) {
      if (program[field] !== undefined && typeof program[field] !== 'boolean') {
        throw new ValidationError(`${label} (${slug}): ${field} має бути true або false`);
      }
    }
    if (program.tags !== undefined
      && (!Array.isArray(program.tags) || program.tags.some((tag) => typeof tag !== 'string'))) {
      throw new ValidationError(`${label} (${slug}): tags має бути масивом рядків`);
    }
    if (program.content !== undefined && program.content !== null) {
      if (!Array.isArray(program.content.sections) || !program.content.sections.length) {
        throw new ValidationError(`${label} (${slug}): content.sections має містити хоча б один розділ`);
      }
      if (program.content.is_published !== undefined && typeof program.content.is_published !== 'boolean') {
        throw new ValidationError(`${label} (${slug}): content.is_published має бути true або false`);
      }
      for (const [sectionIndex, section] of program.content.sections.entries()) {
        if (!section || typeof section !== 'object' || !Array.isArray(section.blocks || [])) {
          throw new ValidationError(`${label} (${slug}), розділ ${sectionIndex + 1}: некоректні blocks`);
        }
        for (const [blockIndex, block] of (section.blocks || []).entries()) {
          if (!block || !contentService.BLOCK_TYPES.has(block.block_type)) {
            throw new ValidationError(`${label} (${slug}), блок ${blockIndex + 1}: невідомий block_type`);
          }
          if (block.data !== undefined && (block.data === null || typeof block.data !== 'object')) {
            throw new ValidationError(`${label} (${slug}), блок ${blockIndex + 1}: data має бути об’єктом`);
          }
        }
      }
    }
    return { ...program, slug };
  });
}

function resolveDirectionId(directionSlug, programSlug) {
  if (directionSlug === undefined) return undefined;
  if (directionSlug === null || directionSlug === '') return null;
  if (typeof directionSlug !== 'string') {
    throw new ValidationError(`Програма (${programSlug}): direction_slug має бути рядком або null`);
  }
  const direction = db.prepare('SELECT id FROM directions WHERE slug = ?').get(directionSlug.trim());
  if (!direction) {
    throw new ValidationError(`Програма (${programSlug}): напрямок "${directionSlug}" не знайдено`);
  }
  return direction.id;
}

export function importPrograms(payload, actorId, actorRole) {
  const programs = validateImport(payload);
  const importAll = db.transaction(() => programs.map((program) => {
    const directionId = resolveDirectionId(program.direction_slug, program.slug);
    const existing = db.prepare('SELECT id FROM programs WHERE slug = ?').get(program.slug);
    const fields = { ...program };
    if (directionId !== undefined) fields.direction_id = directionId;
    else if (!existing) fields.direction_id = null;
    const saved = existing
      ? programService.update(existing.id, fields)
      : programService.create(fields);

    if (program.content !== undefined && program.content !== null) {
      contentService.savePage('program', saved.id, actorId, actorRole, program.content);
    }
    return { slug: saved.slug, id: saved.id, action: existing ? 'updated' : 'created' };
  }));

  return importAll();
}
