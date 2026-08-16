import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import { ROLES } from '../utils/roles.js';

const PROGRAMS = [
  { slug: 'offensive', name: 'Offensive Security', level: 'Advanced', duration: '6 місяців', bounty_reward: 500, description: 'Повний цикл пентесту: recon → exploitation → post-exploitation → звіт.', tags: 'Kali Linux,Burp Suite,Metasploit,OSCP prep' },
  { slug: 'defensive', name: 'Defensive Security', level: 'Intermediate', duration: '5 місяців', bounty_reward: 400, description: 'Моніторинг, SIEM, форензика та реагування на інциденти.', tags: 'Splunk,Wireshark,Volatility' },
  { slug: 'python', name: 'Python для хакерів', level: 'Foundation', duration: '3 місяці', bounty_reward: 250, description: 'Автоматизація, скрипти для пентесту, парсинг і робота з API.', tags: 'Python 3,Scapy,Requests' },
  { slug: 'reverse', name: 'Reverse Engineering', level: 'Advanced', duration: '4 місяці', bounty_reward: 450, description: 'Дизасемблювання, аналіз бінарників, unpacking.', tags: 'Ghidra,IDA,x64dbg' },
  { slug: 'web', name: 'Web Security', level: 'Foundation', duration: '4 місяці', bounty_reward: 350, description: 'OWASP Top 10, XSS, SQLi, SSRF, bug bounty.', tags: 'OWASP,PortSwigger,HackerOne' },
  { slug: 'systems', name: 'Systems Programming', level: 'Intermediate', duration: '5 місяців', bounty_reward: 400, description: 'C, пам\'ять, мережі на низькому рівні, exploit development.', tags: 'C/C++,Linux,ASM' },
  { slug: 'csharp', name: 'C# Development', level: 'Intermediate', duration: '4 місяці', bounty_reward: 350, description: '.NET, ASP.NET, desktop та backend для enterprise-проєктів.', tags: '.NET,ASP.NET,Entity Framework' },
  { slug: 'sysadmin', name: 'Systems Administration', level: 'Foundation', duration: '4 місяці', bounty_reward: 300, description: 'Linux-сервери, мережі, автоматизація інфраструктури та моніторинг.', tags: 'Linux,Docker,Ansible,Monitoring' },
];

const CHALLENGES = [
  { slug: 'nmap-scan', title: 'Nmap Recon', description: 'Проскануй лабораторний стенд і знайди відкриті порти.', bounty_reward: 50, difficulty: 'easy', program_id: 1 },
  { slug: 'sql-injection', title: 'SQL Injection Lab', description: 'Витягни прапор із вразливої форми входу.', bounty_reward: 100, difficulty: 'medium', program_id: 5 },
  { slug: 'xss-stored', title: 'Stored XSS', description: 'Впровадь payload у коментарі та викради cookie адміна.', bounty_reward: 120, difficulty: 'medium', program_id: 5 },
  { slug: 'buffer-overflow', title: 'Stack Overflow 101', description: 'Перезапиши return address і отримай shell.', bounty_reward: 200, difficulty: 'hard', program_id: 6 },
  { slug: 'malware-static', title: 'Static Malware Analysis', description: 'Визнач IOC і C2 зі зразка малварі.', bounty_reward: 150, difficulty: 'hard', program_id: 2 },
  { slug: 'python-port-scanner', title: 'Port Scanner Script', description: 'Напиши багатопотоковий сканер на Python.', bounty_reward: 80, difficulty: 'easy', program_id: 3 },
  { slug: 'ghidra-crackme', title: 'Crackme in Ghidra', description: 'Знайди алгоритм перевірки ключа в бінарнику.', bounty_reward: 180, difficulty: 'hard', program_id: 4 },
  { slug: 'priv-esc-linux', title: 'Linux Privilege Escalation', description: 'Підвищ привілеї з www-data до root.', bounty_reward: 250, difficulty: 'hard', program_id: 1 },
];

const DEFAULT_OWNER_EMAIL = 'maks.47.turbo@gmail.com';
const DEFAULT_OWNER_PASSWORD = 'LaboratoriumOwner2026';

const TEST_STUDENT_EMAIL = 'test.student@lab.dev';
const TEST_STUDENT_PASSWORD = 'TestLab2026!';

const TEST_TEACHER_EMAIL = 'test.teacher@lab.dev';
const TEST_TEACHER_PASSWORD = 'TestTeacher2026!';

const TRACKS = [
  { slug: 'cybersecurity', name: 'Cybersecurity', description: 'Пентест, захист, web security та reverse engineering', sort_order: 1 },
  { slug: 'cpp', name: 'C++', description: 'Системне програмування, пам\'ять та low-level розробка', sort_order: 2 },
  { slug: 'python', name: 'Python', description: 'Скрипти, автоматизація та інструменти для безпеки', sort_order: 3 },
  { slug: 'csharp', name: 'C#', description: '.NET-екосистема, desktop та backend-розробка', sort_order: 4 },
  { slug: 'sysadmin', name: 'Systems Administrators', description: 'Linux, мережі, інфраструктура та моніторинг', sort_order: 5 },
];

const PROGRAM_DIRECTION = {
  offensive: 'cybersecurity',
  defensive: 'cybersecurity',
  python: 'python',
  reverse: 'cybersecurity',
  web: 'cybersecurity',
  systems: 'cpp',
  csharp: 'csharp',
  sysadmin: 'sysadmin',
};

function ensureDirections(db) {
  console.log('[db] Syncing learning tracks...');
  const upsert = db.prepare(`
    INSERT INTO directions (slug, name, description, sort_order, is_active)
    VALUES (@slug, @name, @description, @sort_order, 1)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order,
      is_active = 1,
      updated_at = datetime('now')
  `);
  db.transaction((items) => { for (const d of items) upsert.run(d); })(TRACKS);

  const placeholders = TRACKS.map(() => '?').join(',');
  db.prepare(`UPDATE directions SET is_active = 0 WHERE slug NOT IN (${placeholders})`).run(...TRACKS.map(t => t.slug));

  linkProgramsToDirections(db);
  console.log('[db] Learning tracks synced');
}

function linkProgramsToDirections(db) {
  const dirMap = Object.fromEntries(
    db.prepare('SELECT id, slug FROM directions WHERE is_active = 1').all().map(d => [d.slug, d.id]),
  );
  if (!Object.keys(dirMap).length) return;

  for (const [progSlug, dirSlug] of Object.entries(PROGRAM_DIRECTION)) {
    const dirId = dirMap[dirSlug];
    if (!dirId) continue;
    db.prepare('UPDATE programs SET direction_id = ? WHERE slug = ?').run(dirId, progSlug);
  }

  db.prepare(`UPDATE programs SET is_featured = 1 WHERE slug = 'offensive'`).run();
  db.prepare(`UPDATE programs SET is_featured = 0 WHERE slug != 'offensive'`).run();
}

function ensureAllPrograms(db) {
  const upsert = db.prepare(`
    INSERT INTO programs (slug, name, level, duration, bounty_reward, description, tags, is_active)
    VALUES (@slug, @name, @level, @duration, @bounty_reward, @description, @tags, 1)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      level = excluded.level,
      duration = excluded.duration,
      bounty_reward = excluded.bounty_reward,
      description = excluded.description,
      tags = excluded.tags,
      is_active = 1
  `);
  db.transaction((items) => { for (const p of items) upsert.run(p); })(PROGRAMS);
}

function ensureExtraPrograms(db) {
  ensureAllPrograms(db);
}

function ensureOwner(db) {
  const email = (process.env.OWNER_EMAIL || DEFAULT_OWNER_EMAIL).toLowerCase();
  const password = process.env.OWNER_PASSWORD || DEFAULT_OWNER_PASSWORD;
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  const handle = 'lab_owner';

  const byEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const byHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle);
  const byRole = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get();
  const ownerId = byEmail?.id || byHandle?.id || byRole?.id;

  if (ownerId) {
    db.prepare(`
      UPDATE users SET email = ?, password_hash = ?, role = 'owner', name = 'Адміністратор', handle = ?,
        updated_at = datetime('now') WHERE id = ?
    `).run(email, hash, handle, ownerId);
    db.prepare(`UPDATE users SET role = 'student' WHERE role = 'owner' AND id != ?`).run(ownerId);
  } else {
    db.prepare(`
      INSERT INTO users (email, password_hash, name, handle, role, bounty_points)
      VALUES (?, ?, 'Адміністратор', ?, 'owner', 0)
    `).run(email, hash, handle);
  }

  console.log(`[db] Owner account: ${email}`);
}

function ensureTestStudent(db) {
  const email = (process.env.TEST_STUDENT_EMAIL || TEST_STUDENT_EMAIL).toLowerCase();
  const password = process.env.TEST_STUDENT_PASSWORD || TEST_STUDENT_PASSWORD;
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  const handle = 'test_student';
  const name = 'Тестовий Учень';

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR handle = ?').get(email, handle);
  let userId;

  if (existing) {
    userId = existing.id;
    db.prepare(`
      UPDATE users SET email = ?, password_hash = ?, name = ?, handle = ?, role = 'student',
        billing_exempt = 1, updated_at = datetime('now') WHERE id = ?
    `).run(email, hash, name, handle, userId);
  } else {
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, name, handle, role, bounty_points, billing_exempt)
      VALUES (?, ?, ?, ?, 'student', 120, 1)
    `).run(email, hash, name, handle);
    userId = result.lastInsertRowid;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  db.prepare(`
    INSERT OR IGNORE INTO payment_records (user_id, period_year, period_month, note)
    VALUES (?, ?, ?, 'Тестовий акаунт')
  `).run(userId, year, month);

  console.log(`[db] Test student: ${email} / ${password}`);
}

function ensureTestTeacher(db) {
  const email = (process.env.TEST_TEACHER_EMAIL || TEST_TEACHER_EMAIL).toLowerCase();
  const password = process.env.TEST_TEACHER_PASSWORD || TEST_TEACHER_PASSWORD;
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  const handle = 'test_teacher';
  const name = 'Тестовий Викладач';

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR handle = ?').get(email, handle);
  if (existing) {
    db.prepare(`
      UPDATE users SET email = ?, password_hash = ?, name = ?, handle = ?, role = 'teacher',
        updated_at = datetime('now') WHERE id = ?
    `).run(email, hash, name, handle, existing.id);
  } else {
    db.prepare(`
      INSERT INTO users (email, password_hash, name, handle, role, bounty_points)
      VALUES (?, ?, ?, ?, 'teacher', 0)
    `).run(email, hash, name, handle);
  }

  console.log(`[db] Test teacher: ${email} / ${password}`);
}

function bootstrapAdmin(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return;

  const email = process.env.BOOTSTRAP_EMAIL;
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!email || !password) return;

  const role = ROLES.includes(process.env.BOOTSTRAP_ROLE) ? process.env.BOOTSTRAP_ROLE : 'owner';
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  const handle = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20) || 'admin';

  db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, role, bounty_points)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(email.toLowerCase(), hash, 'Адміністратор', handle, role);

  console.log(`[db] Bootstrap admin: ${email} (${role})`);
}

export function syncCatalog(db) {
  ensureAllPrograms(db);
  ensureDirections(db);
  ensureOwner(db);
  ensureTestStudent(db);
  ensureTestTeacher(db);
}

export function seedDatabase(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM programs').get().c;
  if (count === 0) {
    console.log('[db] Seeding database...');
    const insertProgram = db.prepare(`
      INSERT INTO programs (slug, name, level, duration, bounty_reward, description, tags)
      VALUES (@slug, @name, @level, @duration, @bounty_reward, @description, @tags)
    `);
    db.transaction((items) => { for (const p of items) insertProgram.run(p); })(PROGRAMS);

    const insertChallenge = db.prepare(`
      INSERT INTO challenges (slug, title, description, bounty_reward, difficulty, program_id)
      VALUES (@slug, @title, @description, @bounty_reward, @difficulty, @program_id)
    `);
    db.transaction((items) => { for (const c of items) insertChallenge.run(c); })(CHALLENGES);
    console.log('[db] Seed complete');
  }

  bootstrapAdmin(db);
  syncCatalog(db);
}
