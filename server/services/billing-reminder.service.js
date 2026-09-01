import db from '../db/index.js';
import { getAccessStatus } from './payment.service.js';
import { notifyUser, hasNotificationLike } from './notification.service.js';

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // двічі на день достатньо для нагадування про оплату
const REMIND_DAYS_BEFORE_DUE = 3;

function runCheck() {
  const students = db.prepare(`
    SELECT id FROM users WHERE role = 'student' AND billing_exempt = 0
  `).all();

  const now = new Date();
  for (const { id: userId } of students) {
    let status;
    try {
      status = getAccessStatus(userId, now);
    } catch (err) {
      console.error(`[billing-reminder] status check failed for user ${userId}:`, err.message);
      continue;
    }
    if (!status.dueDate || status.status === 'paid' || status.status === 'exempt') continue;

    const daysUntilDue = Math.ceil((new Date(status.dueDate) - now) / (24 * 60 * 60 * 1000));
    const isDueSoon = status.status === 'pending' && daysUntilDue <= REMIND_DAYS_BEFORE_DUE && daysUntilDue >= 0;
    const isOverdueGrace = status.status === 'grace';
    if (!isDueSoon && !isOverdueGrace) continue;

    // De-dup per billing period so this doesn't re-notify on every 12h tick.
    const periodKey = { periodYear: status.periodYear, periodMonth: status.periodMonth, kind: isOverdueGrace ? 'grace' : 'due_soon' };
    if (hasNotificationLike(userId, 'billing_due', periodKey)) continue;

    notifyUser(userId, {
      type: 'billing_due',
      title: isOverdueGrace ? 'Оплату прострочено' : 'Наближається термін оплати',
      body: isOverdueGrace
        ? `Оплата за ${status.periodLabel} прострочена — доступ призупиниться після пільгового періоду.`
        : `Оплатіть до ${new Date(status.dueDate).toLocaleDateString('uk-UA')}, щоб не втратити доступ.`,
      link: '/portal.html',
      data: periodKey,
    });
  }
}

export function startBillingReminderScheduler() {
  const tick = () => {
    try {
      runCheck();
    } catch (err) {
      console.error('[billing-reminder] cycle error:', err.message);
    }
  };
  tick();
  setInterval(tick, CHECK_INTERVAL_MS).unref?.();
}
