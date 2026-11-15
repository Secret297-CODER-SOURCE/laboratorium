import db from '../db/index.js';
import { notifyUser } from './notification.service.js';
import * as telegramBot from './telegram-bot.service.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function getSettings() {
  return db.prepare('SELECT * FROM homework_reminder_settings WHERE id = 1').get() || {
    enabled: 1,
    interval_hours: 48,
    channel_site: 1,
    channel_telegram: 1,
    message_template: 'Нагадування: будь ласка, здайте незавершені домашні завдання.',
  };
}

export function saveSettings(input = {}) {
  const current = getSettings();
  const interval = parseInt(input.interval_hours ?? current.interval_hours, 10);
  const safeInterval = Number.isFinite(interval) ? Math.min(Math.max(interval, 6), 168) : 48;
  db.prepare(`
    UPDATE homework_reminder_settings SET
      enabled = ?,
      interval_hours = ?,
      channel_site = ?,
      channel_telegram = ?,
      message_template = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    input.enabled !== undefined ? (input.enabled ? 1 : 0) : current.enabled,
    safeInterval,
    input.channel_site !== undefined ? (input.channel_site ? 1 : 0) : current.channel_site,
    input.channel_telegram !== undefined ? (input.channel_telegram ? 1 : 0) : current.channel_telegram,
    String(input.message_template ?? current.message_template).trim().slice(0, 1000)
      || current.message_template,
  );
  return getSettings();
}

function pendingAssignments() {
  return db.prepare(`
    SELECT ta.id AS assignment_id, ta.user_id, t.title, u.name, u.handle
    FROM task_assignments ta
    JOIN tasks t ON t.id = ta.task_id
    JOIN users u ON u.id = ta.user_id
    WHERE t.is_active = 1
      AND ta.status IN ('available', 'taken')
      AND u.role = 'student'
  `).all();
}

function recentlyReminded(userId, hours) {
  return !!db.prepare(`
    SELECT id FROM homework_reminder_log
    WHERE user_id = ?
      AND datetime(sent_at) >= datetime('now', ?)
    LIMIT 1
  `).get(userId, `-${Math.max(hours, 1)} hours`);
}

function logReminder(userId, assignmentId, channel) {
  db.prepare(`
    INSERT INTO homework_reminder_log (user_id, task_assignment_id, channel)
    VALUES (?, ?, ?)
  `).run(userId, assignmentId || null, channel);
}

async function runCheck() {
  const settings = getSettings();
  if (!settings.enabled) return;

  const byUser = new Map();
  for (const row of pendingAssignments()) {
    const list = byUser.get(row.user_id) || [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  for (const [userId, tasks] of byUser) {
    if (recentlyReminded(userId, settings.interval_hours)) continue;
    const titles = tasks.slice(0, 3).map((t) => t.title).join(', ');
    const more = tasks.length > 3 ? ` (+${tasks.length - 3})` : '';
    const body = `${settings.message_template}\n\nЗадачі: ${titles}${more}`;

    if (settings.channel_site) {
      notifyUser(userId, {
        type: 'homework_reminder',
        title: 'Нагадування про домашнє завдання',
        body,
        link: '/dashboard.html',
        data: { count: tasks.length },
      });
      logReminder(userId, tasks[0]?.assignment_id, 'site');
    }

    if (settings.channel_telegram) {
      try {
        const sent = await telegramBot.sendHomeworkReminderToUser(userId, body);
        if (sent) logReminder(userId, tasks[0]?.assignment_id, 'telegram');
      } catch (err) {
        console.error('[homework-reminder] telegram:', err.message);
      }
    }
  }
}

export function startHomeworkReminderScheduler() {
  const tick = () => {
    runCheck().catch((err) => console.error('[homework-reminder]', err.message));
  };
  tick();
  setInterval(tick, CHECK_INTERVAL_MS).unref?.();
}
