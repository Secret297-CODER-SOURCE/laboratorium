import express from 'express';

const app = express();
const PORT = parseInt(process.env.PORT || '80', 10);
const SLUG = process.env.CTF_SLUG || 'nmap-scan';
const FLAG = process.env.CTF_FLAG || 'lab{missing_flag}';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="uk"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — laboratorium CTF</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0c0c0c;color:#e8e8e8;line-height:1.5;min-height:100vh}
  .bar{padding:12px 20px;background:#141414;border-bottom:1px solid #2a2a2a;font-size:.8rem;color:#888}
  .bar strong{color:#00ff88;font-family:monospace}
  main{max-width:720px;margin:0 auto;padding:28px 20px 48px}
  h1{font-size:1.5rem;margin-bottom:8px}
  .sub{color:#888;font-size:.9rem;margin-bottom:24px}
  .card{background:#141414;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin-bottom:16px}
  label{display:block;font-size:.75rem;color:#888;margin-bottom:6px}
  input,textarea{width:100%;padding:10px 12px;margin-bottom:12px;background:#0a0a0a;border:1px solid #333;border-radius:4px;color:#fff}
  button,.btn{display:inline-block;padding:10px 18px;background:#00ff88;color:#000;border:none;border-radius:4px;font-weight:600;cursor:pointer;text-decoration:none}
  .btn--ghost{background:transparent;color:#00ff88;border:1px solid #00ff88}
  pre,code{font-family:monospace;font-size:.82rem;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:4px}
  pre{padding:14px;overflow-x:auto;margin:12px 0;white-space:pre-wrap}
  .ok{color:#00ff88}.err{color:#ff6b6b}
  .flag-box{margin-top:16px;padding:16px;background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.35);border-radius:8px}
  .flag-box code{background:none;border:none;color:#00ff88;font-size:1rem}
  .comment{padding:10px 12px;background:#0a0a0a;border-left:3px solid #00ff88;margin-bottom:8px}
  .terminal{background:#000;color:#0f0;padding:16px;border-radius:8px;font-family:monospace;min-height:120px}
</style></head><body>
<div class="bar"><strong>laboratorium.</strong> CTF · ${esc(SLUG)} · live</div>
<main><h1>${esc(title)}</h1><p class="sub">Реальний CTF-стенд. Знайдіть flag і здати в кабінеті.</p>${body}</main>
</body></html>`;
}

const comments = [];

const RET_ADDR_MARKER = 'deadbeef';
const CRACKME_PASSWORD = 'hackme2026';

function sqlEcho(user, pass) {
  return `SELECT * FROM users WHERE username='${user}' AND password='${pass}'`;
}

const handlers = {
  'nmap-scan': {
    title: 'Nmap Recon',
    index: () => page('Nmap Recon', `
      <div class="card">
        <p>Ціль показана у вашому кабінеті (вкладка CTF) — лише адреса, без порту.</p>
        <p style="margin-top:12px;color:#888">Запустіть <code>nmap -sV -p1-65535 &lt;host&gt;</code> зі свого термінала, знайдіть нестандартний відкритий порт і прочитайте банер сервісу (наприклад <code>nc &lt;host&gt; &lt;port&gt;</code>). Прапор — прямо в банері.</p>
      </div>`),
  },

  'sql-injection': {
    title: 'SQL Injection Lab',
    index: (req, res) => {
      res.type('html').send(page('SQL Injection Lab', `
        <div class="card">
          <p style="margin-bottom:12px;color:#888">Сервер виконує:</p>
          <pre>SELECT * FROM users WHERE username='&lt;username&gt;' AND password='&lt;password&gt;'</pre>
          <form method="POST" action="/login">
            <label>Username</label><input name="username" placeholder="username" autocomplete="off">
            <label>Password</label><input name="password" type="password">
            <button type="submit">Увійти</button>
          </form>
        </div>`));
    },
    login: (req, res) => {
      const user = String(req.body?.username || '');
      const pass = String(req.body?.password || '');
      const query = sqlEcho(user, pass);
      const commentsOutRest = /'\s*(--|#)/.test(user) || /'\s*(--|#)/.test(pass);
      const tautology = /'\s*or\s*'?1'?\s*=\s*'?1/i.test(user) || /'\s*or\s*'?1'?\s*=\s*'?1/i.test(pass);
      const unionBypass = /'\s*union\s+select/i.test(user);
      if (commentsOutRest || tautology || unionBypass) {
        return res.type('html').send(page('Успіх!', `<div class="card"><p class="ok">SQL injection успішний — авторизацію обійдено!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`));
      }
      res.type('html').send(page('Login failed', `
        <div class="card">
          <p class="err">Невірний логін або пароль.</p>
          <p style="margin-top:12px;color:#888">Виконаний запит:</p>
          <pre>${esc(query)}</pre>
          <a class="btn btn--ghost" href="/">Назад</a>
        </div>`));
    },
  },

  'xss-stored': {
    title: 'Stored XSS',
    index: () => page('Stored XSS', `
      <div class="card">
        <h3 style="margin-bottom:12px">Коментарі</h3>
        ${comments.length ? comments.map(c => `<div class="comment">${c}</div>`).join('') : '<p style="color:#666">Поки немає</p>'}
        <form method="POST" action="/comment" style="margin-top:16px">
          <label>Коментар (HTML не фільтрується)</label>
          <textarea name="text" rows="3"></textarea>
          <button type="submit">Надіслати</button>
        </form>
        <a class="btn btn--ghost" href="/admin" style="margin-top:12px">Панель адміна</a>
      </div>`),
    comment: (req, res) => {
      const text = String(req.body?.text || '').trim();
      if (text) comments.push(text);
      res.redirect('/');
    },
    admin: () => {
      const hasXss = comments.some(c => /<script/i.test(c) || /onerror=/i.test(c));
      const body = hasXss
        ? `<div class="card"><p class="ok">XSS спрацював!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`
        : `<div class="card"><p class="err">Секрет захищено. Спробуйте &lt;script&gt; у коментарі.</p><a class="btn btn--ghost" href="/">Назад</a></div>`;
      return page('Admin panel', body);
    },
  },

  'buffer-overflow': {
    title: 'Stack Overflow 101',
    index: () => page('Stack Overflow 101', `
      <div class="card">
        <pre>void vuln(char *input) {
  char buf[32];
  strcpy(buf, input);   // без перевірки довжини
}
// Пам'ять: [ 32B buf ][ 8B saved EBP ][ 8B return addr ]</pre>
        <form method="POST" action="/overflow">
          <label>Ім'я (payload)</label>
          <input name="name" placeholder="AAAAAAAA...AAAA + DEADBEEF" autocomplete="off">
          <button type="submit">Надіслати</button>
        </form>
      </div>`),
    overflow: (req, res) => {
      const name = String(req.body?.name || '');
      const retSlot = name.slice(32, 40).toLowerCase();
      const overwritesReturnAddr = name.length >= 40 && retSlot === RET_ADDR_MARKER;
      if (overwritesReturnAddr) {
        return res.type('html').send(page('Успіх!', `<div class="card"><p class="ok">Stack smashing detected — EIP перезаписано на 0xDEADBEEF!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`));
      }
      const note = name.length > 32
        ? `Буфер переповнено (${name.length} байт), але return address (байти 33-40) не перезаписана значенням DEADBEEF.`
        : `Буфер вміщує ${name.length}/32 байт — переповнення не сталось.`;
      res.type('html').send(page('Buffer', `<div class="card"><p>${esc(note)}</p><a class="btn btn--ghost" href="/">Спробувати ще</a></div>`));
    },
  },

  'malware-static': {
    title: 'Static Malware Analysis',
    index: () => page('Static Malware Analysis', `
      <div class="card">
        <p>Файл: <code>sample_malware.bin</code></p>
        <a class="btn" href="/download" style="margin-top:12px">Завантажити зразок</a>
      </div>`),
    download: (_req, res) => {
      const flagB64 = Buffer.from(FLAG, 'utf8').toString('base64');
      const content = `MZ FAKE BINARY DEMO
IOC: evil-domain.lab
C2: 10.0.0.66
MUTEX: Global\\a8f3c1
FAKE_FLAG=lab{not_this_one}
FAKE_FLAG=lab{decoy_string}
DEBUG_STR=${flagB64}
END`;
      res.setHeader('Content-Disposition', 'attachment; filename="sample_malware.bin"');
      res.type('text/plain').send(content);
    },
  },

  'python-port-scanner': {
    title: 'Port Scanner Script',
    index: () => page('Port Scanner Script', `
      <div class="card">
        <p>Ціль показана у вашому кабінеті (вкладка CTF) — лише адреса, без порту.</p>
        <p style="margin-top:12px;color:#888">Напишіть власний Python-скрипт на <code>socket</code>, який перебирає порти цілі, знаходить відкритий і читає банер — прапор у ньому.</p>
      </div>`),
  },

  'ghidra-crackme': {
    title: 'Crackme in Ghidra',
    index: (req, res) => {
      const err = req.query.err;
      const key = 0x13;
      const encoded = CRACKME_PASSWORD.split('')
        .map(c => '0x' + (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0'))
        .join(', ');
      const body = err
        ? `<div class="card"><p class="err">${esc(err)}</p><a class="btn btn--ghost" href="/">Назад</a></div>`
        : `<div class="card">
            <pre>#define KEY 0x${key.toString(16)}

void check_password(char *input) {
  unsigned char expected[] = { ${encoded} };
  for (int i = 0; i < sizeof(expected); i++)
    if ((input[i] ^ KEY) != expected[i]) return;
  print_flag();
}</pre>
            <form method="POST" action="/check">
              <label>Пароль</label><input name="password" autocomplete="off">
              <button type="submit">Перевірити</button>
            </form>
          </div>`;
      res.type('html').send(page('Crackme', body));
    },
    check: (req, res) => {
      if (String(req.body?.password || '') === CRACKME_PASSWORD) {
        return res.type('html').send(page('Успіх!', `<div class="card"><p class="ok">Password correct!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`));
      }
      res.redirect('/?err=' + encodeURIComponent('Невірний пароль'));
    },
  },

  'priv-esc-linux': {
    title: 'Linux Privilege Escalation',
    index: () => page('Linux Privilege Escalation', `
      <div class="card">
        <p>SSH-доступ (команда та пароль) показано у вашому кабінеті (вкладка CTF).</p>
        <p style="margin-top:12px;color:#888">Підключіться як <code>lab</code>, знайдіть SUID-бінарник (<code>find / -perm -4000 2&gt;/dev/null</code>) і подивіться, які зовнішні програми він викликає — чи завжди повним шляхом?</p>
      </div>`),
  },
};

const handler = handlers[SLUG];
if (!handler) {
  app.get('*', (_req, res) => res.status(404).send(page('Unknown challenge', '<div class="card"><p class="err">Невідомий CTF slug</p></div>')));
} else {
  app.get('/', (req, res) => {
    const result = handler.index(req, res);
    if (result !== undefined) res.type('html').send(result);
  });
  app.get('/hosts', (_req, res) => {
    const html = handler.hosts?.();
    if (!html) return res.status(404).end();
    res.type('html').send(html);
  });
  app.get('/scan', (req, res) => {
    const result = handler.scan?.(req, res);
    if (result !== undefined) return res.type('html').send(result);
    if (!res.headersSent) res.status(404).end();
  });
  app.get('/admin', (_req, res) => res.type('html').send(handler.admin?.()));
  app.get('/download', (req, res) => handler.download?.(req, res));
  app.post('/login', (req, res) => handler.login?.(req, res));
  app.post('/comment', (req, res) => handler.comment?.(req, res));
  app.post('/overflow', (req, res) => handler.overflow?.(req, res));
  app.post('/scan', (req, res) => handler.scan?.(req, res));
  app.post('/check', (req, res) => handler.check?.(req, res));
  app.post('/escalate', (req, res) => handler.escalate?.(req, res));
}

app.get('/health', (_req, res) => res.json({ ok: true, slug: SLUG }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ctf-lab] ${SLUG} on :${PORT}`);
});
