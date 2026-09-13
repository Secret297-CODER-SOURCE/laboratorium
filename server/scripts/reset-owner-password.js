/**
 * Resets an owner account's password and prints the new one to the console.
 * A password can never be "shown again" — only the bcrypt hash is stored —
 * so this is the only way to recover access if it's been lost.
 *
 * Usage:
 *   node server/scripts/reset-owner-password.js
 *   node server/scripts/reset-owner-password.js owner@laboratorium.club
 *
 * With no argument, resets the first 'owner' account found. Pass an email
 * to target a specific one (useful if there's more than one owner/developer).
 */
import bcrypt from 'bcryptjs';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import config from '../config/index.js';
import db from '../db/index.js';
import { generatePassword } from '../services/password.service.js';

const targetEmail = process.argv[2]?.toLowerCase();

const user = targetEmail
  ? db.prepare("SELECT * FROM users WHERE email = ? AND role IN ('owner', 'developer')").get(targetEmail)
  : db.prepare("SELECT * FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1").get();

if (!user) {
  console.error(targetEmail
    ? `[reset-owner-password] No owner/developer account found with email ${targetEmail}.`
    : '[reset-owner-password] No owner account found in the database.');
  process.exit(1);
}

const password = generatePassword();
const hash = bcrypt.hashSync(password, config.bcryptRounds);
db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, user.id);

console.log('[reset-owner-password] ==========================================================');
console.log('[reset-owner-password] Password reset. New credentials:');
console.log(`[reset-owner-password]   login:    @${user.handle}`);
console.log(`[reset-owner-password]   email:    ${user.email}`);
console.log(`[reset-owner-password]   password: ${password}`);
console.log('[reset-owner-password] This password is only ever printed here - copy it now.');
console.log('[reset-owner-password] ==========================================================');

try {
  const credsPath = join(dirname(config.db.path), 'OWNER_CREDENTIALS.txt');
  writeFileSync(credsPath, [
    'laboratorium. — owner account (password reset)',
    `login:    @${user.handle}`,
    `email:    ${user.email}`,
    `password: ${password}`,
    '',
    'This is the only place the password is recoverable from — it is',
    'hashed everywhere else. Delete this file once you\'ve copied it.',
  ].join('\n'));
  console.log(`[reset-owner-password] Also saved to ${credsPath} — delete it once copied.`);
} catch (err) {
  console.error(`[reset-owner-password] Could not write OWNER_CREDENTIALS.txt: ${err.message}`);
}
