import db from '../db/index.js';
import * as spySoftService from './spy-soft.service.js';
import * as digitalOceanService from './digitalocean.service.js';
import { interleave, toCatalogCard } from './external-manual.service.js';

function like(q) {
  return `%${String(q || '').trim().slice(0, 80)}%`;
}

async function safeRemote(fn) {
  try {
    return await fn();
  } catch (err) {
    return { results: [], error: err.message || 'unavailable', cached: false };
  }
}

export function searchPublic(query, { limit = 20 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return { query: q, results: [] };
  const pattern = like(q);
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 40);

  const programs = db.prepare(`
    SELECT p.id, p.name, p.description, p.level, p.slug, d.name AS direction_name
    FROM programs p
    LEFT JOIN directions d ON d.id = p.direction_id
    WHERE p.is_active = 1
      AND (IFNULL(d.is_active, 1) = 1)
      AND (
        p.name LIKE ? OR IFNULL(p.description,'') LIKE ? OR IFNULL(p.tags,'') LIKE ?
        OR IFNULL(d.name,'') LIKE ?
      )
    ORDER BY p.sort_order ASC, p.name COLLATE NOCASE
    LIMIT ?
  `).all(pattern, pattern, pattern, pattern, cap).map((p) => ({
    type: 'program',
    id: p.id,
    title: p.name,
    subtitle: [p.direction_name, p.level].filter(Boolean).join(' · '),
    href: `/course.html?id=${p.id}`,
  }));

  const directions = db.prepare(`
    SELECT id, name, description, slug FROM directions
    WHERE is_active = 1 AND (name LIKE ? OR IFNULL(description,'') LIKE ?)
    ORDER BY sort_order ASC LIMIT ?
  `).all(pattern, pattern, Math.min(cap, 10)).map((d) => ({
    type: 'direction',
    id: d.id,
    title: d.name,
    subtitle: 'Напрямок навчання',
    href: `/#programs`,
  }));

  const manuals = db.prepare(`
    SELECT m.id, m.title, d.name AS direction_name
    FROM manuals m
    LEFT JOIN content_pages cp ON cp.target_type = 'manual' AND cp.target_id = m.id
    LEFT JOIN directions d ON d.id = m.direction_id
    WHERE IFNULL(cp.is_published, 0) = 1
      AND m.title LIKE ?
    ORDER BY m.updated_at DESC LIMIT ?
  `).all(pattern, Math.min(cap, 10)).map((m) => ({
    type: 'manual',
    id: m.id,
    title: m.title,
    subtitle: m.direction_name || 'Мануал',
    href: `/manual.html?id=${m.id}`,
  }));

  return {
    query: q,
    results: [...programs, ...directions, ...manuals].slice(0, cap),
  };
}

/** Local site search + external manuals (opened on-site, no source labels). */
export async function searchPublicWithExternal(query, { limit = 20 } = {}) {
  const local = searchPublic(query, { limit });
  const q = local.query;
  if (q.length < 2) return local;

  const cap = Math.min(Math.max(Number(limit) || 20, 1), 40);
  const each = 4;

  const [spyRemote, doRemote] = await Promise.all([
    safeRemote(() => spySoftService.searchSpySoft(q, { limit: each, timeoutMs: 5000 })),
    safeRemote(() => digitalOceanService.searchDigitalOcean(q, { limit: each, timeoutMs: 5000 })),
  ]);

  const mixed = interleave(spyRemote.results || [], doRemote.results || []).map((r) => ({
    type: 'manual',
    id: r.url,
    title: r.title,
    subtitle: r.excerpt ? r.excerpt.slice(0, 90) : 'Мануал',
    href: `/manual.html?url=${encodeURIComponent(r.url)}`,
  }));

  return {
    query: q,
    results: [...local.results, ...mixed].slice(0, cap),
  };
}

/** Manuals page: local + interleaved external catalog (no source branding). */
export async function searchManualsCatalog(query, {
  userId = null,
  userRole = null,
  limit = 24,
  localManuals = null,
} = {}) {
  const q = String(query || '').trim().slice(0, 80);
  const cap = Math.min(Math.max(Number(limit) || 24, 1), 40);
  const needle = q.toLowerCase();

  const locals = (localManuals || []).filter((m) => {
    if (!needle) return true;
    const hay = `${m.title || ''} ${m.direction_name || ''}`.toLowerCase();
    return hay.includes(needle);
  }).slice(0, cap).map((m) => ({
    type: 'manual',
    id: m.id,
    title: m.title,
    subtitle: m.direction_name || 'Мануал',
    slug: m.slug,
    direction_id: m.direction_id,
    direction_name: m.direction_name,
    href: `/manual.html?slug=${encodeURIComponent(m.slug)}`,
    source: 'local',
  }));

  const remoteLimit = Math.min(12, cap);
  let spy = { results: [], error: null, cached: false };
  let doce = { results: [], error: null, cached: false };

  if (q.length >= 2) {
    [spy, doce] = await Promise.all([
      safeRemote(() => spySoftService.searchSpySoft(q, { limit: remoteLimit })),
      safeRemote(() => digitalOceanService.searchDigitalOcean(q, { limit: remoteLimit })),
    ]);
  } else {
    [spy, doce] = await Promise.all([
      safeRemote(() => spySoftService.listFeatured({ limit: 6 })),
      safeRemote(() => digitalOceanService.listFeatured({ limit: 6 })),
    ]);
  }

  const external = interleave(spy.results || [], doce.results || [])
    .map(toCatalogCard)
    .slice(0, Math.min(18, cap));

  const errors = [spy.error, doce.error].filter(Boolean);

  return {
    query: q,
    manuals: locals,
    external,
    error: external.length ? null : (errors[0] || null),
    meta: { userId, userRole },
  };
}
