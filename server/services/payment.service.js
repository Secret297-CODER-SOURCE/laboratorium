import db from '../db/index.js';
import config from '../config/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

const BYPASS_ROLES = new Set(['owner', 'developer', 'teacher']);

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d, days) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function clampBillingDay(year, month, day) {
  const last = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, day), last);
}

function dueDate(year, month, billingDay) {
  const day = clampBillingDay(year, month, billingDay);
  return startOfDay(new Date(year, month - 1, day));
}

function previousPeriod(year, month) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function periodLabel(year, month) {
  const names = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  return `${names[month - 1]} ${year}`;
}

function getUserBillingRow(userId) {
  return db.prepare(`
    SELECT id, role, billing_day, billing_exempt
    FROM users WHERE id = ?
  `).get(userId);
}

export function hasPayment(userId, year, month) {
  return !!db.prepare(`
    SELECT id FROM payment_records
    WHERE user_id = ? AND period_year = ? AND period_month = ?
  `).get(userId, year, month);
}

export function getPaymentRecord(userId, year, month) {
  return db.prepare(`
    SELECT pr.*, u.handle AS recorded_by_handle
    FROM payment_records pr
    LEFT JOIN users u ON u.id = pr.recorded_by
    WHERE pr.user_id = ? AND pr.period_year = ? AND pr.period_month = ?
  `).get(userId, year, month);
}

export function getAccessStatus(userId, at = new Date()) {
  const user = getUserBillingRow(userId);
  if (!user) return { access: false, status: 'unknown' };

  const graceDays = config.billing.graceDays;

  if (BYPASS_ROLES.has(user.role) || user.billing_exempt) {
    return {
      access: true,
      status: 'exempt',
      role: user.role,
      billingDay: user.billing_day,
      graceDays,
    };
  }

  const year = at.getFullYear();
  const month = at.getMonth() + 1;
  const billingDay = user.billing_day || config.billing.defaultBillingDay;
  const due = dueDate(year, month, billingDay);
  const graceUntil = endOfDay(addDays(due, graceDays));
  const today = startOfDay(at);
  const payment = getPaymentRecord(userId, year, month);

  const base = {
    role: user.role,
    billingDay,
    graceDays,
    periodYear: year,
    periodMonth: month,
    periodLabel: periodLabel(year, month),
    dueDate: due.toISOString(),
    graceUntil: graceUntil.toISOString(),
    payment,
  };

  if (payment) {
    return { ...base, access: true, status: 'paid', paidAt: payment.paid_at };
  }

  if (today < due) {
    const prev = previousPeriod(year, month);
    if (hasPayment(userId, prev.year, prev.month)) {
      return { ...base, access: true, status: 'active' };
    }
    return { ...base, access: true, status: 'pending' };
  }

  if (today <= graceUntil) {
    return { ...base, access: true, status: 'grace' };
  }

  return { ...base, access: false, status: 'overdue' };
}

export function assertPlatformAccess(userId) {
  const status = getAccessStatus(userId);
  if (!status.access) {
    const err = new ValidationError('Доступ призупинено через прострочену оплату');
    err.statusCode = 402;
    err.code = 'PAYMENT_REQUIRED';
    err.billing = status;
    throw err;
  }
  return status;
}

export function listBillingOverview({ year, month }) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new ValidationError('Некоректний період');
  }

  const students = db.prepare(`
    SELECT id, email, name, handle, role, billing_day, billing_exempt, created_at
    FROM users
    WHERE role = 'student'
    ORDER BY name COLLATE NOCASE
  `).all();

  const payments = db.prepare(`
    SELECT * FROM payment_records WHERE period_year = ? AND period_month = ?
  `).all(y, m);
  const payMap = Object.fromEntries(payments.map(p => [p.user_id, p]));

  const at = new Date(y, m - 1, 15);

  return {
    year: y,
    month: m,
    periodLabel: periodLabel(y, m),
    graceDays: config.billing.graceDays,
    students: students.map(s => {
      const payment = payMap[s.id] || null;
      const status = getAccessStatus(s.id, at);
      return {
        ...s,
        billing_exempt: !!s.billing_exempt,
        payment,
        accessStatus: status.status,
        dueDate: status.dueDate,
        graceUntil: status.graceUntil,
      };
    }),
  };
}

export function recordPayment({ userId, year, month, note, amount, recordedBy }) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new ValidationError('Некоректний період');
  }

  const user = getUserBillingRow(userId);
  if (!user) throw new NotFoundError('Користувача не знайдено');
  if (user.role !== 'student') throw new ValidationError('Оплата фіксується лише для учнів');

  if (hasPayment(userId, y, m)) {
    throw new ConflictError('Оплата за цей місяць вже зафіксована');
  }

  const result = db.prepare(`
    INSERT INTO payment_records (user_id, period_year, period_month, paid_at, amount, note, recorded_by)
    VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
  `).run(userId, y, m, amount ?? null, note?.trim() || null, recordedBy || null);

  return db.prepare('SELECT * FROM payment_records WHERE id = ?').get(result.lastInsertRowid);
}

export function removePayment(paymentId) {
  const row = db.prepare('SELECT * FROM payment_records WHERE id = ?').get(paymentId);
  if (!row) throw new NotFoundError('Запис оплати не знайдено');
  db.prepare('DELETE FROM payment_records WHERE id = ?').run(paymentId);
  return { ok: true };
}

export function updateBillingSettings(userId, { billing_day, billing_exempt }) {
  const user = getUserBillingRow(userId);
  if (!user) throw new NotFoundError('Користувача не знайдено');

  const updates = [];
  const params = [];

  if (billing_day !== undefined) {
    const day = parseInt(billing_day, 10);
    if (!Number.isFinite(day) || day < 1 || day > 28) {
      throw new ValidationError('День оплати: від 1 до 28');
    }
    updates.push('billing_day = ?');
    params.push(day);
  }

  if (billing_exempt !== undefined) {
    updates.push('billing_exempt = ?');
    params.push(billing_exempt ? 1 : 0);
  }

  if (!updates.length) return user;

  params.push(userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
  return getUserBillingRow(userId);
}

export function listUserPayments(userId, limit = 24) {
  return db.prepare(`
    SELECT pr.*, u.handle AS recorded_by_handle
    FROM payment_records pr
    LEFT JOIN users u ON u.id = pr.recorded_by
    WHERE pr.user_id = ?
    ORDER BY pr.period_year DESC, pr.period_month DESC
    LIMIT ?
  `).all(userId, limit);
}
