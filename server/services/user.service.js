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

/**
 * Self-registration: the applicant chooses neither their own login nor
 * password — both are generated here and emailed, so the account is only
 * ever usable by whoever actually receives that email. Starts restricted
 * (see is_restricted) — no lab VM, no unlocked tabs — until a teacher or
 * owner places them in a study group (see group.service.js addGroupMembers).
 */
export async function register({ name, email, handle }) {
  if (!config.auth.allowPublicRegistration) {
    throw new ValidationError('Реєстрація закрита. Доступ надається після оплати.');
  }
  if (!name?.trim() || !email?.trim()) {
    throw new ValidationError('Заповніть ім\'я та email');
  }
  if (!isValidEmail(email)) {
    throw new ValidationError('Некоректний email');
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

  const plainPassword = generatePassword();
  const password_hash = bcrypt.hashSync(plainPassword, config.bcryptRounds);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, bounty_points, role, is_restricted)
    VALUES (?, ?, ?, ?, 0, 'student', 1)
  `).run(email.toLowerCase(), password_hash, name.trim(), userHandle);

  const userId = result.lastInsertRowid;
  addBounty(userId, 100, 'Реєстрація в laboratorium.');

  const user = findById(userId);
  const mailResult = await mailService.sendWelcomeCredentialsEmail(user, plainPassword);

  // Never hand the plaintext password back here — unlike adminCreateUser(),
  // the caller is an anonymous public request, so if the email didn't go
  // out the only safe recovery path is an admin re-sending it from the
  // users panel (send-reset / send-password), not exposing it in the response.
  return {
    user,
    emailSent: mailResult.sent,
    mailReason: mailResult.sent ? null : (mailResult.reason || 'no-smtp'),
  };
}

/**
 * Called when a teacher/owner adds a restricted (not-yet-placed) account to
 * a study group — the only thing that lifts the self-registration
 * restriction (a course application being approved is informational only;
 * it does not by itself open access). Also usable as a manual admin
 * override (see admin.service.js setUserRestricted). Mirrors what
 * adminCreateUser() already does for staff-provisioned students (lab VM
 * provisioning), deferred until now instead of at signup/creation.
 */
export function liftRestriction(userId) {
  const user = findById(userId);
  if (!user || !user.is_restricted) return user;
  db.prepare(`UPDATE users SET is_restricted = 0, updated_at = datetime('now') WHERE id = ?`).run(userId);
  scheduleProvisionForStudent(userId, user.handle);
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
  // Staff-created student accounts start restricted too, same as
  // self-registration — a teacher/owner adding them to a study group is
  // what lifts it (see addGroupMembers), so there's one consistent rule
  // platform-wide instead of two different unlock paths depending on who
  // created the account.
  const isRestricted = validRole === 'student' ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, bounty_points, role, is_restricted)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(email.toLowerCase(), password_hash, name.trim(), userHandle, validRole, isRestricted);

  const user = findById(result.lastInsertRowid);
  let emailSent = false;
  let mailReason = null;
  if (sendEmail) {
    const mailResult = await mailService.sendWelcomeCredentialsEmail(user, plainPassword);
    emailSent = mailResult.sent;
    mailReason = mailResult.sent ? null : (mailResult.reason || 'no-smtp');
  }

  // Lab VM provisioning is deferred to liftRestriction() (triggered by
  // being added to a study group), not done here anymore.

  // Always hand the plaintext password back — if the email didn't actually
  // go out (no SMTP configured, or delivery failed), this is the only place
  // it exists; the admin UI falls back to showing it directly so the
  // account is never created with a password nobody knows.
  return { user, password: plainPassword, emailSent, mailReason };
}

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('laboratorium-timing-dummy', config.bcryptRounds);

/** Accepts either the account's email or its handle (nickname) as the login
 * identifier — self-registered/staff-created accounts are handed a
 * generated handle+password to sign in with, not their email. */
export function login({ login, password }) {
  if (!login || !password) {
    throw new ValidationError('Введіть логін і пароль');
  }

  const identifier = login.trim();
  const user = identifier.includes('@') ? findByEmail(identifier) : findByHandle(identifier);
  const matches = bcrypt.compareSync(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || !matches) {
    throw new UnauthorizedError('Невірний логін або пароль');
  }
  if (user.is_frozen) {
    throw new UnauthorizedError('Акаунт заморожено. Зверніться до адміністрації.');
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
