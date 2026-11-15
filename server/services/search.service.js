import db from '../db/index.js';

function like(q) {
  return `%${String(q || '').trim().slice(0, 80)}%`;
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
