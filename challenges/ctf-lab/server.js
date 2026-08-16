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

const handlers = {
  'nmap-scan': {
    title: 'Nmap Recon',
    index: () => page('Nmap Recon', `
      <div class="card">
        <p>Ціль: <code>target.lab.internal</code></p>
        <p style="margin-top:12px;color:#888">Проскануйте порти — flag у банері сервісу 31337.</p>
        <a class="btn" href="/scan" style="margin-top:16px">Запустити nmap</a>
      </div>`),
    scan: () => page('Результат nmap', `
      <div class="card">
        <p class="ok">Сканування завершено</p>
        <pre>PORT      STATE SERVICE
22/tcp    open  ssh
80/tcp    open  http
31337/tcp open  elite
|_banner: ${esc(FLAG)}</pre>
        <div class="flag-box"><code>${esc(FLAG)}</code></div>
      </div>`),
  },

  'sql-injection': {
    title: 'SQL Injection Lab',
    index: (req, res) => {
      const err = req.query.err;
      const body = err
        ? `<div class="card"><p class="err">${esc(err)}</p><a class="btn btn--ghost" href="/">Назад</a></div>`
        : `<div class="card">
            <form method="POST" action="/login">
              <label>Username</label><input name="username" placeholder="admin" autocomplete="off">
              <label>Password</label><input name="password" type="password">
              <button type="submit">Увійти</button>
            </form>
          </div>`;
      res.type('html').send(page('SQL Injection Lab', body));
    },
    login: (req, res) => {
      const user = String(req.body?.username || '');
      const bypass = /'\s*or\s*'1'\s*=\s*'1/i.test(user) || user.includes("' OR 1=1") || (user === 'admin' && req.body?.password === 'admin');
      if (bypass) {
        return res.type('html').send(page('Успіх!', `<div class="card"><p class="ok">SQL injection успішний!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`));
      }
      res.redirect('/?err=' + encodeURIComponent('Невірний логін або пароль'));
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
    index: (req, res) => {
      const len = req.query.len;
      const body = len != null
        ? `<div class="card"><p>Буфер: ${esc(len)}/32 байт.</p><a class="btn btn--ghost" href="/">Спробувати ще</a></div>`
        : `<div class="card"><form method="POST" action="/overflow">
            <label>Ім'я (буфер 32 байти)</label><input name="name" autocomplete="off">
            <button type="submit">Надіслати</button>
          </form></div>`;
      res.type('html').send(page('Stack Overflow 101', body));
    },
    overflow: (req, res) => {
      const name = String(req.body?.name || '');
      if (name.length > 32) {
        return res.type('html').send(page('Успіх!', `<div class="card"><p class="ok">Stack smashing!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`));
      }
      res.redirect('/?len=' + name.length);
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
      const content = `MZ FAKE BINARY\nFLAG_STRING=${FLAG}\nC2=10.0.0.66\nEND`;
      res.setHeader('Content-Disposition', 'attachment; filename="sample_malware.bin"');
      res.type('text/plain').send(content);
    },
  },

  'python-port-scanner': {
    title: 'Port Scanner Script',
    index: (req, res) => {
      const port = req.query.port;
      const body = port != null
        ? `<div class="card"><p class="err">Порт ${esc(port)} закритий.</p><a class="btn btn--ghost" href="/">Назад</a></div>`
        : `<div class="card"><form method="POST" action="/scan">
            <label>Хост</label><input name="host" value="127.0.0.1">
            <label>Порт</label><input name="port" value="31337">
            <button type="submit">Сканувати</button>
          </form></div>`;
      res.type('html').send(page('Port Scanner', body));
    },
    scan: (req, res) => {
      const port = parseInt(req.body?.port, 10);
      if (port === 31337) {
        return res.type('html').send(page('Успіх!', `<div class="card"><p class="ok">Порт відкритий!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`));
      }
      res.redirect('/?port=' + port);
    },
  },

  'ghidra-crackme': {
    title: 'Crackme in Ghidra',
    index: (req, res) => {
      const err = req.query.err;
      const body = err
        ? `<div class="card"><p class="err">${esc(err)}</p><a class="btn btn--ghost" href="/">Назад</a></div>`
        : `<div class="card"><pre>void check_password(char *input) {
  if (strcmp(input, "???") == 0)
    print_flag();
}</pre><form method="POST" action="/check">
            <label>Пароль</label><input name="password" autocomplete="off">
            <button type="submit">Перевірити</button>
          </form></div>`;
      res.type('html').send(page('Crackme', body));
    },
    check: (req, res) => {
      if (String(req.body?.password || '') === 'hackme2026') {
        return res.type('html').send(page('Успіх!', `<div class="card"><p class="ok">Password correct!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`));
      }
      res.redirect('/?err=' + encodeURIComponent('Невірний пароль'));
    },
  },

  'priv-esc-linux': {
    title: 'Linux Privilege Escalation',
    index: (req, res) => {
      const err = req.query.err;
      const body = err
        ? `<div class="card"><p class="err">${esc(err)}</p><a class="btn btn--ghost" href="/">Назад</a></div>`
        : `<div class="card terminal"><div>$ whoami</div><div>lab</div>
          <div style="margin-top:8px">$ ls -la /usr/local/bin/</div>
          <div>-rwsr-xr-x 1 root root backup.sh</div></div>
          <div class="card" style="margin-top:16px"><form method="POST" action="/escalate">
            <label>Команда для backup.sh</label><input name="cmd" placeholder="./backup.sh" autocomplete="off">
            <button type="submit">Виконати</button>
          </form></div>`;
      res.type('html').send(page('Priv Esc', body));
    },
    escalate: (req, res) => {
      const cmd = String(req.body?.cmd || '').toLowerCase();
      if (cmd.includes('root') || cmd.includes('sudo') || cmd.includes('id')) {
        return res.type('html').send(page('Успіх!', `<div class="card"><p class="ok">Privilege escalation!</p><div class="flag-box"><code>${esc(FLAG)}</code></div></div>`));
      }
      res.redirect('/?err=' + encodeURIComponent('Недостатньо прав'));
    },
  },
};

const handler = handlers[SLUG];
if (!handler) {
  app.get('*', (_req, res) => res.status(404).send(page('Unknown challenge', '<div class="card"><p class="err">Невідомий CTF slug</p></div>')));
} else {
  app.get('/', (req, res) => {
    if (typeof handler.index === 'function') return handler.index(req, res);
    res.type('html').send(handler.index());
  });
  app.get('/scan', (_req, res) => res.type('html').send(handler.scan?.()));
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
