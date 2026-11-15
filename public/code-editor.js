import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm, showForm, showPrompt } from '/dialog.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const LANGUAGE_LABELS = {
  python: 'Python', node: 'Node.js', cpp: 'C++', bash: 'Bash', web: 'Web (HTML/CSS/JS)',
};

const WEB_TEMPLATES = {
  starter: {
    label: 'Старт HTML/CSS/JS',
    files: [
      { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="uk">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>laboratorium</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main class="hero">\n    <h1>Hello, laboratorium!</h1>\n    <p>Редагуйте файли — превʼю оновлюється миттєво.</p>\n    <button id="btn" type="button">Клацни</button>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n' },
      { path: 'style.css', content: ':root { color-scheme: dark; }\nbody { margin: 0; font-family: system-ui, sans-serif; background: #0f1218; color: #e8ecf4; }\n.hero { min-height: 100vh; display: grid; place-content: center; gap: 12px; text-align: center; }\nbutton { padding: 10px 16px; border: 0; border-radius: 10px; background: #6ea8fe; color: #0b1020; font-weight: 600; cursor: pointer; }\n' },
      { path: 'script.js', content: 'const btn = document.getElementById("btn");\nbtn?.addEventListener("click", () => {\n  console.log("clicked at", new Date().toISOString());\n  btn.textContent = "Працює!";\n});\n' },
      { path: 'README.md', content: '# Web-проєкт\n\nРедагуйте `index.html`, `style.css`, `script.js`.\nLive-превʼю зліва оновлюється автоматично.\n' },
    ],
  },
  landing: {
    label: 'Лендінг',
    files: [
      { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="uk">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Cyber School</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <header class="nav"><strong>laboratorium.</strong><a href="#cta">Запис</a></header>\n  <section class="hero">\n    <p class="eyebrow">IT школа</p>\n    <h1>Вчимося безпеці та коду на практиці</h1>\n    <p>Створи лендінг курсу прямо в браузері.</p>\n    <a class="cta" id="cta" href="#">Почати</a>\n  </section>\n  <script src="script.js"></script>\n</body>\n</html>\n' },
      { path: 'style.css', content: 'body{margin:0;font-family:Georgia,serif;background:#0c111a;color:#f4f1ea}\n.nav{display:flex;justify-content:space-between;padding:20px 6vw;border-bottom:1px solid #243044}\n.hero{padding:12vh 6vw;max-width:720px}\n.eyebrow{letter-spacing:.12em;text-transform:uppercase;color:#8aa0c2;font-size:.75rem}\nh1{font-size:clamp(2rem,6vw,3.4rem);line-height:1.1}\n.cta{display:inline-block;margin-top:18px;padding:12px 18px;background:#d97757;color:#111;text-decoration:none;border-radius:999px;font-family:system-ui,sans-serif}\n' },
      { path: 'script.js', content: 'document.querySelector(".cta")?.addEventListener("click", (e) => {\n  e.preventDefault();\n  console.log("CTA clicked");\n  alert("Заявку можна підключити до форми на сайті школи");\n});\n' },
      { path: 'README.md', content: '# Лендінг\n\nМінімальна односторінкова вітрина курсу.\n' },
    ],
  },
  multipage: {
    label: 'Мультисторінка',
    files: [
      { path: 'index.html', content: '<!DOCTYPE html>\n<html lang="uk"><head><meta charset="UTF-8"><title>Головна</title><link rel="stylesheet" href="style.css"></head>\n<body>\n  <nav><a href="index.html">Головна</a><a href="about.html">Про курс</a></nav>\n  <h1>Головна</h1><p>Перейдіть на сторінку «Про курс».</p>\n</body></html>\n' },
      { path: 'about.html', content: '<!DOCTYPE html>\n<html lang="uk"><head><meta charset="UTF-8"><title>Про курс</title><link rel="stylesheet" href="style.css"></head>\n<body>\n  <nav><a href="index.html">Головна</a><a href="about.html">Про курс</a></nav>\n  <h1>Про курс</h1><p>Друга сторінка того ж проєкту.</p>\n</body></html>\n' },
      { path: 'style.css', content: 'body{font-family:system-ui,sans-serif;background:#111827;color:#e5e7eb;margin:0;padding:24px}\nnav{display:flex;gap:12px;margin-bottom:24px}\na{color:#93c5fd}\n' },
      { path: 'script.js', content: 'console.log("multipage workspace");\n' },
      { path: 'README.md', content: '# Мультисторінка\n\nКілька HTML-файлів у одному проєкті.\n' },
    ],
  },
};

function modeForFile(language, path) {
  if (/\.md$/i.test(path)) return 'markdown';
  if (language === 'cpp') return 'text/x-c++src';
  if (language === 'bash') return 'shell';
  if (language === 'node') return 'javascript';
  if (language === 'python') return 'python';
  if (/\.css$/i.test(path)) return 'css';
  if (/\.html?$/i.test(path)) return 'htmlmixed';
  return 'javascript';
}

function renderMarkdown(src) {
  let html = esc(src);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html.replace(/\n\n/g, '</p><p>');
  return `<div class="code-md-preview"><p>${html}</p></div>`;
}

let sandboxInfo = null;
let livePreviewTimer = null;
let gitAccounts = { accounts: [], providers: {} };

export async function loadSandboxInfo() {
  sandboxInfo = await api('/code/info');
  return sandboxInfo;
}

export function getSandboxInfo() {
  return sandboxInfo;
}

let state = {
  workspaces: [],
  activeId: null,
  activeFilePath: null,
  files: [],
  cm: null,
  dirty: false,
  previewMode: 'live', // live | publish | md
};

function showToastLocal(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast--${type || 'success'}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

function renderShell(root) {
  root.innerHTML = `
    <div class="code-editor-sidebar">
      <button type="button" class="btn btn--outline btn--sm code-new-btn">${icon('plus', 'ico ico--sm')}Новий проєкт</button>
      <button type="button" class="btn btn--ghost btn--sm" id="code-clone-btn">${icon('download', 'ico ico--sm')}Clone з Git</button>
      <div class="code-workspace-list" id="code-workspace-list"></div>
      <div class="code-git-accounts" id="code-git-accounts"></div>
    </div>
    <div class="code-editor-main" id="code-editor-main">
      <p class="empty-state">Оберіть або створіть проєкт зліва</p>
    </div>`;

  root.querySelector('.code-new-btn').addEventListener('click', createWorkspace);
  root.querySelector('#code-clone-btn')?.addEventListener('click', cloneFromRemote);
  renderGitAccounts();
}

function renderGitAccounts() {
  const el = document.getElementById('code-git-accounts');
  if (!el) return;
  const accounts = gitAccounts.accounts || [];
  const gh = gitAccounts.providers?.github;
  const gl = gitAccounts.providers?.gitlab;
  el.innerHTML = `
    <div class="code-accounts-head">Git акаунти</div>
    ${accounts.length
    ? accounts.map((a) => `<div class="code-account-row"><span>${esc(a.provider)}</span><strong>@${esc(a.username)}</strong>
        <button type="button" class="btn btn--ghost btn--xs code-unlink-git" data-provider="${esc(a.provider)}">×</button></div>`).join('')
    : '<p class="empty-state" style="padding:4px 0;font-size:0.72rem">Не підключено</p>'}
    <div class="code-account-actions">
      ${gh?.enabled ? '<button type="button" class="btn btn--outline btn--xs code-link-git" data-provider="github">GitHub</button>' : ''}
      ${gl?.enabled ? '<button type="button" class="btn btn--outline btn--xs code-link-git" data-provider="gitlab">GitLab</button>' : ''}
      ${!gh?.enabled && !gl?.enabled ? '<span class="code-workspace-lang">OAuth не налаштовано</span>' : ''}
    </div>`;
  el.querySelectorAll('.code-unlink-git').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/git-oauth/${btn.dataset.provider}`, { method: 'DELETE' });
        await loadGitAccounts();
        showToastLocal('Відʼєднано');
      } catch (err) {
        showToastLocal(err.message, 'error');
      }
    });
  });
  el.querySelectorAll('.code-link-git').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const { url } = await api(`/git-oauth/${btn.dataset.provider}/start`);
        window.location.href = url;
      } catch (err) {
        showToastLocal(err.message, 'error');
      }
    });
  });
}

async function loadGitAccounts() {
  try {
    gitAccounts = await api('/git-oauth/accounts');
  } catch {
    gitAccounts = { accounts: [], providers: {} };
  }
  renderGitAccounts();
}

function renderWorkspaceList(root) {
  const list = root.querySelector('#code-workspace-list');
  if (!list) return;
  if (!state.workspaces.length) {
    list.innerHTML = '<p class="empty-state" style="padding:12px 0">Немає проєктів</p>';
    return;
  }
  list.innerHTML = state.workspaces.map((w) => `
    <button type="button" class="code-workspace-item${w.id === state.activeId ? ' active' : ''}" data-id="${w.id}">
      <span>${esc(w.name)}</span>
      <span class="code-workspace-lang">${LANGUAGE_LABELS[w.language] || w.language}${w.remote_url ? ' · remote' : ''}</span>
    </button>`).join('');
  list.querySelectorAll('.code-workspace-item').forEach((btn) => {
    btn.addEventListener('click', () => selectWorkspace(parseInt(btn.dataset.id, 10)));
  });
}

async function createWorkspace() {
  const templateOpts = Object.entries(WEB_TEMPLATES).map(([value, t]) => ({ value, label: t.label }));
  const result = await showForm('Новий проєкт', [
    { id: 'name', label: 'Назва', type: 'text', placeholder: 'Мій проєкт' },
    {
      id: 'language',
      label: 'Мова',
      type: 'select',
      options: Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label })),
    },
    {
      id: 'template',
      label: 'Шаблон (для Web)',
      type: 'select',
      options: [{ value: 'starter', label: 'Старт' }, ...templateOpts.filter((o) => o.value !== 'starter')],
    },
  ]);
  if (!result) return;
  try {
    const { workspace } = await api('/code/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        name: result.name,
        language: result.language,
        template: result.language === 'web' ? result.template : undefined,
      }),
    });
    state.workspaces = await api('/code/workspaces').then((r) => r.workspaces);
    renderWorkspaceList(document.getElementById('code-editor-root'));
    await selectWorkspace(workspace.id);
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

async function cloneFromRemote() {
  const result = await showForm('Clone репозиторію', [
    { id: 'url', label: 'URL (GitHub/GitLab)', type: 'text', placeholder: 'https://github.com/org/repo' },
    { id: 'name', label: 'Назва проєкту', type: 'text', placeholder: 'Мій fork' },
    {
      id: 'language',
      label: 'Тип проєкту',
      type: 'select',
      options: Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label })),
    },
  ]);
  if (!result?.url) return;
  try {
    const { workspace } = await api('/code/workspaces/clone', {
      method: 'POST',
      body: JSON.stringify(result),
    });
    state.workspaces = await api('/code/workspaces').then((r) => r.workspaces);
    renderWorkspaceList(document.getElementById('code-editor-root'));
    await selectWorkspace(workspace.id);
    showToastLocal('Репозиторій склоновано');
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

function destroyEditor() {
  if (state.cm) state.cm = null;
  if (livePreviewTimer) clearTimeout(livePreviewTimer);
}

function currentWorkspace() {
  return state.workspaces.find((w) => w.id === state.activeId);
}

async function selectWorkspace(id) {
  const root = document.getElementById('code-editor-root');
  try {
    const { workspace } = await api(`/code/workspaces/${id}`);
    state.activeId = id;
    state.files = workspace.files.length ? workspace.files : [{ path: 'main', content: '' }];
    state.activeFilePath = state.files[0].path;
    state.activeRun = workspace.activeWebRun || null;
    state.dirty = false;
    const idx = state.workspaces.findIndex((w) => w.id === id);
    if (idx >= 0) state.workspaces[idx] = { ...state.workspaces[idx], ...workspace };
    renderWorkspaceList(root);
    renderMain(root);
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

function renderMain(root) {
  const ws = currentWorkspace();
  const main = root.querySelector('#code-editor-main');
  if (!ws) {
    main.innerHTML = '<p class="empty-state">Оберіть або створіть проєкт зліва</p>';
    return;
  }

  const isWeb = ws.language === 'web';
  const dirtyMark = state.dirty ? ' <span class="code-dirty" title="Є незбережені зміни">●</span>' : '';
  main.innerHTML = `
    <div class="code-editor-toolbar">
      <div class="code-file-tabs" id="code-file-tabs"></div>
      <div class="code-editor-actions">
        <button type="button" class="btn btn--ghost btn--sm" id="code-add-file-btn" title="Новий файл">${icon('plus', 'ico ico--sm')}</button>
        <button type="button" class="btn btn--outline btn--sm" id="code-save-btn">${icon('check', 'ico ico--sm')}Зберегти${dirtyMark}</button>
        <button type="button" class="btn btn--outline btn--sm" id="code-git-btn" aria-expanded="false" aria-controls="code-git-panel">${icon('clock', 'ico ico--sm')}Git</button>
        ${['python', 'node'].includes(ws.language)
    ? `<button type="button" class="btn btn--outline btn--sm" id="code-test-btn">${icon('check', 'ico ico--sm')}Тести</button>`
    : ''}
        ${isWeb
    ? `<button type="button" class="btn btn--outline btn--sm" id="code-run-web-btn">${icon('play', 'ico ico--sm')}Publish</button>`
    : `<button type="button" class="btn btn--primary btn--sm" id="code-run-btn">${icon('play', 'ico ico--sm')}Запустити</button>`}
        <button type="button" class="btn btn--ghost btn--sm" id="code-delete-ws-btn" title="Видалити проєкт">${icon('trash', 'ico ico--sm')}</button>
      </div>
    </div>
    <section class="code-git-panel" id="code-git-panel" aria-label="Git" hidden></section>
    <div class="code-ide-split ${isWeb || /\.md$/i.test(state.activeFilePath || '') ? 'code-ide-split--preview' : ''}">
      <div class="code-ide-editor-pane">
        <div class="code-editor-cm" id="code-cm-host"></div>
        <p class="code-editor-diagnostic" id="code-editor-diagnostic" role="status" aria-live="polite" hidden></p>
      </div>
      <div class="code-ide-side-pane" id="code-side-pane">
        ${isWeb ? `
          <div class="code-preview-tabs">
            <button type="button" class="code-preview-tab active" data-mode="live">Live</button>
            <button type="button" class="code-preview-tab" data-mode="publish">Published</button>
            <button type="button" class="code-preview-tab" data-mode="console">Console</button>
          </div>
          <div class="code-web-preview" id="code-web-preview"></div>
          <div class="code-console" id="code-console" hidden><pre id="code-console-log"></pre></div>
        ` : /\.md$/i.test(state.activeFilePath || '')
    ? `<div class="code-web-preview" id="code-md-host"></div>`
    : `<div class="code-output" id="code-output"><p class="empty-state">Вивід зʼявиться тут після запуску</p></div>`}
      </div>
    </div>
  `;

  renderFileTabs(main);
  mountEditor(main);
  bindMainEvents(main, isWeb);

  if (isWeb) {
    state.previewMode = 'live';
    refreshLivePreview();
    if (ws.activeWebRun?.target_url) {
      // keep published url available
      state.activeRun = ws.activeWebRun;
    }
  } else if (/\.md$/i.test(state.activeFilePath || '')) {
    updateMarkdownPreview();
  }
}

function bindMainEvents(main, isWeb) {
  main.querySelector('#code-add-file-btn').addEventListener('click', addFile);
  main.querySelector('#code-save-btn').addEventListener('click', saveFiles);
  main.querySelector('#code-git-btn').addEventListener('click', toggleGitPanel);
  main.querySelector('#code-test-btn')?.addEventListener('click', runTests);
  main.querySelector('#code-delete-ws-btn').addEventListener('click', deleteWorkspace);
  if (isWeb) {
    main.querySelector('#code-run-web-btn').addEventListener('click', runWeb);
    main.querySelectorAll('.code-preview-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        main.querySelectorAll('.code-preview-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.previewMode = btn.dataset.mode;
        const preview = main.querySelector('#code-web-preview');
        const consoleEl = main.querySelector('#code-console');
        if (state.previewMode === 'console') {
          preview.hidden = true;
          consoleEl.hidden = false;
        } else {
          preview.hidden = false;
          consoleEl.hidden = true;
          if (state.previewMode === 'live') refreshLivePreview();
          else if (state.activeRun?.target_url) {
            preview.innerHTML = webPreviewMarkup(state.activeRun.target_url);
            preview.querySelector('#code-stop-web-btn')?.addEventListener('click', stopWeb);
          } else {
            preview.innerHTML = '<p class="empty-state">Натисніть Publish для серверного превʼю</p>';
          }
        }
      });
    });
  } else {
    main.querySelector('#code-run-btn')?.addEventListener('click', runExec);
  }

  main.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveFiles();
    }
  });
}

function webPreviewMarkup(url) {
  return `
    <div class="code-web-preview-bar">
      <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
      <button type="button" class="btn btn--ghost btn--sm" id="code-stop-web-btn">${icon('x', 'ico ico--sm')}Зупинити</button>
    </div>
    <iframe class="code-web-iframe" src="${esc(url)}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`;
}

function buildLivePreviewHtml() {
  const files = Object.fromEntries(state.files.map((f) => [f.path, f.content || '']));
  let html = files['index.html'] || files[Object.keys(files).find((k) => /\.html?$/i.test(k))] || '<h1>Додайте index.html</h1>';
  const css = Object.entries(files).filter(([p]) => /\.css$/i.test(p)).map(([, c]) => c).join('\n');
  const js = Object.entries(files).filter(([p]) => /\.js$/i.test(p)).map(([, c]) => c).join('\n');
  const bridge = `<script>(function(){const s=['log','info','warn','error'];s.forEach(m=>{const o=console[m].bind(console);console[m]=function(...a){try{parent.postMessage({type:'lab-console',level:m,args:a.map(String)},'*')}catch(e){}o(...a)};});window.addEventListener('error',e=>{parent.postMessage({type:'lab-console',level:'error',args:[String(e.message)]},'*')});})();<\/script>`;
  if (css) {
    html = html.includes('</head>')
      ? html.replace('</head>', `<style>${css}</style></head>`)
      : `<style>${css}</style>${html}`;
  }
  // strip external script/link to local files we already inlined
  html = html.replace(/<link[^>]+href=["']style\.css["'][^>]*>/gi, '');
  html = html.replace(/<script[^>]+src=["']script\.js["'][^>]*>\s*<\/script>/gi, '');
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${bridge}<script>${js}<\/script></body>`);
  } else {
    html += `${bridge}<script>${js}<\/script>`;
  }
  return html;
}

function appendConsole(level, args) {
  const log = document.getElementById('code-console-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = `code-console-line code-console-${level}`;
  line.textContent = `[${level}] ${args.join(' ')}`;
  log.appendChild(line);
  log.parentElement.scrollTop = log.parentElement.scrollHeight;
}

function refreshLivePreview() {
  const preview = document.getElementById('code-web-preview');
  if (!preview || state.previewMode !== 'live') return;
  const html = buildLivePreviewHtml();
  preview.innerHTML = `<iframe class="code-web-iframe code-web-iframe--live" sandbox="allow-scripts" title="Live preview"></iframe>`;
  const iframe = preview.querySelector('iframe');
  iframe.srcdoc = html;
}

function scheduleLivePreview() {
  if (currentWorkspace()?.language !== 'web') return;
  if (livePreviewTimer) clearTimeout(livePreviewTimer);
  livePreviewTimer = setTimeout(() => {
    syncActiveFileContent();
    refreshLivePreview();
  }, 320);
}

function updateMarkdownPreview() {
  const host = document.getElementById('code-md-host');
  if (!host) return;
  const file = state.files.find((f) => f.path === state.activeFilePath);
  host.innerHTML = renderMarkdown(file?.content || '');
}

function renderFileTabs(main) {
  const tabs = main.querySelector('#code-file-tabs');
  tabs.innerHTML = state.files.map((f) => `
    <button type="button" class="code-file-tab${f.path === state.activeFilePath ? ' active' : ''}" data-path="${esc(f.path)}">
      ${esc(f.path)}
      ${state.files.length > 1 ? `<span class="code-file-tab-close" data-path="${esc(f.path)}">×</span>` : ''}
    </button>`).join('');
  tabs.querySelectorAll('.code-file-tab').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('code-file-tab-close')) {
        e.stopPropagation();
        removeFile(e.target.dataset.path);
        return;
      }
      switchFile(btn.dataset.path);
    });
  });
}

function syncActiveFileContent() {
  if (!state.cm || !state.activeFilePath) return;
  const f = state.files.find((x) => x.path === state.activeFilePath);
  if (f) f.content = state.cm.getValue();
}

function switchFile(path) {
  syncActiveFileContent();
  state.activeFilePath = path;
  const main = document.getElementById('code-editor-main');
  renderMain(document.getElementById('code-editor-root'));
}

async function addFile() {
  const name = await showPrompt('Ім\'я файлу (наприклад: helper.py):');
  if (!name?.trim()) return;
  const path = name.trim().slice(0, 64);
  if (state.files.some((f) => f.path === path)) return showToastLocal('Файл вже існує', 'error');
  state.files.push({ path, content: '' });
  state.dirty = true;
  switchFile(path);
}

function removeFile(path) {
  if (state.files.length <= 1) return;
  state.files = state.files.filter((f) => f.path !== path);
  if (state.activeFilePath === path) state.activeFilePath = state.files[0].path;
  state.dirty = true;
  renderMain(document.getElementById('code-editor-root'));
}

function mountEditor(main) {
  const host = main.querySelector('#code-cm-host');
  if (!host || !window.CodeMirror) return;
  host.innerHTML = '';
  const ws = currentWorkspace();
  const file = state.files.find((f) => f.path === state.activeFilePath) || state.files[0];
  const mode = modeForFile(ws.language, file?.path || '');
  state.cm = window.CodeMirror(host, {
    value: file?.content || '',
    mode: mode === 'markdown' ? 'htmlmixed' : mode,
    theme: 'material-darker',
    lineNumbers: true,
    gutters: ['CodeMirror-linenumbers', 'lab-diagnostics'],
    matchBrackets: true,
    autoCloseBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    viewportMargin: Infinity,
  });
  state.cm.on('change', () => {
    state.dirty = true;
    const saveBtn = document.getElementById('code-save-btn');
    if (saveBtn && !saveBtn.innerHTML.includes('code-dirty')) {
      saveBtn.insertAdjacentHTML('beforeend', ' <span class="code-dirty">●</span>');
    }
    if (/\.md$/i.test(state.activeFilePath || '')) {
      syncActiveFileContent();
      updateMarkdownPreview();
    } else {
      scheduleLivePreview();
    }
  });
}

function showCompilerDiagnostics(output) {
  const notice = document.getElementById('code-editor-diagnostic');
  if (!state.cm || !notice) return;
  state.cm.clearGutter('lab-diagnostics');
  const diagnostics = String(output || '').split('\n').flatMap((line) => {
    const cpp = line.match(/(?:^|\/)([^/\s:]+):(\d+):\d+:\s+(?:fatal\s+)?error:\s*(.+)$/);
    const python = line.match(/File ".*\/([^/"]+)", line (\d+)/);
    const node = line.match(/(?:^|\/)([^/\s:]+\.js):(\d+)(?::\d+)?/);
    const match = cpp || python || node;
    return match ? [{ file: match[1], line: Number(match[2]), message: cpp?.[3] || 'Помилка' }] : [];
  }).filter((item, index, all) => all.findIndex((o) => o.file === item.file && o.line === item.line) === index);

  const currentFile = state.files.find((file) => file.path === state.activeFilePath)?.path;
  diagnostics.filter((item) => !item.file || currentFile?.endsWith(item.file))
    .forEach((item) => {
      const marker = document.createElement('span');
      marker.className = 'code-diagnostic-marker';
      marker.textContent = '●';
      marker.title = `${item.file}:${item.line} ${item.message}`;
      state.cm.setGutterMarker(item.line - 1, 'lab-diagnostics', marker);
    });

  notice.hidden = diagnostics.length === 0;
  notice.textContent = diagnostics.length
    ? `${diagnostics.length} ${diagnostics.length === 1 ? 'помилка' : 'помилки'}: рядки підсвічені`
    : '';
}

async function saveFiles() {
  syncActiveFileContent();
  try {
    await api(`/code/workspaces/${state.activeId}/files`, {
      method: 'PUT',
      body: JSON.stringify({ files: state.files }),
    });
    state.dirty = false;
    showCompilerDiagnostics('');
    showToastLocal('Збережено');
    const saveBtn = document.getElementById('code-save-btn');
    if (saveBtn) saveBtn.innerHTML = `${icon('check', 'ico ico--sm')}Зберегти`;
    if (!document.getElementById('code-git-panel')?.hidden) await loadGitStatus();
    return true;
  } catch (err) {
    showToastLocal(err.message, 'error');
    return false;
  }
}

function renderGitPanel(status) {
  const panel = document.getElementById('code-git-panel');
  if (!panel) return;
  const branches = status.branches || [status.branch || 'main'];
  panel.innerHTML = `
    <div class="code-git-heading">
      <div>
        <h3>Git</h3>
        <p>${status.remote_url ? `Remote: <code>${esc(status.remote_url)}</code>` : 'Локальна історія. Підключіть GitHub/GitLab і Clone/Push.'}</p>
      </div>
      <span class="code-git-branch" id="code-git-branch">${esc(status.branch || 'main')}</span>
    </div>
    <div class="code-git-toolbar">
      <select id="code-git-branch-select" class="admin-inp admin-inp--sm">
        ${branches.map((b) => `<option value="${esc(b)}" ${b === status.branch ? 'selected' : ''}>${esc(b)}</option>`).join('')}
      </select>
      <button type="button" class="btn btn--ghost btn--sm" id="code-git-new-branch">Нова гілка</button>
      <button type="button" class="btn btn--outline btn--sm" id="code-git-pull">Pull</button>
      <button type="button" class="btn btn--outline btn--sm" id="code-git-push">Push</button>
      <button type="button" class="btn btn--ghost btn--sm" id="code-git-merge">Merge…</button>
      <button type="button" class="btn btn--ghost btn--sm" id="code-git-pr">PR/MR</button>
    </div>
    <p class="code-git-status" id="code-git-status" role="status">
      ${status.clean ? 'Робоча копія чиста.' : `Змінено: ${status.changes.length}`}
      ${status.ahead != null ? ` · ahead ${status.ahead}` : ''}
      ${status.behind != null ? ` · behind ${status.behind}` : ''}
    </p>
    <form class="code-git-commit-form" id="code-git-commit-form">
      <label for="code-git-message">Коміт</label>
      <input id="code-git-message" name="message" type="text" maxlength="120" placeholder="Що змінилося?" required>
      <button type="submit" class="btn btn--primary btn--sm" id="code-git-commit-btn">Commit</button>
    </form>
    ${status.changes?.length ? `<pre class="code-git-changes">${esc(status.changes.join('\n'))}</pre>` : ''}
    <ol class="code-git-history" id="code-git-history">
      ${(status.history || []).map((c) => `<li><code>${esc(c.hash)}</code> <span>${esc(c.message)}</span></li>`).join('') || '<li class="empty-state">Порожньо</li>'}
    </ol>
    ${status.merge_conflict ? `<p class="code-output-stderr">Конфлікт merge: ${esc(status.merge_conflict)}</p>` : ''}
  `;
  panel.querySelector('#code-git-commit-form')?.addEventListener('submit', createGitCommit);
  panel.querySelector('#code-git-branch-select')?.addEventListener('change', async (e) => {
    try {
      await api(`/code/workspaces/${state.activeId}/git/branch`, {
        method: 'POST',
        body: JSON.stringify({ name: e.target.value, checkout: true }),
      });
      await reloadWorkspaceFiles();
      await loadGitStatus();
    } catch (err) { showToastLocal(err.message, 'error'); }
  });
  panel.querySelector('#code-git-new-branch')?.addEventListener('click', async () => {
    const name = await showPrompt('Назва гілки:');
    if (!name) return;
    try {
      await api(`/code/workspaces/${state.activeId}/git/branch`, {
        method: 'POST',
        body: JSON.stringify({ name, create: true, checkout: true }),
      });
      await loadGitStatus();
    } catch (err) { showToastLocal(err.message, 'error'); }
  });
  panel.querySelector('#code-git-pull')?.addEventListener('click', async () => {
    try {
      await api(`/code/workspaces/${state.activeId}/git/pull`, { method: 'POST' });
      await reloadWorkspaceFiles();
      await loadGitStatus();
      showToastLocal('Pull виконано');
    } catch (err) { showToastLocal(err.message, 'error'); }
  });
  panel.querySelector('#code-git-push')?.addEventListener('click', async () => {
    try {
      await api(`/code/workspaces/${state.activeId}/git/push`, { method: 'POST' });
      await loadGitStatus();
      showToastLocal('Push виконано');
    } catch (err) { showToastLocal(err.message, 'error'); }
  });
  panel.querySelector('#code-git-merge')?.addEventListener('click', async () => {
    const branch = await showPrompt('Злити гілку в поточну:');
    if (!branch) return;
    try {
      const res = await api(`/code/workspaces/${state.activeId}/git/merge`, {
        method: 'POST',
        body: JSON.stringify({ branch }),
      });
      await reloadWorkspaceFiles();
      await loadGitStatus();
      showToastLocal(res.ok ? 'Merge OK' : (res.message || 'Merge'), res.ok ? 'success' : 'error');
    } catch (err) { showToastLocal(err.message, 'error'); }
  });
  panel.querySelector('#code-git-pr')?.addEventListener('click', async () => {
    const title = await showPrompt('Заголовок PR/MR:');
    if (!title) return;
    try {
      const res = await api(`/code/workspaces/${state.activeId}/git/prs`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      showToastLocal(res.url ? `Створено: ${res.url}` : 'PR/MR створено');
    } catch (err) { showToastLocal(err.message, 'error'); }
  });
}

async function reloadWorkspaceFiles() {
  const { workspace } = await api(`/code/workspaces/${state.activeId}`);
  state.files = workspace.files;
  if (!state.files.find((f) => f.path === state.activeFilePath)) {
    state.activeFilePath = state.files[0]?.path;
  }
  renderMain(document.getElementById('code-editor-root'));
}

async function loadGitStatus() {
  if (!state.activeId) return;
  try {
    const { status } = await api(`/code/workspaces/${state.activeId}/git`);
    renderGitPanel(status);
  } catch (err) {
    const panel = document.getElementById('code-git-panel');
    if (panel) panel.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
}

async function toggleGitPanel() {
  const panel = document.getElementById('code-git-panel');
  const button = document.getElementById('code-git-btn');
  panel.hidden = !panel.hidden;
  button.setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) await loadGitStatus();
}

async function createGitCommit(event) {
  event.preventDefault();
  if (!await saveFiles()) return;
  const button = document.getElementById('code-git-commit-btn');
  const message = document.getElementById('code-git-message').value.trim();
  button.disabled = true;
  try {
    const result = await api(`/code/workspaces/${state.activeId}/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    renderGitPanel(result);
    if (result.committed) event.currentTarget.reset();
    showToastLocal(result.committed ? 'Коміт створено' : 'Немає змін');
  } catch (err) {
    showToastLocal(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function runExec() {
  if (!await saveFiles()) return;
  const output = document.getElementById('code-output');
  const btn = document.getElementById('code-run-btn');
  btn.disabled = true;
  output.innerHTML = '<p class="empty-state">Виконується…</p>';
  try {
    const { run } = await api(`/code/workspaces/${state.activeId}/run`, { method: 'POST' });
    showCompilerDiagnostics(run.stderr);
    const statusLabel = { done: 'Готово', error: 'Помилка', timeout: 'Перевищено час' }[run.status] || run.status;
    output.innerHTML = `
      <div class="code-output-status status-pill ${run.status === 'done' ? 'running' : 'error'}">${statusLabel}</div>
      ${run.stdout ? `<pre class="code-output-stream">${esc(run.stdout)}</pre>` : ''}
      ${run.stderr ? `<pre class="code-output-stream code-output-stderr">${esc(run.stderr)}</pre>` : ''}
      ${!run.stdout && !run.stderr ? '<p class="empty-state">Немає виводу</p>' : ''}
    `;
  } catch (err) {
    output.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

async function runTests() {
  if (!await saveFiles()) return;
  const btn = document.getElementById('code-test-btn');
  const output = document.getElementById('code-output');
  btn.disabled = true;
  if (output) output.innerHTML = '<p class="empty-state">Запуск тестів…</p>';
  try {
    const { run } = await api(`/code/workspaces/${state.activeId}/test`, { method: 'POST' });
    showCompilerDiagnostics(run.stderr);
    const passed = run.status === 'done' && run.exit_code === 0;
    if (output) {
      output.innerHTML = `
        <div class="code-output-status status-pill ${passed ? 'running' : 'error'}">${passed ? 'Тести пройшли' : 'Є помилки'}</div>
        ${run.stdout ? `<pre class="code-output-stream">${esc(run.stdout)}</pre>` : ''}
        ${run.stderr ? `<pre class="code-output-stream code-output-stderr">${esc(run.stderr)}</pre>` : ''}
      `;
    }
  } catch (err) {
    if (output) output.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

async function runWeb() {
  if (!await saveFiles()) return;
  const preview = document.getElementById('code-web-preview');
  const btn = document.getElementById('code-run-web-btn');
  btn.disabled = true;
  state.previewMode = 'publish';
  document.querySelectorAll('.code-preview-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === 'publish');
  });
  const consoleEl = document.getElementById('code-console');
  if (consoleEl) consoleEl.hidden = true;
  if (preview) {
    preview.hidden = false;
    preview.innerHTML = '<p class="empty-state">Publish…</p>';
  }
  try {
    const { run } = await api(`/code/workspaces/${state.activeId}/run-web`, { method: 'POST' });
    state.activeRun = run;
    preview.innerHTML = webPreviewMarkup(run.target_url);
    preview.querySelector('#code-stop-web-btn').addEventListener('click', stopWeb);
  } catch (err) {
    preview.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

async function stopWeb() {
  try {
    await api(`/code/workspaces/${state.activeId}/stop-web`, { method: 'POST' });
    state.activeRun = null;
    state.previewMode = 'live';
    refreshLivePreview();
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

async function deleteWorkspace() {
  if (!(await showConfirm('Видалити проєкт остаточно?', { danger: true }))) return;
  try {
    await api(`/code/workspaces/${state.activeId}`, { method: 'DELETE' });
    state.workspaces = state.workspaces.filter((w) => w.id !== state.activeId);
    state.activeId = null;
    destroyEditor();
    const root = document.getElementById('code-editor-root');
    renderWorkspaceList(root);
    renderMain(root);
    showToastLocal('Проєкт видалено');
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

export async function initCodeEditor() {
  const root = document.getElementById('code-editor-root');
  if (!root) return;
  if (root.dataset.initialized) {
    await loadGitAccounts();
    return;
  }
  root.dataset.initialized = '1';

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'lab-console') appendConsole(e.data.level || 'log', e.data.args || []);
  });

  const tag = document.getElementById('code-sandbox-tag');
  if (tag && sandboxInfo) {
    tag.textContent = sandboxInfo.enabled ? 'Docker sandbox' : 'не налаштовано';
    tag.classList.add('status-pill', sandboxInfo.enabled ? 'running' : 'stopped');
  }

  renderShell(root);
  await loadGitAccounts();
  try {
    state.workspaces = await api('/code/workspaces').then((r) => r.workspaces);
    renderWorkspaceList(root);
    if (state.workspaces.length) await selectWorkspace(state.workspaces[0].id);
  } catch (err) {
    root.querySelector('#code-editor-main').innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
}
