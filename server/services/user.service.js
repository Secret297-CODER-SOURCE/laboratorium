import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import db from '../db/index.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { generateHandle, isValidEmail, isValidHandle } from '../utils/validators.js';
import { sanitizeUser } from '../utils/tier.js';
import { addBounty } from './bounty.service.js';
import { generatePassword } from './password.service.js';
import * as mailService from './mail.service.js';
import { scheduleProvisionForStudent } from './lab.service.js';

export function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}

export function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function findByHandle(handle) {
  return db.prepare('SELECT * FROM users WHERE handle = ?').get(handle);
}

export function register({ name, email, password, handle }) {
  if (!config.auth.allowPublicRegistration) {
    throw new ValidationError('Реєстрація закрита. Доступ надається після оплати.');
  }
  if (!name?.trim() || !email?.trim() || !password) {
    throw new ValidationError('Заповніть ім\'я, email і пароль');
  }
  if (!isValidEmail(email)) {
    throw new ValidationError('Некоректний email');
  }
  if (password.length < 6) {
    throw new ValidationError('Пароль мінімум 6 символів');
  }
  if (findByEmail(email)) {
    throw new ConflictError('Email вже зареєстровано');
  }

  const userHandle = handle?.trim() || generateHandle(name);
  if (!isValidHandle(userHandle)) {
    throw new ValidationError('Handle: 3–20 символів, літери, цифри, _');
  }
  if (findByHandle(userHandle)) {
    throw new ConflictError('Handle вже зайнято');
  }

  const password_hash = bcrypt.hashSync(password, config.bcryptRounds);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, bounty_points, role)
    VALUES (?, ?, ?, ?, 0, 'student')
  `).run(email.toLowerCase(), password_hash, name.trim(), userHandle);

  const userId = result.lastInsertRowid;
  addBounty(userId, 100, 'Реєстрація в laboratorium.');

  scheduleProvisionForStudent(userId, userHandle);

  return findById(userId);
}

export async function adminCreateUser({ name, email, role = 'student', handle, password, sendEmail = true }) {
  if (!name?.trim() || !email?.trim()) {
    throw new ValidationError('Вкажіть ім\'я та email');
  }
  if (!isValidEmail(email)) throw new ValidationError('Некоректний email');
  if (findByEmail(email)) throw new ConflictError('Email вже зареєстровано');

  const plainPassword = password || generatePassword();
  const userHandle = handle?.trim() || generateHandle(name);
  if (!isValidHandle(userHandle)) throw new ValidationError('Handle: 3–20 символів');
  if (findByHandle(userHandle)) throw new ConflictError('Handle вже зайнято');

  const password_hash = bcrypt.hashSync(plainPassword, config.bcryptRounds);
  const validRole = ['student', 'teacher', 'owner'].includes(role) ? role : 'student';

  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, bounty_points, role)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(email.toLowerCase(), password_hash, name.trim(), userHandle, validRole);

  const user = findById(result.lastInsertRowid);
  let emailSent = false;
  let mailReason = null;
  if (sendEmail) {
    const mailResult = await mailService.sendWelcomeCredentialsEmail(user, plainPassword);
    emailSent = mailResult.sent;
    mailReason = mailResult.sent ? null : (mailResult.reason || 'no-smtp');
  }

  if (validRole === 'student') {
    scheduleProvisionForStudent(user.id, userHandle);
  }

  // Always hand the plaintext password back — if the email didn't actually
  // go out (no SMTP configured, or delivery failed), this is the only place
  // it exists; the admin UI falls back to showing it directly so the
  // account is never created with a password nobody knows.
  return { user, password: plainPassword, emailSent, mailReason };
}

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('laboratorium-timing-dummy', config.bcryptRounds);

export function login({ email, password }) {
  if (!email || !password) {
    throw new ValidationError('Введіть email і пароль');
  }

  const user = findByEmail(email);
  const matches = bcrypt.compareSync(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || !matches) {
    throw new UnauthorizedError('Невірний email або пароль');
  }

  return user;
}

export function updateProfile(userId, { name, handle }) {
  const user = findById(userId);
  if (!user) throw new NotFoundError('Користувача не знайдено');

  if (name?.trim()) {
    db.prepare('UPDATE users SET name = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(name.trim(), userId);
  }

  if (handle?.trim() && handle.trim() !== user.handle) {
    if (!isValidHandle(handle.trim())) {
      throw new ValidationError('Handle: 3–20 символів, літери, цифри, _');
    }
    if (findByHandle(handle.trim())) {
      throw new ConflictError('Handle вже зайнято');
    }
    db.prepare('UPDATE users SET handle = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(handle.trim(), userId);
  }

  return findById(userId);
}

export function toPublic(user) {
  return sanitizeUser(user);
}
