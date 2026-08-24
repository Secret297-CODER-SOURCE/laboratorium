import {
  verifyDemoToken,
  getDemoSession,
  getExpectedFlag,
} from '../services/ctf-demo.service.js';
import { DEFAULT_FLAGS } from '../services/ctf-demo-flags.js';
import { renderLogo } from '../../public/logo.js';
import { icon } from '../../public/icons.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageLayout({ title, slug, token, body, hint }) {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <title>${esc(title)} — CTF Demo</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/icons.css">
  <style>
    body { background: #0c0c0c; color: #e8e8e8; line-height: 1.5; min-height: 100vh; }
    .ctf-demo-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 0; margin-top: 72px;
      border-bottom: 1px solid var(--border);
      font-size: 0.8rem; color: var(--text-muted);
    }
    .ctf-demo-bar strong { color: var(--accent); font-family: var(--mono); font-weight: 500; }
    .ctf-demo-badge {
      padding: 4px 10px; border-radius: 999px; background: var(--accent-subtle);
      color: var(--accent); border: 1px solid rgba(0,255,136,0.3); font-family: var(--mono);
      font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .ctf-demo-main { max-width: 720px; margin: 0 auto; padding: 28px 20px 48px; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .sub { color: #888; font-size: 0.9rem; margin-bottom: 24px; }
    .card {
      background: #141414; border: 1px solid #2a2a2a; border-radius: 8px;
      padding: 20px; margin-bottom: 16px;
    }
    label { display: block; font-size: 0.75rem; color: #888; margin-bottom: 6px; }
    input, textarea, select {
      width: 100%; padding: 10px 12px; margin-bottom: 12px;
      background: #0a0a0a; border: 1px solid #333; border-radius: 4px; color: #fff;
    }
    button, .btn {
      display: inline-block; padding: 10px 18px; background: #00ff88; color: #000;
      border: none; border-radius: 4px; font-weight: 600; cursor: pointer; text-decoration: none;
    }
    button:hover, .btn:hover { filter: brightness(1.1); }
    .btn--ghost { background: transparent; color: #00ff88; border: 1px solid #00ff88; }
    pre, code {
      font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.82rem;
      background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 4px;
    }
    pre { padding: 14px; overflow-x: auto; margin: 12px 0; white-space: pre-wrap; }
    .ok { color: #00ff88; }
    .err { color: #ff6b6b; }
    .flag-box {
      margin-top: 16px; padding: 16px; background: rgba(0,255,136,0.08);
      border: 1px solid rgba(0,255,136,0.35); border-radius: 8px;
    }
    .flag-box code { background: none; border: none; color: #00ff88; font-size: 1rem; }
    .hint { font-size: 0.8rem; color: #666; margin-top: 20px; }
    ul.ports { list-style: none; }
    ul.ports li {
      padding: 8px 12px; border: 1px solid #2a2a2a; border-radius: 4px; margin-bottom: 6px;
      font-family: monospace; font-size: 0.85rem;
    }
    .comment {
      padding: 10px 12px; background: #0a0a0a; border-left: 3px solid #00ff88;
      margin-bottom: 8px; font-size: 0.9rem;
    }
    .terminal {
      background: #000; color: #0f0; padding: 16px; border-radius: 8px;
      font-family: monospace; min-height: 120px;
    }
  </style>
</head>
<body data-theme="flow">
  <header class="header">
    <nav class="nav container">
      ${renderLogo('/dashboard.html?tab=ctf')}
      <a href="/dashboard.html?tab=ctf" class="btn btn--ghost btn--sm hide-mobile ico-inline">${icon('chevron-left', 'ico ico--sm')}CTF кабінет</a>
    </nav>
  </header>
  <div class="container ctf-demo-bar">
    <div><strong>CTF Demo</strong> · ${esc(slug)}</div>
    <span class="ctf-demo-badge">Demo mode</span>
  </div>
  <main class="ctf-demo-main">
    <h1>${esc(title)}</h1>
    <p class="sub">Інтерактивний demo-стенд. Знайдіть flag і здати його у вкладці CTF кабінету.</p>
    ${body}
    ${hint ? `<p class="hint ico-inline">${icon('lightbulb', 'ico ico--sm')}${hint}</p>` : ''}
  </main>
</body>
</html>`;
}

const REQUIRES_REAL_DEPLOY = new Set(['nmap-scan', 'python-port-scanner', 'priv-esc-linux']);

function renderChallengePage(ctx) {
  const { slug, title } = ctx.deployment;
  const token = ctx.token;
  const flag = getExpectedFlag(slug);

  if (REQUIRES_REAL_DEPLOY.has(slug)) {
    return pageLayout({
      title: title || slug,
      slug,
      token,
      hint: '',
      body: `<div class="card"><p class="err">Це завдання вимагає реального Docker-стенду (потрібен LAB_USE_LOCAL_DOCKER=true або підключений lab-agent) — зверніться до адміністратора платформи.</p></div>`,
    });
  }

  switch (slug) {
    case 'sql-injection':
      return pageLayout({
        title,
        slug,
        token,
        hint: 'Бекенд підставляє ваш ввід прямо у SQL-запит нижче. Подумайте, як завершити рядок і змінити логіку WHERE.',
        body: `
          <div class="card">
            <p style="margin-bottom:12px;color:#888">Сервер виконує:</p>
            <pre>SELECT * FROM users WHERE username='&lt;username&gt;' AND password='&lt;password&gt;'</pre>
            <form method="POST" action="/lab/demo/sql-injection/login?token=${encodeURIComponent(token)}">
              <label>Username</label>
              <input name="username" placeholder="username" autocomplete="off">
              <label>Password</label>
              <input name="password" type="password" placeholder="••••••">
              <button type="submit">Увійти</button>
            </form>
          </div>
        `,
      });

    case 'xss-stored':
      return pageLayout({
        title,
        slug,
        token,
        hint: 'Залиште коментар. Потім відкрийте «Панель адміна» — XSS може викрасти секрет.',
        body: `
          <div class="card">
            <h3 style="margin-bottom:12px;font-size:1rem">Коментарі</h3>
            <div id="comments">
              ${getDemoSession(ctx).comments.map(c => `<div class="comment">${c}</div>`).join('') || '<p style="color:#666">Поки немає коментарів</p>'}
            </div>
            <form method="POST" action="/lab/demo/xss-stored/comment?token=${encodeURIComponent(token)}" style="margin-top:16px">
              <label>Ваш коментар (HTML не фільтрується — demo!)</label>
              <textarea name="text" rows="3" placeholder="Привіт!"></textarea>
              <button type="submit">Надіслати</button>
            </form>
            <a class="btn btn--ghost ico-inline" href="/lab/demo/xss-stored/admin?token=${encodeURIComponent(token)}" style="margin-top:12px">Панель адміна ${icon('chevron-right', 'ico ico--sm')}</a>
          </div>
        `,
      });

    case 'buffer-overflow':
      return pageLayout({
        title,
        slug,
        token,
        hint: 'Стек: [buffer 32B][saved EBP 8B][return address 8B]. Заповніть буфер, а потім перезапишіть адресу повернення значенням <code>DEADBEEF</code> (hex).',
        body: `
          <div class="card">
            <pre>void vuln(char *input) {
  char buf[32];
  strcpy(buf, input);   // без перевірки довжини
}
// Пам'ять: [ 32B buf ][ 8B saved EBP ][ 8B return addr ]</pre>
            <form method="POST" action="/lab/demo/buffer-overflow/overflow?token=${encodeURIComponent(token)}">
              <label>Ім'я (payload)</label>
              <input name="name" placeholder="AAAAAAAA...AAAA + DEADBEEF" autocomplete="off">
              <button type="submit">Надіслати</button>
            </form>
          </div>
        `,
      });

    case 'malware-static':
      return pageLayout({
        title,
        slug,
        token,
        hint: 'Запустіть <code>strings sample_malware.bin</code>. Не всі рядки — те, чим здаються; один із них закодовано.',
        body: `
          <div class="card">
            <p>Файл: <code>sample_malware.bin</code> (текстовий demo)</p>
            <a class="btn ico-inline" href="/lab/demo/malware-static/download?token=${encodeURIComponent(token)}" style="margin-top:12px">${icon('download', 'ico ico--sm')}Завантажити зразок</a>
          </div>
        `,
      });

    case 'ghidra-crackme': {
      const key = 0x13;
      const encoded = CRACKME_PASSWORD.split('')
        .map(c => '0x' + (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0'))
        .join(', ');
      return pageLayout({
        title,
        slug,
        token,
        hint: `Це XOR — той самий байт-ключ застосований до кожного символу пароля. Розшифруйте масив (ключ виведено у декомпіляції), потім переведіть коди в ASCII.`,
        body: `
          <div class="card">
            <pre>#define KEY 0x${key.toString(16)}

void check_password(char *input) {
  unsigned char expected[] = { ${encoded} };
  for (int i = 0; i < sizeof(expected); i++)
    if ((input[i] ^ KEY) != expected[i]) return;
  print_flag();
}</pre>
            <form method="POST" action="/lab/demo/ghidra-crackme/check?token=${encodeURIComponent(token)}">
              <label>Пароль</label>
              <input name="password" autocomplete="off">
              <button type="submit">Перевірити</button>
            </form>
          </div>
        `,
      });
    }

    default:
      return pageLayout({
        title: title || slug,
        slug,
        token,
        hint: 'Demo для цього завдання ще не налаштовано — використайте відомий flag з документації.',
        body: `<div class="card"><p>Доступні demo: ${esc(Object.keys(DEFAULT_FLAGS).join(', '))}</p></div>`,
      });
  }
}

function flagRevealPage(ctx, message, flag, extra = '') {
  return pageLayout({
    title: 'Успіх!',
    slug: ctx.slug,
    token: ctx.token,
    body: `
      <div class="card">
        <p class="ok">${esc(message)}</p>
        ${extra}
        <div class="flag-box">
          <p style="margin-bottom:8px;color:#888">Скопіюйте flag у вкладку CTF:</p>
          <code>${esc(flag)}</code>
        </div>
        <a class="btn btn--ghost ico-inline" href="/dashboard.html?tab=ctf" style="margin-top:16px">${icon('chevron-left', 'ico ico--sm')}Повернутись до CTF</a>
      </div>
    `,
  });
}

function demoErrorPage(message = 'Demo-стенд не знайдено або сесія завершена.') {
  return pageLayout({
    title: 'Demo недоступний',
    slug: 'error',
    token: '',
    body: `
      <div class="card">
        <p class="err">${esc(message)}</p>
        <p style="margin-top:12px;color:#888">Поверніться в кабінет → CTF → натисніть «Запустити стенд» і відкрийте demo знову.</p>
        <a class="btn" href="/dashboard.html?tab=ctf" style="margin-top:16px">Відкрити CTF</a>
      </div>
    `,
  });
}

function getDemoCtx(req, res) {
  const token = req.query?.token || req.body?.token;
  const ctx = verifyDemoToken(token);
  if (!ctx) {
    res.status(404).type('html').send(demoErrorPage());
    return null;
  }
  return { ...ctx, token };
}

export function renderDemoPage(req, res) {
  const ctx = getDemoCtx(req, res);
  if (!ctx) return;
  if (ctx.slug !== req.params.slug) {
    res.status(404).type('html').send(demoErrorPage('Завдання не знайдено'));
    return;
  }
  res.type('html').send(renderChallengePage(ctx));
}

const CRACKME_PASSWORD = 'hackme2026';

function sqlEcho(user, pass) {
  return `SELECT * FROM users WHERE username='${user}' AND password='${pass}'`;
}

export function sqliLogin(req, res) {
  const ctx = getDemoCtx(req, res);
  if (!ctx) return;
  const user = String(req.body?.username || '');
  const pass = String(req.body?.password || '');
  const flag = getExpectedFlag('sql-injection');
  const query = sqlEcho(user, pass);
  const commentsOutRest = /'\s*(--|#)/.test(user) || /'\s*(--|#)/.test(pass);
  const tautology = /'\s*or\s*'?1'?\s*=\s*'?1/i.test(user) || /'\s*or\s*'?1'?\s*=\s*'?1/i.test(pass);
  const unionBypass = /'\s*union\s+select/i.test(user);
  const bypass = commentsOutRest || tautology || unionBypass;
  if (bypass) {
    return res.type('html').send(flagRevealPage(ctx, 'SQL injection успішний — авторизацію обійдено!', flag));
  }
  res.type('html').send(pageLayout({
    title: 'Login failed',
    slug: ctx.slug,
    token: ctx.token,
    body: `
      <div class="card">
        <p class="err">Невірний логін або пароль.</p>
        <p style="margin-top:12px;color:#888">Виконаний запит:</p>
        <pre>${esc(query)}</pre>
        <a class="btn btn--ghost ico-inline" href="/lab/demo/sql-injection?token=${encodeURIComponent(ctx.token)}">${icon('chevron-left', 'ico ico--sm')}Назад</a>
      </div>
    `,
  }));
}

export function xssComment(req, res) {
  const ctx = getDemoCtx(req, res);
  if (!ctx) return;
  const text = String(req.body?.text || '').trim();
  if (text) getDemoSession(ctx).comments.push(text);
  res.redirect(`/lab/demo/xss-stored?token=${encodeURIComponent(ctx.token)}`);
}

export function xssAdmin(req, res) {
  const ctx = getDemoCtx(req, res);
  if (!ctx) return;
  const flag = getExpectedFlag('xss-stored');
  const comments = getDemoSession(ctx).comments;
  const hasXss = comments.some(c => /<script/i.test(c) || /onerror=/i.test(c));
  const body = hasXss
    ? `<div class="card"><p class="ok">XSS спрацював — cookie адміна викрадено!</p><div class="flag-box"><code>${esc(flag)}</code></div></div>`
    : `<div class="card"><p class="err">Секрет адміна захищено. Спробуйте injected script у коментарі.</p>
       <p style="margin-top:12px;color:#666">Підказка: &lt;script&gt;alert(1)&lt;/script&gt;</p>
       <a class="btn btn--ghost ico-inline" href="/lab/demo/xss-stored?token=${encodeURIComponent(ctx.token)}" style="margin-top:12px">${icon('chevron-left', 'ico ico--sm')}Назад</a></div>`;
  res.type('html').send(pageLayout({ title: 'Admin panel', slug: ctx.slug, token: ctx.token, body }));
}

const RET_ADDR_MARKER = 'deadbeef';

export function bufferOverflow(req, res) {
  const ctx = getDemoCtx(req, res);
  if (!ctx) return;
  const name = String(req.body?.name || '');
  const flag = getExpectedFlag('buffer-overflow');
  const padding = name.slice(0, 32);
  const retSlot = name.slice(32, 40).toLowerCase();
  const overflowsBuffer = name.length > 32;
  const overwritesReturnAddr = name.length >= 40 && retSlot === RET_ADDR_MARKER;

  if (overwritesReturnAddr) {
    return res.type('html').send(flagRevealPage(ctx, 'Stack smashing detected — EIP перезаписано на 0xDEADBEEF!', flag));
  }
  if (overflowsBuffer) {
    return res.type('html').send(pageLayout({
      title: 'Overflow, but no EIP control',
      slug: ctx.slug,
      token: ctx.token,
      body: `<div class="card"><p class="err">Буфер переповнено (${name.length} байт), але адреса повернення (байти 33-40) не перезаписана правильним значенням.</p><p style="color:#888;margin-top:8px">padding: ${esc(padding)} (${padding.length}/32) · return slot: ${esc(retSlot || '(порожньо)')}</p><a class="btn btn--ghost ico-inline" href="/lab/demo/buffer-overflow?token=${encodeURIComponent(ctx.token)}">${icon('chevron-left', 'ico ico--sm')}Спробувати ще</a></div>`,
    }));
  }
  res.type('html').send(pageLayout({
    title: 'Buffer OK',
    slug: ctx.slug,
    token: ctx.token,
    body: `<div class="card"><p>Буфер вміщує ${name.length}/32 байт — переповнення не сталось.</p><a class="btn btn--ghost ico-inline" href="/lab/demo/buffer-overflow?token=${encodeURIComponent(ctx.token)}">${icon('chevron-left', 'ico ico--sm')}Спробувати ще</a></div>`,
  }));
}

export function malwareDownload(req, res) {
  const ctx = getDemoCtx(req, res);
  if (!ctx) return;
  const flag = getExpectedFlag('malware-static');
  const flagB64 = Buffer.from(flag, 'utf8').toString('base64');
  const content = `MZ FAKE BINARY DEMO
PATH: C:\\Users\\Admin\\secret.exe
IOC: evil-domain.lab
C2: 10.0.0.66
MUTEX: Global\\a8f3c1
FAKE_FLAG=demo{not_this_one}
FAKE_FLAG=demo{decoy_string}
DEBUG_STR=${flagB64}
END`;
  res.setHeader('Content-Disposition', 'attachment; filename="sample_malware.bin"');
  res.type('text/plain').send(content);
}

export function crackmeCheck(req, res) {
  const ctx = getDemoCtx(req, res);
  if (!ctx) return;
  const pass = String(req.body?.password || '');
  const flag = getExpectedFlag('ghidra-crackme');
  if (pass === CRACKME_PASSWORD) {
    return res.type('html').send(flagRevealPage(ctx, 'Password correct!', flag));
  }
  res.type('html').send(pageLayout({
    title: 'Wrong password',
    slug: ctx.slug,
    token: ctx.token,
    body: `<div class="card"><p class="err">Невірний пароль.</p><a class="btn btn--ghost ico-inline" href="/lab/demo/ghidra-crackme?token=${encodeURIComponent(ctx.token)}">${icon('chevron-left', 'ico ico--sm')}Назад</a></div>`,
  }));
}

