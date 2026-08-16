import { api } from '/auth.js';

let allowedTabs = null;

const PORTAL_TAB_MAP = {
  '/dashboard.html': 'portal.cabinet',
  '/dashboard.html?tab=ctf': 'portal.ctf',
  '/dashboard.html?tab=tests': 'portal.tests',
  '/dashboard.html?tab=lab': 'portal.lab',
  '/conferences.html': 'portal.conferences',
  '/groups-chat.html': 'portal.chats',
};

const DASH_TAB_MAP = {
  home: 'dash.home',
  ctf: 'dash.ctf',
  tests: 'dash.tests',
  lab: 'dash.lab',
  article: 'dash.article',
};

export function setAllowedTabs(list) {
  allowedTabs = new Set(list || []);
}

export async function loadTabAccess() {
  try {
    const data = await api('/tab-access');
    allowedTabs = new Set(data.allowed || []);
    return data;
  } catch {
    allowedTabs = null;
    return { allowed: [], denied: [] };
  }
}

export function canAccessTab(key) {
  if (!key) return true;
  if (!allowedTabs) return true;
  return allowedTabs.has(key);
}

export function dashTabAllowed(tabId) {
  return canAccessTab(DASH_TAB_MAP[tabId] || tabId);
}

export function portalHrefAllowed(href) {
  const key = PORTAL_TAB_MAP[href];
  if (!key) return true;
  return canAccessTab(key);
}

export function pageAllowed(pageKey) {
  return canAccessTab(pageKey);
}

export function firstAllowedDashTab(fallback = 'home') {
  const order = ['home', 'ctf', 'tests', 'lab', 'article'];
  return order.find(t => dashTabAllowed(t)) || fallback;
}
