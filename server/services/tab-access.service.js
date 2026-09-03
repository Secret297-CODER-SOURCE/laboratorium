import db from '../db/index.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import * as directionService from './direction.service.js';

const SETTINGS_KEY = 'tab_access';

export const TAB_DEFINITIONS = [
  { key: 'dash.home', label: 'Кабінет — Головна', group: 'Кабінет' },
  { key: 'dash.ctf', label: 'Кабінет — CTF', group: 'Кабінет' },
  { key: 'dash.tests', label: 'Кабінет — Тести', group: 'Кабінет' },
  { key: 'dash.lab', label: 'Кабінет — Лабораторія', group: 'Кабінет' },
  { key: 'dash.article', label: 'Кабінет — Статті', group: 'Кабінет' },
  { key: 'portal.cabinet', label: 'Портал — Кабінет', group: 'Портал' },
  { key: 'portal.ctf', label: 'Портал — CTF', group: 'Портал' },
  { key: 'portal.tests', label: 'Портал — Тести', group: 'Портал' },
  { key: 'portal.lab', label: 'Портал — Лабораторія', group: 'Портал' },
  { key: 'portal.conferences', label: 'Портал — Конференції', group: 'Портал' },
  { key: 'portal.chats', label: 'Портал — Чати', group: 'Портал' },
  { key: 'page.conferences', label: 'Сторінка — Конференції', group: 'Сторінки' },
  { key: 'page.recordings', label: 'Сторінка — Записи', group: 'Сторінки' },
  { key: 'page.groups_chat', label: 'Сторінка — Чати груп', group: 'Сторінки' },
];

const ALL_KEYS = TAB_DEFINITIONS.map(t => t.key);

const BYPASS_ROLES = new Set(['owner', 'developer']);

function loadRaw() {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(SETTINGS_KEY);
  if (!row?.value) return { rules: [] };
  try {
    const parsed = JSON.parse(row.value);
    return { rules: Array.isArray(parsed.rules) ? parsed.rules : [] };
  } catch {
    return { rules: [] };
  }
}

/** `direction:<id>` deny keys are dynamic (directions are admin-created data,
 * not a fixed list like TAB_DEFINITIONS) — valid as long as the id refers to
 * a direction that still exists. A direction later marked inactive keeps
 * its existing deny rules valid (an admin re-activating it shouldn't have
 * silently lost the rule), it just becomes redundant with the is_active flag. */
function isValidDenyKey(key, directionIds) {
  if (ALL_KEYS.includes(key)) return true;
  const m = /^direction:(\d+)$/.exec(key);
  return !!m && directionIds.has(Number(m[1]));
}

function normalizeRule(rule, idx, directionIds) {
  const roles = Array.isArray(rule.roles) ? rule.roles.filter(r => typeof r === 'string') : [];
  const userIds = Array.isArray(rule.userIds)
    ? rule.userIds.map(id => parseInt(id, 10)).filter(Number.isFinite)
    : [];
  const deny = Array.isArray(rule.deny) ? rule.deny.filter(k => isValidDenyKey(k, directionIds)) : [];
  return {
    id: rule.id || `rule-${idx + 1}`,
    name: String(rule.name || `Правило ${idx + 1}`).trim(),
    roles,
    userIds,
    deny,
  };
}

function currentDirectionIds() {
  return new Set(directionService.getAll().map(d => d.id));
}

export function getTabAccessSettings() {
  const data = loadRaw();
  const directionIds = currentDirectionIds();
  return {
    rules: data.rules.map((r, idx) => normalizeRule(r, idx, directionIds)),
    tabs: TAB_DEFINITIONS,
    // Full list (incl. inactive) so an existing rule tied to a closed
    // direction stays visible/manageable in the admin UI instead of
    // silently disappearing.
    directions: directionService.getAll(),
  };
}

export function saveTabAccessSettings({ rules }) {
  if (!Array.isArray(rules)) throw new ValidationError('rules має бути масивом');
  const directionIds = currentDirectionIds();
  const normalized = rules.map((r, idx) => normalizeRule(r, idx, directionIds));
  const payload = JSON.stringify({ rules: normalized });
  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(SETTINGS_KEY, payload);
  return getTabAccessSettings();
}

function userMatchesRule(user, rule) {
  if (!user) return false;
  if (rule.roles?.includes(user.role)) return true;
  if (rule.userIds?.includes(user.id)) return true;
  return false;
}

export function getDeniedTabs(user) {
  if (!user || BYPASS_ROLES.has(user.role)) return new Set();
  const directionIds = currentDirectionIds();
  const denied = new Set();
  for (const rule of loadRaw().rules.map((r, idx) => normalizeRule(r, idx, directionIds))) {
    if (!userMatchesRule(user, rule)) continue;
    for (const key of rule.deny) denied.add(key);
  }
  return denied;
}

export function isTabAllowed(user, tabKey) {
  if (!tabKey) return true;
  if (!user || BYPASS_ROLES.has(user.role)) return true;
  return !getDeniedTabs(user).has(tabKey);
}

export function getAllowedTabs(user) {
  const denied = getDeniedTabs(user);
  return ALL_KEYS.filter(k => !denied.has(k));
}

/** Directions denied for this user via a role/user-scoped access rule — on
 * top of (not instead of) the direction's own global is_active flag. */
export function isDirectionAllowed(user, directionId) {
  if (!directionId) return true;
  return isTabAllowed(user, `direction:${directionId}`);
}

export function assertTabAccess(user, tabKey) {
  if (!isTabAllowed(user, tabKey)) {
    throw new ForbiddenError('Доступ до цього розділу обмежено адміністратором');
  }
}

export function assertAnyTabAccess(user, tabKeys) {
  if (!tabKeys?.length) return;
  if (tabKeys.some(k => isTabAllowed(user, k))) return;
  throw new ForbiddenError('Доступ до цього розділу обмежено адміністратором');
}
