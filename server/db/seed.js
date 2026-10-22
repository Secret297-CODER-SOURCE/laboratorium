import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import config from '../config/index.js';
import { ROLES } from '../utils/roles.js';

const PROGRAMS = [
  { slug: 'offensive', name: 'Offensive Security', level: 'Просунутий', duration: '10 місяців', bounty_reward: 500, description: 'Фінальний етап кібербезпеки: оцінювання захисту лише в авторизованих навчальних стендах, перевірка меж доступу та зрозумілий звіт із рекомендаціями.', tags: 'Планування перевірки,Безпечна робота в лабораторії,Оцінка ризиків,Звіт і рекомендації', sort_order: 40 },
  { slug: 'defensive', name: 'Defensive Security', level: 'Середній', duration: '10 місяців', bounty_reward: 400, description: 'Моніторинг подій, первинний аналіз інцидентів і відпрацювання захисних рішень на контрольованих даних.', tags: 'Основи SIEM,Мережеві журнали,Тріаж сповіщень,План реагування', sort_order: 20 },
  { slug: 'python', name: 'Python: основи та автоматизація', level: 'Початковий', duration: '3 місяці', bounty_reward: 250, description: 'Перший крок у програмуванні: синтаксис, робота з даними й невеликі скрипти для безпечної автоматизації.', tags: 'Синтаксис і типи,Умови та цикли,Файли й JSON,Мініпроєкт автоматизації', sort_order: 10 },
  { slug: 'reverse', name: 'Reverse Engineering', level: 'Спеціалізований', duration: '12 місяців', bounty_reward: 450, description: 'Методичний аналіз зразків і програм у відокремленому навчальному середовищі: від формату файлів до документування висновків.', tags: 'Формати виконуваних файлів,Основи асемблера,Статичний аналіз у лабораторії,Документування висновків', sort_order: 30 },
  { slug: 'web', name: 'Web Security: основи', level: 'Початковий', duration: '10 місяців', bounty_reward: 350, description: 'Вступ до кібербезпеки через принципи роботи вебу, мереж і безпечної взаємодії з навчальними застосунками.', tags: 'Основи мереж і вебу,Моделі загроз,OWASP Top 10 у стенді,Захисні рекомендації', sort_order: 10 },
  { slug: 'systems', name: 'Systems Programming', level: 'Спеціалізований', duration: '6 місяців', bounty_reward: 400, description: 'Системне програмування на C/C++: керування пам’яттю, взаємодія з ОС і тестування власного коду в безпечному середовищі.', tags: 'C/C++ та компіляція,Пам’ять і процеси,Основи асемблера,Тестування і налагодження', sort_order: 30 },
  { slug: 'csharp', name: 'C# Development', level: 'Середній', duration: '5 місяців', bounty_reward: 350, description: 'Розробка структурованих застосунків на C# і .NET: API, робота з даними, тестування та базові практики безпечного коду.', tags: 'Об’єктна модель C#,ASP.NET Core API,Бази даних і EF Core,Тести та безпека коду', sort_order: 20 },
  { slug: 'sysadmin', name: 'Systems Administration: основи', level: 'Початковий', duration: '4 місяці', bounty_reward: 300, description: 'Основи адміністрування: командний рядок, облікові записи, мережеві поняття та базове обслуговування навчального Linux-сервера.', tags: 'Linux CLI,Файли й дозволи,Мережеві основи,Резервні копії та журнали', sort_order: 10 },
  { slug: 'python-intermediate', name: 'Python: застосунки та API', level: 'Середній', duration: '4 місяці', bounty_reward: 0, description: 'Перехід від скриптів до підтримуваних програм: модулі, API, обробка помилок і автоматизовані перевірки.', tags: 'Модулі й пакети,HTTP та API,Обробка помилок,Тести й Git', sort_order: 20 },
  { slug: 'python-specialized', name: 'Python: дані та інструменти', level: 'Спеціалізований', duration: '4 місяці', bounty_reward: 0, description: 'Практичні інструменти для роботи з даними та протоколами; усі мережеві вправи виконуються на дозволених стендах.', tags: 'Структури даних,Асинхронність,Робота з протоколами,Навчальний проєкт', sort_order: 30 },
  { slug: 'python-advanced', name: 'Python: архітектура і якість', level: 'Просунутий', duration: '5 місяців', bounty_reward: 0, description: 'Проєктування й підтримка більших Python-застосунків із увагою до архітектури, якості та безпечної обробки даних.', tags: 'Архітектура застосунку,Продуктивність,Безпечна обробка даних,Підсумковий проєкт', sort_order: 40 },
  { slug: 'cpp-foundation', name: 'C++: перші програми', level: 'Початковий', duration: '4 місяці', bounty_reward: 0, description: 'Основи алгоритмів і C++ через невеликі програми, задачі та поступове знайомство з інструментами розробника.', tags: 'Синтаксис і типи,Умови та цикли,Функції й колекції,Консольний проєкт', sort_order: 10 },
  { slug: 'cpp-intermediate', name: 'C++: структури та проєкти', level: 'Середній', duration: '5 місяців', bounty_reward: 0, description: 'Розвиток навичок C++: структурування коду, стандартна бібліотека, налагодження та командна робота з Git.', tags: 'Класи та об’єкти,STL і алгоритми,Git та збірка,Модульні тести', sort_order: 20 },
  { slug: 'cpp-advanced', name: 'C++: системний проєкт', level: 'Просунутий', duration: '6 місяців', bounty_reward: 0, description: 'Підсумковий системний проєкт із багатопотоковістю, профілюванням, тестуванням та аналізом безпечної роботи з пам’яттю.', tags: 'Багатопотоковість,Профілювання,Безпека пам’яті,Підсумковий проєкт', sort_order: 40 },
  { slug: 'csharp-foundation', name: 'C#: старт розробки', level: 'Початковий', duration: '4 місяці', bounty_reward: 0, description: 'Перші кроки в C#: типи, керування потоком, методи й невеликі програми з поступовим переходом до об’єктної моделі.', tags: 'Синтаксис C#,Умови та цикли,Методи й колекції,Консольний застосунок', sort_order: 10 },
  { slug: 'csharp-specialized', name: 'C#: спеціалізація .NET', level: 'Спеціалізований', duration: '5 місяців', bounty_reward: 0, description: 'Побудова повноцінного застосунку на .NET із чіткими шарами, інтеграціями, перевірками якості та безпечними налаштуваннями.', tags: 'Архітектура .NET,Інтеграції та сервіси,Автентифікація основи,CI і якість', sort_order: 30 },
  { slug: 'csharp-advanced', name: 'C#: просунуті застосунки', level: 'Просунутий', duration: '6 місяців', bounty_reward: 0, description: 'Проєктування, спостережуваність і продуктивність .NET-застосунку на наскрізному навчальному проєкті.', tags: 'Масштабування API,Логування та моніторинг,Продуктивність,Підсумковий проєкт', sort_order: 40 },
  { slug: 'sysadmin-intermediate', name: 'Linux: мережі та сервіси', level: 'Середній', duration: '5 місяців', bounty_reward: 0, description: 'Налаштування сервісів і мережевих основ у навчальній інфраструктурі з практикою спостереження та усунення типових несправностей.', tags: 'Мережеві сервіси,SSH і доступи,Вебсервери,Моніторинг журналів', sort_order: 20 },
  { slug: 'sysadmin-specialized', name: 'Інфраструктура та автоматизація', level: 'Спеціалізований', duration: '5 місяців', bounty_reward: 0, description: 'Відтворювана інфраструктура, контейнери й автоматизація рутинних задач на виділених навчальних ресурсах.', tags: 'Docker основи,Автоматизація конфігурацій,Резервування,Контроль змін', sort_order: 30 },
  { slug: 'sysadmin-advanced', name: 'Надійність інфраструктури', level: 'Просунутий', duration: '6 місяців', bounty_reward: 0, description: 'Побудова та підтримка надійного навчального середовища: планування змін, спостережуваність, відновлення й документація.', tags: 'Моніторинг і сповіщення,План відновлення,Місткість і доступність,Підсумковий стенд', sort_order: 40 },
  { slug: 'embedded-foundation', name: 'Embedded: основи мікроконтролерів', level: 'Початковий', duration: '4 місяці', bounty_reward: 0, description: 'Перші кроки в embedded-розробці: C, цифрові сигнали та периферія у симуляторі або на навчальній платі.', tags: 'C для мікроконтролерів,GPIO і таймери,Симулятор Wokwi,Налагодження та Git', sort_order: 10 },
  { slug: 'embedded-intermediate', name: 'Embedded: периферія та протоколи', level: 'Середній', duration: '5 місяців', bounty_reward: 0, description: 'Робота з типовою периферією та шинами даних, побудова модулів і тестування на симульованих пристроях.', tags: 'UART / I2C / SPI,Переривання,Драйвери та HAL,Тести з підробленою периферією', sort_order: 20 },
  { slug: 'embedded-specialized', name: 'Embedded: RTOS та пристрої', level: 'Спеціалізований', duration: '6 місяців', bounty_reward: 0, description: 'Планування задач, обмін повідомленнями й драйвери у навчальному RTOS-проєкті на Zephyr або FreeRTOS.', tags: 'Планувальник RTOS,Черги та семафори,Модель пристроїв,Вимірювання затримок', sort_order: 30 },
  { slug: 'embedded-advanced', name: 'Embedded: надійність та інтеграція', level: 'Просунутий', duration: '6 місяців', bounty_reward: 0, description: 'Завершений навчальний embedded-проєкт із тестами, діагностикою, керованими оновленнями та документацією обмежень.', tags: 'Архітектура прошивки,Надійність і безпека,CI та відтворювана збірка,Підсумковий стенд', sort_order: 40 },
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
  { slug: 'cybersecurity', name: 'Кібербезпека', description: 'Послідовний шлях із чотирьох рівнів: основи, захист, спеціалізація й просунута практика в контрольованих лабораторіях. Орієнтовно 3–4 роки.', sort_order: 1, is_programming: false },
  { slug: 'cpp', name: 'C++', description: 'Чотири компактні рівні: від алгоритмів і перших програм до системного проєкту, пам’яті та багатопотоковості.', sort_order: 2, is_programming: true },
  { slug: 'python', name: 'Python', description: 'Чотири рівні: від синтаксису й автоматизації до API, спеціалізованих інструментів та архітектури застосунків.', sort_order: 3, is_programming: true },
  { slug: 'csharp', name: 'C#', description: 'Чотири рівні: від основ C# до .NET API, архітектури, інтеграцій і підсумкового проєкту.', sort_order: 4, is_programming: true },
  { slug: 'sysadmin', name: 'Системне адміністрування', description: 'Чотири рівні: Linux і мережеві основи, сервіси, автоматизація та надійність інфраструктури.', sort_order: 5, is_programming: false },
  { slug: 'embedded', name: 'Embedded', description: 'Послідовна програма з мікроконтролерів: від C і симулятора до периферії, RTOS та перевірки надійності прошивки.', sort_order: 6, is_programming: true },
];

const PROGRAM_DIRECTION = {
  offensive: 'cybersecurity',
  defensive: 'cybersecurity',
  python: 'python',
  'python-intermediate': 'python',
  'python-specialized': 'python',
  'python-advanced': 'python',
  reverse: 'cybersecurity',
  web: 'cybersecurity',
  systems: 'cpp',
  'cpp-foundation': 'cpp',
  'cpp-intermediate': 'cpp',
  'cpp-advanced': 'cpp',
  csharp: 'csharp',
  'csharp-foundation': 'csharp',
  'csharp-specialized': 'csharp',
  'csharp-advanced': 'csharp',
  sysadmin: 'sysadmin',
  'sysadmin-intermediate': 'sysadmin',
  'sysadmin-specialized': 'sysadmin',
  'sysadmin-advanced': 'sysadmin',
  'embedded-foundation': 'embedded',
  'embedded-intermediate': 'embedded',
  'embedded-specialized': 'embedded',
  'embedded-advanced': 'embedded',
};

function ensureDirections(db) {
  console.log('[db] Syncing learning tracks...');
  const upsert = db.prepare(`
    INSERT INTO directions (slug, name, description, sort_order, is_active, is_programming)
    VALUES (@slug, @name, @description, @sort_order, 1, @is_programming)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order,
      is_programming = excluded.is_programming,
      is_active = 1,
      updated_at = datetime('now')
  `);
  db.transaction((items) => {
    for (const direction of items) {
      upsert.run({ ...direction, is_programming: Number(direction.is_programming) });
    }
  })(TRACKS);

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
    INSERT INTO programs (slug, name, level, duration, bounty_reward, description, tags, sort_order, is_active)
    VALUES (@slug, @name, @level, @duration, @bounty_reward, @description, @tags, @sort_order, 1)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      level = excluded.level,
      duration = excluded.duration,
      bounty_reward = excluded.bounty_reward,
      description = excluded.description,
      tags = excluded.tags,
      sort_order = excluded.sort_order,
      is_active = 1
  `);
  db.transaction((items) => { for (const p of items) upsert.run(p); })(PROGRAMS);
}

function ensureExtraPrograms(db) {
  ensureAllPrograms(db);
}

/**
 * Prints owner credentials to the boot log AND saves them next to the
 * database file. A busy deploy log (Coolify/Docker included) scrolls fast
 * and this only ever prints on the events that generate a new password, so
 * the file is a safety net for whenever the log gets missed. Delete it once
 * copied.
 */
function announceOwnerCredentials(email, password, note) {
  console.log('[db] ==========================================================');
  console.log(`[db] ${note}`);
  console.log(`[db]   email:    ${email}`);
  console.log(`[db]   password: ${password}`);
  console.log('[db] This password is only ever printed here - copy it now.');
  console.log('[db] ==========================================================');

  try {
    const credsPath = join(dirname(config.db.path), 'OWNER_CREDENTIALS.txt');
    writeFileSync(credsPath, [
      `laboratorium. — owner account (${note})`,
      `email:    ${email}`,
      `password: ${password}`,
      '',
      'This is the only place the password is recoverable from — it is',
      'hashed everywhere else. Delete this file once you\'ve copied it;',
      'to get a new one later, run: npm run owner:reset-password',
      '(or set RESET_OWNER_PASSWORD=true and redeploy).',
    ].join('\n'));
    console.log(`[db] Also saved to ${credsPath} — delete it once copied.`);
  } catch (err) {
    console.error(`[db] Could not write OWNER_CREDENTIALS.txt: ${err.message}`);
  }
}

function ensureOwner(db) {
  const byRole = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get();

  if (byRole) {
    // An owner already exists — the only thing left to do is honor an
    // explicit request to reset it (RESET_OWNER_PASSWORD=true), since the
    // password itself can never be recovered/re-printed otherwise. This is
    // what makes "show me a fresh owner login+password in the deploy log"
    // possible on a platform where the log is the only thing conveniently
    // checked (e.g. Coolify) — set the flag, redeploy, read the log, unset it.
    if (!config.resetOwnerPasswordOnBoot) return;
    const owner = db.prepare("SELECT * FROM users WHERE id = ?").get(byRole.id);
    const password = explicitEnv('OWNER_PASSWORD') || crypto.randomBytes(9).toString('base64url');
    const hash = bcrypt.hashSync(password, config.bcryptRounds);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, owner.id);
    announceOwnerCredentials(owner.email, password, 'password reset (RESET_OWNER_PASSWORD=true) — unset it once done');
    return;
  }

  const explicitEmail = explicitEnv('OWNER_EMAIL').toLowerCase();
  const explicitPassword = explicitEnv('OWNER_PASSWORD');
  const generated = !explicitEmail || !explicitPassword;
  const email = explicitEmail || 'admin@laboratorium.club';
  const password = explicitPassword || crypto.randomBytes(9).toString('base64url');

  const handle = 'lab_owner';
  const byEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const byHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle);
  if (byEmail || byHandle) return;

  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  db.prepare(`
    INSERT INTO users (email, password_hash, name, handle, role, bounty_points)
    VALUES (?, ?, 'Адміністратор', ?, 'owner', 0)
  `).run(email, hash, handle);

  if (generated) {
    announceOwnerCredentials(email, password, 'auto-generated on first boot (set OWNER_EMAIL/OWNER_PASSWORD to pick your own)');
  } else {
    console.log(`[db] Owner account created: ${email}`);
  }
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
