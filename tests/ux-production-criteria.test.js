import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKBENCH_TOOLS } from '../public/lab-workbench.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('C1 course.html search is disabled in the marketing header', () => {
  const course = read('public/course.js');
  assert.match(course, /showSearch:\s*false/);
  assert.doesNotMatch(course, /navMode:\s*'app'/);
});

test('C2 cabinet search is a body overlay, not an expanding header chip', () => {
  const header = read('public/site-header.js');
  const css = read('public/styles.css');
  assert.match(header, /ensureSearchOverlay/);
  assert.match(header, /overlay\.id = 'site-search-overlay'/);
  assert.match(header, /site-search--overlay/);
  assert.match(css, /\.site-search-overlay\s*\{/);
  assert.match(css, /body\.search-open/);
  assert.equal(header.includes('width: min(320px'), false);
});

test('C3 app nav keeps Tools reachable and uses a mobile bottom bar', () => {
  const nav = read('public/app-nav.js');
  assert.match(nav, /\/dashboard\.html\?tab=lab/);
  assert.match(nav, /function renderAppBottomNav/);
  assert.match(nav, /app-bottom-nav/);
  const css = read('public/styles.css');
  assert.match(css, /\.app-bottom-nav/);
  assert.match(css, /@media \(max-width: 900px\)/);
});

test('C4 conference tiles fill the grid instead of overlapping via locked aspect-ratio', () => {
  const css = read('public/room.css');
  const js = read('public/room.js');
  assert.match(css, /\.room-body\.sidebar-collapsed \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.room-body\.sidebar-collapsed \.room-sidebar \{\s*display: none;/);
  assert.match(css, /\.video-tile \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*contain: layout paint;/);
  assert.match(css, /\.video-grid\.grid-1 \.video-tile \{[\s\S]*aspect-ratio: 16 \/ 9;/);
  assert.match(js, /ResizeObserver/);
  assert.match(js, /updateGridClass\(\);/);
});

test('C5 Telegram keeps admin identity and adds a student user-bot surface', () => {
  const bot = read('server/services/telegram-bot.service.js');
  assert.match(bot, /const ADMIN_MANUAL/);
  assert.match(bot, /const STUDENT_MANUAL/);
  assert.match(bot, /handleStudentCommand/);
  assert.match(bot, /\/monitor/);
  assert.match(bot, /\/cabinet/);
  assert.match(bot, /\/tools/);
  assert.match(bot, /Адмін-бот laboratorium/);
  assert.match(bot, /User-bot laboratorium/);
  assert.doesNotMatch(bot.split('STUDENT_MANUAL')[1].slice(0, 800), /\/pay_ask/);
});

test('C6 site monitor never serializes bot tokens or passwords', () => {
  const bot = read('server/services/telegram-bot.service.js');
  const fn = bot.slice(bot.indexOf('export function getSiteMonitor'), bot.indexOf('export function formatMonitorText'));
  assert.match(fn, /botEnabled: !!\(c.enabled && c.session\)/);
  assert.doesNotMatch(fn, /^\s*botToken:/m);
  assert.doesNotMatch(fn, /^\s*apiHash:/m);
  assert.doesNotMatch(fn, /^\s*session:/m);
  assert.doesNotMatch(fn, /password/i);
  const panel = read('public/admin-telegram-panel.js');
  assert.match(panel, /User-bot \+ адмін-бот/);
  assert.match(panel, /tg-monitor-strip/);
  assert.match(panel, /name="apiId"/);
  assert.match(panel, /name="apiHash"/);
  assert.doesNotMatch(panel, /BotFather/);
});

test('C7 student tools dock + lab subtabs are wired into the cabinet', () => {
  const html = read('public/dashboard.html');
  const js = read('public/dashboard.js');
  assert.match(html, /dash-tools-dock/);
  assert.match(html, /tab=lab&lab=tools/);
  assert.match(js, /function applyLabSubtab/);
  const ids = WORKBENCH_TOOLS.map((t) => t.id);
  assert.ok(ids.includes('timestamp'));
  assert.ok(ids.includes('case'));
  assert.ok(ids.includes('unicode'));
});

test('C8 in-app user-bot is an assistant, not a second Telegram identity', () => {
  const bot = read('public/user-bot.js');
  assert.match(bot, /initUserBot/);
  assert.match(bot, /\/admin\/telegram\/monitor/);
  assert.match(bot, /location\.pathname/);
  const header = read('public/site-header.js');
  assert.match(header, /initUserBot\(\{ mode: 'app' \}\)/);
});

test('C9 mobile shell isolates the logo and lifts content above the bottom nav', () => {
  const css = read('public/styles.css');
  assert.match(css, /\.nav > \.logo \{[\s\S]*z-index: 2;/);
  assert.match(css, /--app-bottom-nav-h/);
  assert.match(css, /padding-bottom: calc\(var\(--app-bottom-nav-h\)/);
  assert.match(css, /\.has-app-shell \.mobile-menu/);
});

test('C10 admin overview exposes live health next to the dual-mode Telegram panel', () => {
  const admin = read('public/admin.js');
  const routes = read('server/routes/admin.routes.js');
  const ctrl = read('server/controllers/admin.controller.js');
  assert.match(admin, /health\?\.liveConferences/);
  assert.match(admin, /health\?\.errors24h/);
  assert.match(routes, /\/telegram\/monitor/);
  assert.match(ctrl, /health: telegramBot\.getSiteMonitor\(\)/);
});
