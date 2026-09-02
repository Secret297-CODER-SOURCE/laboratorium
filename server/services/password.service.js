import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import db from '../db/index.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import * as mailService from './mail.service.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function generatePassword(length = 12) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let pwd = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) pwd += chars[bytes[i] % chars.length];
  return pwd;
}

function createResetToken(user) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.auth.resetTokenHours * 3600_000).toISOString();

  db.prepare('UPDATE password_reset_tokens SET used_at = datetime(\'now\') WHERE user_id = ? AND used_at IS NULL')
    .run(user.id);
  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, tokenHash, expiresAt);

  return `${config.appUrl}/reset-password.html?token=${token}`;
}

export async function requestPasswordReset(email) {
  if (!email?.trim()) throw new ValidationError('Введіть email');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    return { ok: true, message: 'Якщо email зареєстровано, лист надіслано' };
  }

  const resetUrl = createResetToken(user);
  await mailService.sendPasswordResetEmail(user, resetUrl);

  return { ok: true, message: 'Якщо email зареєстровано, лист надіслано' };
}

export async function resetPassword(token, password) {
  if (!token || !password) throw new ValidationError('Введіть токен і новий пароль');
  if (password.length < 6) throw new ValidationError('Пароль мінімум 6 символів');

  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT t.*, u.email FROM password_reset_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.used_at IS NULL
  `).get(tokenHash);

  if (!row) throw new ValidationError('Недійсне або прострочене посилання');
  if (new Date(row.expires_at) < new Date()) throw new ValidationError('Посилання прострочене');

  const password_hash = bcrypt.hashSync(password, config.bcryptRounds);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(password_hash, row.user_id);
  db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`).run(row.id);

  return { ok: true };
}

/**
 * Admin-triggered (not the public self-service flow), so — unlike
 * requestPasswordReset — it's safe and useful to hand the resetUrl and
 * delivery status back to the caller: if SMTP isn't configured or fails,
 * the admin UI shows the link directly instead of it just vanishing.
 */
export async function adminSendPasswordReset(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new NotFoundError('Користувача не знайдено');

  const resetUrl = createResetToken(user);
  const mailResult = await mailService.sendPasswordResetEmail(user, resetUrl);

  return { ok: true, resetUrl, emailSent: mailResult.sent, mailReason: mailResult.sent ? null : (mailResult.reason || 'no-smtp') };
}

export async function adminSendNewPassword(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new NotFoundError('Користувача не знайдено');

  const password = generatePassword();
  const password_hash = bcrypt.hashSync(password, config.bcryptRounds);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(password_hash, userId);

  const mailResult = await mailService.sendWelcomeCredentialsEmail(user, password);
  return { ok: true, password, emailSent: mailResult.sent, mailReason: mailResult.sent ? null : (mailResult.reason || 'no-smtp') };
}
