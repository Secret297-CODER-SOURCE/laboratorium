import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('app nav keeps a per-link pill and never slides items under the logo', () => {
  const nav = read('public/app-nav.js');
  const css = read('public/styles.css');
  assert.doesNotMatch(nav, /app-nav-indicator/);
  assert.doesNotMatch(nav, /translate3d/);
  assert.doesNotMatch(nav, /scrollIntoView/);
  assert.match(css, /\.nav\.nav--app\s*\{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.app-nav-links \.app-nav-link::before/);
  assert.match(css, /\.app-nav-links \.app-nav-link\.active::before/);
  assert.match(css, /container-name: appnav/);
  assert.match(css, /justify-content: safe center/);
  assert.doesNotMatch(css, /\.app-nav-indicator/);
});

test('app header groups tools and identity and animates on scroll', () => {
  const header = read('public/site-header.js');
  const css = read('public/styles.css');
  assert.match(header, /class="nav-tools"/);
  assert.match(header, /class="nav-identity"/);
  assert.match(header, /bindHeaderMotion/);
  assert.match(header, /is-scrolled/);
  assert.match(header, /nav-icon-btn nav-logout-btn/);
  assert.match(css, /\.header\.is-scrolled::before/);
  assert.match(css, /@keyframes headerIn/);
});

test('conferences stage unifies title, CTA sheen, and sliding tabs', () => {
  const html = read('public/conferences.html');
  const css = read('public/conferences.css');
  const js = read('public/conferences.js');
  assert.match(html, /class="conf-stage"/);
  assert.match(html, /id="create-conf-btn"/);
  assert.match(html, /class="conf-tab-indicator"/);
  assert.match(css, /\.conf-tab-indicator\s*\{/);
  assert.match(css, /@keyframes confStageIn/);
  assert.match(css, /\.conf-create-btn::after/);
  assert.match(js, /function syncConfTabIndicator/);
  assert.match(js, /aria-selected/);
});
