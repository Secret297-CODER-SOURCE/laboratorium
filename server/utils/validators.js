import db from '../db/index.js';

export function generateHandle(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 16) || 'hacker';

  let handle = base;
  let i = 1;
  while (db.prepare('SELECT id FROM users WHERE handle = ?').get(handle)) {
    handle = `${base}_${i++}`;
  }
  return handle;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidHandle(handle) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(handle);
}
