import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import config from '../config/index.js';
import { SCHEMA } from './schema.js';
import { runMigrations } from './migrate.js';
import { seedDatabase, syncCatalog } from './seed.js';
import { ensureCtfMetadata } from '../services/ctf.service.js';
import { ensureStorageReady } from '../services/storage.service.js';

const dbDir = dirname(config.db.path);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new Database(config.db.path);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(SCHEMA);
runMigrations(db);

if (config.db.seed) {
  seedDatabase(db);
} else {
  syncCatalog(db);
}
ensureCtfMetadata(db);
queueMicrotask(() => ensureStorageReady());

export function ping() {
  return db.prepare('SELECT 1 as ok').get();
}

export function getStats() {
  return {
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    programs: db.prepare('SELECT COUNT(*) as c FROM programs').get().c,
    challenges: db.prepare('SELECT COUNT(*) as c FROM challenges').get().c,
    applications: db.prepare('SELECT COUNT(*) as c FROM applications').get().c,
  };
}

export default db;
