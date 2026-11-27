import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('admin telegram panel uses API ID/hash and chat selects, not BotFather token', () => {
  const panel = read('public/admin-telegram-panel.js');
  const settings = read('server/services/settings.service.js');
  const routes = read('server/routes/admin.routes.js');
  assert.match(panel, /name="apiId"/);
  assert.match(panel, /name="apiHash"/);
  assert.match(panel, /id="tg-admin-chat"/);
  assert.match(panel, /id="tg-hw-chat"/);
  assert.match(panel, /\/admin\/telegram\/dialogs/);
  assert.match(panel, /\/admin\/telegram\/login\/code/);
  assert.doesNotMatch(panel, /botToken|BotFather/);
  assert.match(settings, /hasApiHash: !!cfg.apiHash/);
  assert.match(settings, /hasSession: !!cfg.session/);
  assert.match(settings, /function getTelegramSettingsPublic/);
  assert.doesNotMatch(settings.slice(settings.indexOf('function getTelegramSettingsPublic'), settings.indexOf('export function saveTelegramSettings')), /apiHash: cfg.apiHash/);
  assert.doesNotMatch(settings.slice(settings.indexOf('function getTelegramSettingsPublic'), settings.indexOf('export function saveTelegramSettings')), /session: cfg.session/);
  assert.match(routes, /telegram\/login\/code/);
  assert.match(routes, /telegram\/dialogs/);
});

test('telegram client layer is MTProto and never logs secrets', () => {
  const svc = read('server/services/telegram.service.js');
  assert.match(svc, /from 'teleproto'/);
  assert.match(svc, /listAccountDialogs/);
  assert.match(svc, /function publicErr/);
  assert.doesNotMatch(svc, /console\.(log|info|error)\([^)]*apiHash/);
  assert.doesNotMatch(svc, /console\.(log|info|error)\([^)]*session/);
  assert.doesNotMatch(svc, /console\.(log|info|error)\([^)]*phoneCode/);
});
