import db from '../db/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const CTF_API = 'https://ctftime.org/api/v1/events/';
const EVENT_SELECT = `
  SELECT ce.*, CASE
    WHEN ce.source = 'ctftime' THEN 'CTFtime'
    WHEN ce.audience_type = 'all' THEN 'Усі учні'
    WHEN ce.audience_type = 'group' THEN (SELECT name FROM study_groups WHERE id = ce.audience_id)
    WHEN ce.audience_type = 'student' THEN (SELECT handle FROM users WHERE id = ce.audience_id)
  END AS audience_label
  FROM calendar_events ce
`;

function parseDate(value, label) {
  const time = Date.parse(String(value || ''));
  if (!Number.isFinite(time)) throw new ValidationError(`Некоректна дата: ${label}`);
  return new Date(time).toISOString();
}

function httpUrl(value, label) {
  if (!value) return null;
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new ValidationError(`Некоректне посилання: ${label}`);
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new ValidationError(`Посилання має починатися з http:// або https://`);
  }
  return url.href.slice(0, 1000);
}

export function getMonthRange(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || ''));
  if (!match) throw new ValidationError('Місяць має бути у форматі YYYY-MM');
  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
  return { from: start.toISOString(), to: end.toISOString() };
}

export function listForStudent(userId, month) {
  const { from, to } = getMonthRange(month);
  const groupIds = db.prepare(`
    SELECT group_id FROM study_group_members WHERE user_id = ?
  `).all(userId).map((row) => row.group_id);
  const audience = ['(ce.audience_type = \'all\')', '(ce.audience_type = \'student\' AND ce.audience_id = ?)'];
  const params = [userId];
  if (groupIds.length) {
    audience.push(`(ce.audience_type = 'group' AND ce.audience_id IN (${groupIds.map(() => '?').join(',')}))`);
    params.push(...groupIds);
  }
  return db.prepare(`
    ${EVENT_SELECT}
    WHERE (${audience.join(' OR ')})
      AND ce.starts_at < ? AND COALESCE(ce.ends_at, ce.starts_at) >= ?
    ORDER BY ce.starts_at ASC, ce.id ASC
  `).all(...params, to, from);
}

export function listForAdmin(month) {
  if (!month) {
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    return db.prepare(`
      ${EVENT_SELECT}
      WHERE COALESCE(ce.ends_at, ce.starts_at) >= ?
      ORDER BY ce.starts_at ASC, ce.id ASC
      LIMIT 500
    `).all(from);
  }
  const { from, to } = getMonthRange(month);
  return db.prepare(`
    ${EVENT_SELECT}
    WHERE ce.starts_at < ? AND COALESCE(ce.ends_at, ce.starts_at) >= ?
    ORDER BY ce.starts_at ASC, ce.id ASC
  `).all(to, from);
}

export function createManualEvent(actorId, data) {
  const title = String(data.title || '').trim();
  const description = String(data.description || '').trim();
  const audienceType = data.audience_type || 'all';
  if (!title || title.length > 180) throw new ValidationError('Назва події має містити від 1 до 180 символів');
  if (description.length > 4000) throw new ValidationError('Опис події не може перевищувати 4000 символів');
  if (!['all', 'group', 'student'].includes(audienceType)) throw new ValidationError('Оберіть аудиторію події');

  let audienceId = null;
  if (audienceType !== 'all') {
    audienceId = Number(data.audience_id);
    if (!Number.isInteger(audienceId) || audienceId <= 0) throw new ValidationError('Оберіть групу або учня');
    const exists = audienceType === 'group'
      ? db.prepare('SELECT id FROM study_groups WHERE id = ? AND is_active = 1').get(audienceId)
      : db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(audienceId);
    if (!exists) throw new ValidationError('Обрану групу або учня не знайдено');
  }

  const startsAt = parseDate(data.starts_at, 'початку');
  const endsAt = data.ends_at ? parseDate(data.ends_at, 'завершення') : null;
  if (endsAt && endsAt < startsAt) throw new ValidationError('Завершення події не може бути раніше початку');
  const url = httpUrl(data.url, 'події');
  const result = db.prepare(`
    INSERT INTO calendar_events
      (source, audience_type, audience_id, title, description, starts_at, ends_at, url, created_by)
    VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(audienceType, audienceId, title, description, startsAt, endsAt, url, actorId);
  return db.prepare(`${EVENT_SELECT} WHERE ce.id = ?`).get(result.lastInsertRowid);
}

export function deleteManualEvent(id) {
  const result = db.prepare("DELETE FROM calendar_events WHERE id = ? AND source = 'manual'").run(id);
  if (!result.changes) throw new NotFoundError('Подію не знайдено');
  return { ok: true };
}

function monthStart(date, offset) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function cleanText(value, limit) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, limit);
}

function mapCtfEvent(event) {
  const id = Number(event?.id);
  const startsAt = Date.parse(event?.start);
  if (!Number.isSafeInteger(id) || id <= 0 || !event.title || !Number.isFinite(startsAt)) return null;
  const endsTime = Date.parse(event.finish || '');
  const startIso = new Date(startsAt).toISOString();
  const endIso = Number.isFinite(endsTime) && endsTime >= startsAt ? new Date(endsTime).toISOString() : null;
  return {
    id: String(id),
    title: cleanText(event.title, 180),
    description: cleanText(event.description, 4000),
    startsAt: startIso,
    endsAt: endIso,
    url: safeApiUrl(event.url),
    sourceUrl: `https://ctftime.org/event/${id}/`,
  };
}

function safeApiUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.href.slice(0, 1000) : null;
  } catch {
    return null;
  }
}

export async function syncCtfEvents({ now = new Date(), fetchImpl = fetch } = {}) {
  const eventsById = new Map();
  for (let offset = 0; offset < 3; offset += 1) {
    const start = monthStart(now, offset);
    const finish = monthStart(now, offset + 1);
    const query = new URLSearchParams({
      limit: '100',
      start: String(Math.floor(start.getTime() / 1000)),
      finish: String(Math.floor(finish.getTime() / 1000)),
    });
    const response = await fetchImpl(`${CTF_API}?${query}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'laboratorium-calendar/1.0 (+https://laboratorium.club)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`CTFtime API повернув HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error('Відповідь CTFtime API перевищила допустимий розмір');
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error('CTFtime API повернув некоректний JSON');
    }
    if (!Array.isArray(payload)) throw new Error('CTFtime API повернув не список подій');
    for (const event of payload) {
      const mapped = mapCtfEvent(event);
      if (mapped) eventsById.set(mapped.id, mapped);
    }
  }

  const upsert = db.prepare(`
    INSERT INTO calendar_events
      (source, external_id, audience_type, audience_id, title, description, starts_at, ends_at, url, source_url)
    VALUES ('ctftime', ?, 'all', NULL, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
      title = excluded.title, description = excluded.description, starts_at = excluded.starts_at,
      ends_at = excluded.ends_at, url = excluded.url, source_url = excluded.source_url,
      updated_at = datetime('now')
  `);
  const countBefore = db.prepare("SELECT COUNT(*) AS count FROM calendar_events WHERE source = 'ctftime'").get().count;
  const save = db.transaction((events) => {
    for (const event of events) {
      upsert.run(event.id, event.title, event.description, event.startsAt, event.endsAt, event.url, event.sourceUrl);
    }
    const month = now.toISOString().slice(0, 7);
    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at) VALUES ('ctftime_calendar_sync_month', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(month);
    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at) VALUES ('ctftime_calendar_sync_at', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(new Date().toISOString());
  });
  save([...eventsById.values()]);
  const countAfter = db.prepare("SELECT COUNT(*) AS count FROM calendar_events WHERE source = 'ctftime'").get().count;
  return { imported: eventsById.size, total: countAfter, added: Math.max(0, countAfter - countBefore), month: now.toISOString().slice(0, 7) };
}

export function getCtfSyncStatus() {
  const rows = db.prepare(`
    SELECT key, value FROM platform_settings
    WHERE key IN ('ctftime_calendar_sync_month', 'ctftime_calendar_sync_at')
  `).all();
  return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
}

export function startCtfCalendarScheduler() {
  let timer;
  const scheduleNext = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
    timer.unref?.();
  };
  const run = async () => {
    const month = new Date().toISOString().slice(0, 7);
    const status = getCtfSyncStatus();
    if (status.ctftime_calendar_sync_month !== month) {
      try {
        const result = await syncCtfEvents();
        console.info(`[calendar] CTFtime sync complete: ${result.imported} events for ${result.month}`);
      } catch (error) {
        console.error('[calendar] CTFtime sync failed:', error.message);
        scheduleNext(60 * 60 * 1000);
        return;
      }
    }
    const now = new Date();
    if (getCtfSyncStatus().ctftime_calendar_sync_month !== now.toISOString().slice(0, 7)) {
      scheduleNext(60_000);
      return;
    }
    const nextMonth = monthStart(now, 1);
    nextMonth.setUTCHours(3, 0, 0, 0);
    scheduleNext(Math.max(60_000, nextMonth.getTime() - now.getTime()));
  };
  run();
  return () => clearTimeout(timer);
}
