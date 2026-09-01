import webpush from 'web-push';
import db from '../db/index.js';
import config from '../config/index.js';
import { ValidationError } from '../utils/errors.js';

const SETTINGS_KEY = 'vapid';
let vapidKeys = null;

function loadOrCreateKeys() {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(SETTINGS_KEY);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (parsed.publicKey && parsed.privateKey) return parsed;
    } catch {
      /* corrupted — regenerate below */
    }
  }

  const keys = webpush.generateVAPIDKeys();
  db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(SETTINGS_KEY, JSON.stringify(keys));
  console.log('[webpush] Generated a new VAPID keypair (stored in DB, reused across restarts).');
  return keys;
}

function ensureConfigured() {
  if (vapidKeys) return vapidKeys;
  vapidKeys = config.vapid.publicKey && config.vapid.privateKey
    ? { publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey }
    : loadOrCreateKeys();
  webpush.setVapidDetails(config.vapid.subject, vapidKeys.publicKey, vapidKeys.privateKey);
  return vapidKeys;
}

export function getPublicKey() {
  return ensureConfigured().publicKey;
}

export function saveSubscription(userId, subscription) {
  ensureConfigured();
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new ValidationError('Некоректна push-підписка');

  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(userId, endpoint, p256dh, auth);
  return { ok: true };
}

export function removeSubscription(userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
  return { ok: true };
}

export async function sendToUser(userId, payload) {
  ensureConfigured();
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (!subs.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, body);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      } else {
        console.error(`[webpush] send failed for user ${userId}:`, err.message);
      }
    }
  }));
}
