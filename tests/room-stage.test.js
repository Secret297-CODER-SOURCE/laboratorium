import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickStagedScreenId, demoChipLabel } from '../public/room-stage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('pickStagedScreenId keeps the current demo when a second share appears', () => {
  assert.equal(pickStagedScreenId([], 'tile-screen'), null);
  assert.equal(
    pickStagedScreenId(['tile-screen', 'tile-screen-2'], 'tile-screen', { incomingId: 'tile-screen-2' }),
    'tile-screen',
  );
});

test('pickStagedScreenId promotes your own share and explicit force switches', () => {
  assert.equal(
    pickStagedScreenId(['tile-screen-2', 'tile-screen'], 'tile-screen-2', { incomingId: 'tile-screen' }),
    'tile-screen',
  );
  assert.equal(
    pickStagedScreenId(['tile-screen', 'tile-screen-2'], 'tile-screen', { incomingId: 'tile-screen-2', force: true }),
    'tile-screen-2',
  );
  assert.equal(
    pickStagedScreenId(['tile-screen-2'], 'tile-screen', { incomingId: 'tile-screen-2' }),
    'tile-screen-2',
  );
});

test('demoChipLabel prefers the local preview name', () => {
  assert.equal(demoChipLabel('Ваш екран', { local: true }), 'Ваш екран');
  assert.equal(demoChipLabel('Екран @alice'), 'Екран @alice');
  assert.equal(demoChipLabel(''), 'Демонстрація');
});

test('room wires a demo switcher and stages only the active screen-share', () => {
  const html = readFileSync(join(root, 'public/room.html'), 'utf8');
  const js = readFileSync(join(root, 'public/room.js'), 'utf8');
  const css = readFileSync(join(root, 'public/room.css'), 'utf8');
  assert.match(html, /id="demo-switcher"/);
  assert.match(js, /setStagedScreen/);
  assert.match(js, /renderDemoSwitcher/);
  assert.match(css, /\.video-grid\.has-screen > \.video-tile\.screen-share\.is-stage/);
  assert.match(css, /\.demo-chip\.is-active/);
});
