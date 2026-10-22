import db from '../db/index.js';
import { ValidationError } from '../utils/errors.js';
import { isValidEmail } from '../utils/validators.js';
import * as referralService from './referral.service.js';

export function create({
  name, email, program, message, phone, userId = null, direction_id = null, referral_code = '',
}) {
  if (!name?.trim() || !email?.trim()) {
    throw new ValidationError('Заповніть обов\'язкові поля');
  }
  const callbackPhone = typeof phone === 'string' ? phone.trim() : '';
  const phoneDigits = callbackPhone.match(/\d/g) || [];
  if (callbackPhone.length > 32 || !/^\+?[0-9][0-9\s().-]{5,30}$/.test(callbackPhone)
    || phoneDigits.length < 7 || phoneDigits.length > 15) {
    throw new ValidationError('Вкажіть номер телефону для зворотного зв’язку');
  }
  if (!program?.trim() && !direction_id) {
    throw new ValidationError('Оберіть напрямок');
  }
  if (!isValidEmail(email)) {
    throw new ValidationError('Некоректний email');
  }

  let programLabel = program?.trim() || '';
  if (direction_id) {
    const dir = db.prepare('SELECT name FROM directions WHERE id = ?').get(direction_id);
    if (dir) programLabel = dir.name;
  }

  let referrer = referralService.getReferrer(referral_code, { userId, email });
  if (!referrer) {
    const linkedUser = userId
      ? db.prepare('SELECT referred_by_user_id, referred_by_program_id FROM users WHERE id = ?').get(userId)
      : db.prepare('SELECT referred_by_user_id, referred_by_program_id FROM users WHERE email = ?').get(email.toLowerCase());
    const referrerId = linkedUser?.referred_by_user_id;
    const referrerUser = referrerId
      ? db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(referrerId)
      : null;
    if (referrerUser && referrerUser.id !== userId) {
      referrer = { userId: referrerUser.id, programId: linkedUser?.referred_by_program_id || null };
    }
  }
  db.prepare(`
    INSERT INTO applications (
      name, email, callback_phone, program, message, user_id, status, direction_id, referrer_id,
      referral_program_id, analytics_campaign_code
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(name.trim(), email.toLowerCase(), callbackPhone, programLabel, message?.trim() || '', userId,
    direction_id || null, referrer?.userId || null, referrer?.programId || null, null);

  return true;
}

export function listForUser(userId) {
  return db.prepare(`
    SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId);
}

export function getLeaderboard(limit = 20) {
  return db.prepare(`
    SELECT id, handle, name, bounty_points, profile_public FROM users
    ORDER BY bounty_points DESC LIMIT ?
  `).all(limit);
}
