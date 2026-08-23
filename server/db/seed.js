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

function explicitEnv(key) {
  const val = process.env[key];
  return val !== undefined && val !== '' ? val : '';
}

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
  const email = explicitEnv('OWNER_EMAIL').toLowerCase();
  const password = explicitEnv('OWNER_PASSWORD');
  if (!email || !password) return;

  const handle = 'lab_owner';
  const byEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const byHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle);
  const byRole = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get();
  if (byEmail || byHandle || byRole) return;

  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, role, bounty_points)
    VALUES (?, ?, 'Адміністратор', ?, 'owner', 0)
  `).run(email, hash, handle);
  console.log(`[db] Owner account created: ${email}`);
}

function ensureTestStudent(db) {
  if (config.isProd || !config.db.seed) return;
  const email = (explicitEnv('TEST_STUDENT_EMAIL') || 'test.student@lab.dev').toLowerCase();
  const password = explicitEnv('TEST_STUDENT_PASSWORD');
  if (!password) return;

  const handle = 'test_student';
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR handle = ?').get(email, handle);
  if (existing) return;

  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, role, bounty_points, billing_exempt)
    VALUES (?, ?, 'Тестовий Учень', ?, 'student', 120, 1)
  `).run(email, hash, handle);

  const now = new Date();
  db.prepare(`
    INSERT OR IGNORE INTO payment_records (user_id, period_year, period_month, note)
    VALUES (?, ?, ?, 'Тестовий акаунт')
  `).run(result.lastInsertRowid, now.getFullYear(), now.getMonth() + 1);

  console.log(`[db] Test student created: ${email}`);
}

function ensureTestTeacher(db) {
  if (config.isProd || !config.db.seed) return;
  const email = (explicitEnv('TEST_TEACHER_EMAIL') || 'test.teacher@lab.dev').toLowerCase();
  const password = explicitEnv('TEST_TEACHER_PASSWORD');
  if (!password) return;

  const handle = 'test_teacher';
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR handle = ?').get(email, handle);
  if (existing) return;

  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, role, bounty_points)
    VALUES (?, ?, 'Тестовий Викладач', ?, 'teacher', 0)
  `).run(email, hash, handle);
  console.log(`[db] Test teacher created: ${email}`);
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
  ensureOwner(db);
  ensureTestStudent(db);
  ensureTestTeacher(db);
}
