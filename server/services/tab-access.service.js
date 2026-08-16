import db from '../db/index.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';

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

function normalizeRule(rule, idx) {
  const roles = Array.isArray(rule.roles) ? rule.roles.filter(r => typeof r === 'string') : [];
  const userIds = Array.isArray(rule.userIds)
    ? rule.userIds.map(id => parseInt(id, 10)).filter(Number.isFinite)
    : [];
  const deny = Array.isArray(rule.deny) ? rule.deny.filter(k => ALL_KEYS.includes(k)) : [];
  return {
    id: rule.id || `rule-${idx + 1}`,
    name: String(rule.name || `Правило ${idx + 1}`).trim(),
    roles,
    userIds,
    deny,
  };
}

export function getTabAccessSettings() {
  const data = loadRaw();
  return {
    rules: data.rules.map(normalizeRule),
    tabs: TAB_DEFINITIONS,
  };
}

export function saveTabAccessSettings({ rules }) {
  if (!Array.isArray(rules)) throw new ValidationError('rules має бути масивом');
  const normalized = rules.map(normalizeRule);
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
  const denied = new Set();
  for (const rule of loadRaw().rules.map(normalizeRule)) {
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
