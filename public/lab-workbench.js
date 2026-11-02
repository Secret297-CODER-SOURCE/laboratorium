// Pure, offline logic for the Lab "Tools" workbench.
// Every function here operates only on data the student pastes in themselves.
// Nothing opens a network connection, resolves a hostname, or contacts any
// third-party system — this is a local analysis notebook, not a scanner.

const PROJECTS_KEY = 'lab_workbench_projects_v1';

export function textToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary);
}

export function base64ToText(value) {
  const binary = atob(value.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseHeaders(raw) {
  return new Map(String(raw).split(/\r?\n/)
    .map((line) => line.match(/^\s*([^:]+)\s*:\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1].toLowerCase(), m[2]]));
}

export function analyzeHeaders(raw) {
  const headers = parseHeaders(raw);
  return [
    { label: 'Content-Security-Policy', ok: headers.has('content-security-policy') },
    { label: 'Strict-Transport-Security', ok: headers.has('strict-transport-security') },
    { label: 'X-Content-Type-Options: nosniff', ok: headers.get('x-content-type-options')?.toLowerCase() === 'nosniff' },
    {
      label: 'Захист від вбудовування (frame-ancestors або X-Frame-Options)',
      ok: headers.has('x-frame-options') || /frame-ancestors/i.test(headers.get('content-security-policy') || ''),
    },
    {
      label: 'Secure / HttpOnly у Set-Cookie (якщо є cookies)',
      ok: !headers.has('set-cookie')
        || (/;\s*secure/i.test(headers.get('set-cookie')) && /;\s*httponly/i.test(headers.get('set-cookie'))),
    },
  ];
}

function b64urlDecode(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  return decodeURIComponent(atob(padded).split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
}

// Decodes a JWT's header/payload for inspection. Does NOT verify the
// signature and must never be presented as proof the token is valid.
export function decodeJwt(token) {
  const parts = String(token).trim().split('.');
  if (parts.length < 2) throw new Error('not a JWT: expected header.payload(.signature)');
  const header = JSON.parse(b64urlDecode(parts[0]));
  const payload = JSON.parse(b64urlDecode(parts[1]));
  return { header, payload, hasSignature: parts.length === 3 && parts[2].length > 0 };
}

const IOC_PATTERNS = {
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  url: /\bhttps?:\/\/[^\s"'<>]+/gi,
  domain: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi,
  md5: /\b[a-f0-9]{32}\b/gi,
  sha1: /\b[a-f0-9]{40}\b/gi,
  sha256: /\b[a-f0-9]{64}\b/gi,
};

// Extracts indicators of compromise from text the student pastes (e.g. a log
// excerpt they already have). Purely a string-processing utility: it never
// fetches a URL, resolves a domain, or pings an IP.
export function extractIocs(text) {
  const src = String(text);
  const uniq = (re) => [...new Set(src.match(re) || [])];
  const urls = uniq(IOC_PATTERNS.url);
  const emails = uniq(IOC_PATTERNS.email);
  const ips = uniq(IOC_PATTERNS.ipv4);
  const sha256 = uniq(IOC_PATTERNS.sha256);
  const sha1 = uniq(IOC_PATTERNS.sha1).filter((h) => !sha256.includes(h));
  const md5 = uniq(IOC_PATTERNS.md5).filter((h) => !sha1.includes(h) && !sha256.includes(h));
  const domainsRaw = uniq(IOC_PATTERNS.domain);
  const urlHosts = new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return null; } }));
  const domains = domainsRaw.filter((d) => !emails.some((e) => e.endsWith(d)) && !urlHosts.has(d));
  return { ips, domains, emails, urls, hashes: { md5, sha1, sha256 } };
}

export function testRegex(pattern, flags, text) {
  const re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  const matches = [...String(text).matchAll(re)].map((m) => ({ match: m[0], index: m.index, groups: m.slice(1) }));
  return { count: matches.length, matches: matches.slice(0, 200) };
}

export const WORKBENCH_TOOLS = [
  { id: 'url', name: 'URL кодування', inputLabel: 'Текст або URL-компонент' },
  { id: 'base64', name: 'Base64', inputLabel: 'Текст' },
  { id: 'hash', name: 'SHA-256', inputLabel: 'Текст для хешування' },
  { id: 'headers', name: 'Аналіз HTTP-заголовків', inputLabel: 'Вставте заголовки відповіді' },
  { id: 'jwt', name: 'JWT decoder', inputLabel: 'Вставте JWT-токен' },
  { id: 'ioc', name: 'Пошук індикаторів (IOC)', inputLabel: 'Вставте текст логів/звіту' },
  { id: 'regex', name: 'Тест регулярного виразу', inputLabel: 'Текст для перевірки' },
];

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECTS_KEY));
    if (raw && typeof raw === 'object' && raw.projects) return raw;
  } catch { /* corrupted or missing */ }
  return { projects: {}, activeId: null };
}

function saveStore(store) {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
}

export function createProject(store, name) {
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const project = {
    id, name: String(name || 'Проект').slice(0, 80), createdAt: Date.now(), findings: [],
  };
  const next = { projects: { ...store.projects, [id]: project }, activeId: id };
  return next;
}

export function deleteProject(store, id) {
  const projects = { ...store.projects };
  delete projects[id];
  const ids = Object.keys(projects);
  const activeId = store.activeId === id ? (ids[0] || null) : store.activeId;
  return { projects, activeId };
}

export function renameProject(store, id, name) {
  if (!store.projects[id]) return store;
  const project = { ...store.projects[id], name: String(name || '').slice(0, 80) || store.projects[id].name };
  return { ...store, projects: { ...store.projects, [id]: project } };
}

export function addFinding(store, projectId, finding) {
  const project = store.projects[projectId];
  if (!project) return store;
  const entry = { id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now(), ...finding };
  const updated = { ...project, findings: [entry, ...project.findings].slice(0, 500) };
  return { ...store, projects: { ...store.projects, [projectId]: updated } };
}

export function removeFinding(store, projectId, findingId) {
  const project = store.projects[projectId];
  if (!project) return store;
  const updated = { ...project, findings: project.findings.filter((f) => f.id !== findingId) };
  return { ...store, projects: { ...store.projects, [projectId]: updated } };
}

export const workbenchStore = { load: loadStore, save: saveStore };
