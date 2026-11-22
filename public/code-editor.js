import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm, showForm, showPrompt } from '/dialog.js';
import {
  LANGUAGE_LABELS,
  buildFileTree,
  commandCatalog,
  commentPrefix,
  completions,
  createHistoryStore,
  filterCommands,
  findRanges,
  formatCursorStatus,
  lineDiff,
  modeForFile,
  parseDiagnostics,
  relativeTime,
  searchInFiles,
  toggleLineComments,
  tokenPrefix,
} from '/code-ide.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

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
const historyStore = createHistoryStore();

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
  previewMode: 'live',
  activity: 'explorer',
  bottomTab: 'output',
  problems: [],
  findOpen: false,
  findQuery: '',
  findReplace: '',
  findIndex: 0,
  paletteOpen: false,
  paletteMode: 'command',
  paletteQuery: '',
  searchQuery: '',
  marks: [],
  matchMarks: [],
  activeLine: null,
  hintEl: null,
};

function showToastLocal(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast--${type || 'success'}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

function currentWorkspace() {
  return state.workspaces.find((w) => w.id === state.activeId);
}

function isMod(e) {
  return e.metaKey || e.ctrlKey;
}

function renderShell(root) {
  root.innerHTML = `
    <div class="ide-shell">
      <nav class="ide-activity" aria-label="IDE">
        ${activityButton('explorer', 'folder', 'Провідник')}
        ${activityButton('search', 'search', 'Пошук')}
        ${activityButton('git', 'code', 'Git')}
        ${activityButton('history', 'history', 'Історія змін')}
      </nav>
      <aside class="ide-sidebar" id="ide-sidebar"></aside>
      <div class="ide-work" id="code-editor-main">
        <p class="empty-state">Оберіть або створіть проєкт зліва</p>
      </div>
    </div>
    <div class="ide-palette" id="ide-palette" hidden>
      <input class="ide-palette-input" id="ide-palette-input" type="search" autocomplete="off" spellcheck="false">
      <div class="ide-palette-list" id="ide-palette-list" role="listbox"></div>
    </div>`;
  root.querySelectorAll('.ide-activity-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActivity(btn.dataset.activity));
  });
  bindGlobalKeys(root);
  renderGitAccounts();
  renderSidebar();
}

function activityButton(id, name, label) {
  return `<button type="button" class="ide-activity-btn${state.activity === id ? ' is-active' : ''}" data-activity="${id}" title="${esc(label)}" aria-label="${esc(label)}">${icon(name, 'ico')}</button>`;
}

function setActivity(id) {
  state.activity = id;
  document.querySelectorAll('.ide-activity-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.activity === id);
  });
  renderSidebar();
  if (id === 'git' && state.activeId) loadGitStatus();
}

function renderSidebar() {
  const el = document.getElementById('ide-sidebar');
  if (!el) return;
  if (state.activity === 'search') return renderSearchSidebar(el);
  if (state.activity === 'git') return renderGitSidebar(el);
  if (state.activity === 'history') return renderHistorySidebar(el);
  renderExplorerSidebar(el);
}

function renderExplorerSidebar(el) {
  el.innerHTML = `
    <div class="ide-side-head">
      <span>Провідник</span>
      <span class="ide-side-actions">
        <button type="button" class="ide-icon-btn" id="code-new-btn" title="Новий проєкт">${icon('plus', 'ico ico--sm')}</button>
        <button type="button" class="ide-icon-btn" id="code-clone-btn" title="Clone з Git">${icon('download', 'ico ico--sm')}</button>
      </span>
    </div>
    <div class="code-workspace-list" id="code-workspace-list"></div>
    <div class="ide-files-head">Файли</div>
    <div class="ide-file-tree" id="ide-file-tree"></div>
    <div class="code-git-accounts" id="code-git-accounts"></div>`;
  el.querySelector('#code-new-btn').addEventListener('click', createWorkspace);
  el.querySelector('#code-clone-btn').addEventListener('click', cloneFromRemote);
  renderWorkspaceList();
  renderFileTree();
  renderGitAccounts();
}

function renderFileTree() {
  const host = document.getElementById('ide-file-tree');
  if (!host) return;
  if (!state.activeId) {
    host.innerHTML = '<p class="empty-state" style="padding:8px 0;font-size:0.75rem">Немає відкритого проєкту</p>';
    return;
  }
  const tree = buildFileTree(state.files);
  const walk = (nodes, depth) => nodes.map((node) => {
    if (node.type === 'dir') {
      return `<div class="ide-tree-dir" style="padding-left:${8 + depth * 12}px">${icon('folder', 'ico ico--sm')}<span>${esc(node.name)}</span></div>${walk(node.children || [], depth + 1)}`;
    }
    const active = node.path === state.activeFilePath ? ' is-active' : '';
    const dirty = state.dirty && node.path === state.activeFilePath ? ' is-dirty' : '';
    return `<button type="button" class="ide-tree-file${active}${dirty}" data-path="${esc(node.path)}" style="padding-left:${8 + depth * 12}px">${icon('file', 'ico ico--sm')}<span>${esc(node.name)}</span></button>`;
  }).join('');
  host.innerHTML = walk(tree.children || [], 0) || '<p class="empty-state" style="padding:8px 0">Немає файлів</p>';
  host.querySelectorAll('.ide-tree-file').forEach((btn) => {
    btn.addEventListener('click', () => switchFile(btn.dataset.path));
  });
}

function searchHitsMarkup(query) {
  const hits = searchInFiles(state.files, query);
  if (!hits.length) {
    return `<p class="empty-state" style="padding:12px 0">${query ? 'Нічого не знайдено' : 'Введіть запит'}</p>`;
  }
  return hits.map((hit) => `<button type="button" class="ide-search-hit" data-path="${esc(hit.path)}" data-line="${hit.line}" data-col="${hit.col}">
      <strong>${esc(hit.path)}:${hit.line}</strong>
      <span>${esc(hit.preview)}</span>
    </button>`).join('');
}

function bindSearchHits(el) {
  el.querySelectorAll('.ide-search-hit').forEach((btn) => {
    btn.addEventListener('click', () => jumpTo(btn.dataset.path, Number(btn.dataset.line), Number(btn.dataset.col)));
  });
}

function renderSearchSidebar(el) {
  el.innerHTML = `
    <div class="ide-side-head"><span>Пошук у проєкті</span></div>
    <input class="ide-side-input" id="ide-search-input" type="search" placeholder="Знайти в файлах…" value="${esc(state.searchQuery)}" autocomplete="off">
    <div class="ide-search-hits" id="ide-search-hits">${searchHitsMarkup(state.searchQuery)}</div>`;
  const input = el.querySelector('#ide-search-input');
  const hitsEl = el.querySelector('#ide-search-hits');
  input?.addEventListener('input', () => {
    state.searchQuery = input.value;
    hitsEl.innerHTML = searchHitsMarkup(state.searchQuery);
    bindSearchHits(el);
  });
  bindSearchHits(el);
}

function renderGitSidebar(el) {
  el.innerHTML = `
    <div class="ide-side-head"><span>Git</span></div>
    <section class="code-git-panel" id="code-git-panel" aria-label="Git">
      <p class="empty-state">Завантаження…</p>
    </section>
    <div class="code-git-accounts" id="code-git-accounts"></div>`;
  renderGitAccounts();
}

function renderHistorySidebar(el) {
  const entries = state.activeId && state.activeFilePath
    ? historyStore.list(state.activeId, state.activeFilePath)
    : [];
  el.innerHTML = `
    <div class="ide-side-head"><span>Історія змін</span></div>
    <p class="ide-history-file">${esc(state.activeFilePath || '—')}</p>
    <div class="ide-history-list">${entries.length
    ? entries.map((entry) => `<button type="button" class="ide-history-item" data-id="${esc(entry.id)}">
        <strong>${esc(entry.label || 'Знімок')}</strong>
        <span>${esc(relativeTime(entry.ts))}</span>
      </button>`).join('')
    : '<p class="empty-state" style="padding:12px 0">Збережіть файл, щоб зʼявилась історія</p>'}</div>
    <div class="ide-diff" id="ide-diff" hidden></div>`;
  el.querySelectorAll('.ide-history-item').forEach((btn) => {
    btn.addEventListener('click', () => previewHistory(btn.dataset.id));
  });
}

function previewHistory(id) {
  const entry = historyStore.get(state.activeId, state.activeFilePath, id);
  const host = document.getElementById('ide-diff');
  if (!entry || !host) return;
  syncActiveFileContent();
  const current = state.files.find((f) => f.path === state.activeFilePath)?.content || '';
  const hunks = lineDiff(entry.content, current);
  host.hidden = false;
  host.innerHTML = `
    <div class="ide-diff-bar">
      <span>${esc(relativeTime(entry.ts))}</span>
      <button type="button" class="btn btn--primary btn--sm" id="ide-restore-btn">Відновити</button>
    </div>
    <pre class="ide-diff-body">${hunks.filter((h) => h.type !== 'equal' || hunks.length < 40).map((h) => {
      const cls = h.type === 'add' ? 'is-add' : h.type === 'del' ? 'is-del' : '';
      const mark = h.type === 'add' ? '+' : h.type === 'del' ? '−' : ' ';
      return `<div class="ide-diff-line ${cls}">${mark} ${esc(h.text)}</div>`;
    }).join('')}</pre>`;
  host.querySelector('#ide-restore-btn')?.addEventListener('click', () => restoreHistory(entry));
}

function restoreHistory(entry) {
  const file = state.files.find((f) => f.path === state.activeFilePath);
  if (!file) return;
  file.content = entry.content;
  state.dirty = true;
  if (state.cm) state.cm.setValue(entry.content);
  updateStatusBar();
  showToastLocal('Відновлено з історії');
}

async function jumpTo(path, line, col) {
  if (path !== state.activeFilePath) await switchFile(path);
  if (!state.cm) return;
  const pos = { line: Math.max(0, line - 1), ch: Math.max(0, col - 1) };
  state.cm.setCursor(pos);
  state.cm.focus();
  state.cm.scrollIntoView(pos, 80);
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

function renderWorkspaceList() {
  const list = document.getElementById('code-workspace-list');
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
    renderWorkspaceList();
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
    renderWorkspaceList();
    await selectWorkspace(workspace.id);
    showToastLocal('Репозиторій склоновано');
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

function destroyEditor() {
  hideHint();
  if (state.cm) state.cm = null;
  if (livePreviewTimer) clearTimeout(livePreviewTimer);
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
    state.problems = [];
    const idx = state.workspaces.findIndex((w) => w.id === id);
    if (idx >= 0) state.workspaces[idx] = { ...state.workspaces[idx], ...workspace };
    renderSidebar();
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
  const crumbs = [ws.name, ...(String(state.activeFilePath || '').split('/'))].filter(Boolean);
  main.innerHTML = `
    <div class="code-editor-toolbar">
      <div class="code-file-tabs" id="code-file-tabs"></div>
      <div class="code-editor-actions">
        <button type="button" class="btn btn--ghost btn--sm" id="code-add-file-btn" title="Новий файл">${icon('plus', 'ico ico--sm')}</button>
        <button type="button" class="btn btn--ghost btn--sm" id="code-find-btn" title="Знайти">${icon('search', 'ico ico--sm')}</button>
        <button type="button" class="btn btn--ghost btn--sm" id="code-palette-btn" title="Палітра команд">${icon('grid', 'ico ico--sm')}</button>
        <button type="button" class="btn btn--outline btn--sm" id="code-save-btn">${icon('check', 'ico ico--sm')}Зберегти${dirtyMark}</button>
        ${['python', 'node'].includes(ws.language)
    ? `<button type="button" class="btn btn--outline btn--sm" id="code-test-btn">${icon('check', 'ico ico--sm')}Тести</button>`
    : ''}
        ${isWeb
    ? `<button type="button" class="btn btn--outline btn--sm" id="code-run-web-btn">${icon('play', 'ico ico--sm')}Publish</button>`
    : `<button type="button" class="btn btn--primary btn--sm" id="code-run-btn">${icon('play', 'ico ico--sm')}Запустити</button>`}
        <button type="button" class="btn btn--ghost btn--sm" id="code-delete-ws-btn" title="Видалити проєкт">${icon('trash', 'ico ico--sm')}</button>
      </div>
    </div>
    <div class="ide-breadcrumb">${crumbs.map((c) => `<span>${esc(c)}</span>`).join('<i>/</i>')}</div>
    <div class="code-ide-split ${isWeb || /\.md$/i.test(state.activeFilePath || '') ? 'code-ide-split--preview' : ''}">
      <div class="code-ide-editor-pane">
        <div class="ide-find-bar" id="ide-find-bar" ${state.findOpen ? '' : 'hidden'}>
          <input id="ide-find-input" type="search" placeholder="Знайти" value="${esc(state.findQuery)}" autocomplete="off">
          <input id="ide-replace-input" type="text" placeholder="Замінити" value="${esc(state.findReplace)}" autocomplete="off">
          <span class="ide-find-count" id="ide-find-count"></span>
          <button type="button" class="ide-icon-btn" id="ide-find-prev" title="Попереднє">↑</button>
          <button type="button" class="ide-icon-btn" id="ide-find-next" title="Наступне">↓</button>
          <button type="button" class="btn btn--ghost btn--xs" id="ide-replace-one">Замінити</button>
          <button type="button" class="btn btn--ghost btn--xs" id="ide-replace-all">Усі</button>
          <button type="button" class="ide-icon-btn" id="ide-find-close">${icon('x', 'ico ico--sm')}</button>
        </div>
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
    : ''}
      </div>
    </div>
    <div class="ide-bottom">
      <div class="ide-bottom-tabs">
        <button type="button" class="ide-bottom-tab${state.bottomTab === 'output' ? ' is-active' : ''}" data-tab="output">${icon('terminal', 'ico ico--sm')}Вивід</button>
        <button type="button" class="ide-bottom-tab${state.bottomTab === 'problems' ? ' is-active' : ''}" data-tab="problems">${icon('warning', 'ico ico--sm')}Проблеми <span id="ide-problem-count">${state.problems.length || ''}</span></button>
      </div>
      <div class="code-output" id="code-output" ${state.bottomTab === 'output' ? '' : 'hidden'}><p class="empty-state">Вивід зʼявиться тут після запуску</p></div>
      <div class="ide-problems" id="ide-problems" ${state.bottomTab === 'problems' ? '' : 'hidden'}></div>
    </div>
    <footer class="ide-statusbar" id="ide-statusbar"></footer>
  `;

  renderFileTabs(main);
  mountEditor(main);
  bindMainEvents(main, isWeb);
  renderProblems();
  updateStatusBar();
  if (state.findOpen) refreshFindMarks();

  if (isWeb) {
    state.previewMode = 'live';
    refreshLivePreview();
    if (ws.activeWebRun?.target_url) state.activeRun = ws.activeWebRun;
  } else if (/\.md$/i.test(state.activeFilePath || '')) {
    updateMarkdownPreview();
  }
}

function bindMainEvents(main, isWeb) {
  main.querySelector('#code-add-file-btn').addEventListener('click', addFile);
  main.querySelector('#code-save-btn').addEventListener('click', saveFiles);
  main.querySelector('#code-find-btn')?.addEventListener('click', () => setFindOpen(true));
  main.querySelector('#code-palette-btn')?.addEventListener('click', () => openPalette('command'));
  main.querySelector('#code-test-btn')?.addEventListener('click', runTests);
  main.querySelector('#code-delete-ws-btn').addEventListener('click', deleteWorkspace);
  main.querySelector('#ide-find-close')?.addEventListener('click', () => setFindOpen(false));
  main.querySelector('#ide-find-next')?.addEventListener('click', () => stepFind(1));
  main.querySelector('#ide-find-prev')?.addEventListener('click', () => stepFind(-1));
  main.querySelector('#ide-replace-one')?.addEventListener('click', () => replaceFind(false));
  main.querySelector('#ide-replace-all')?.addEventListener('click', () => replaceFind(true));
  main.querySelector('#ide-find-input')?.addEventListener('input', (e) => {
    state.findQuery = e.target.value;
    state.findIndex = 0;
    refreshFindMarks(true);
  });
  main.querySelector('#ide-replace-input')?.addEventListener('input', (e) => {
    state.findReplace = e.target.value;
  });
  main.querySelectorAll('.ide-bottom-tab').forEach((btn) => {
    btn.addEventListener('click', () => setBottomTab(btn.dataset.tab));
  });
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
}

function setBottomTab(tab) {
  state.bottomTab = tab;
  document.querySelectorAll('.ide-bottom-tab').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  });
  const output = document.getElementById('code-output');
  const problems = document.getElementById('ide-problems');
  if (output) output.hidden = tab !== 'output';
  if (problems) problems.hidden = tab !== 'problems';
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
  renderMain(document.getElementById('code-editor-root'));
  if (state.activity === 'history') renderSidebar();
  else renderFileTree();
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
  renderFileTree();
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
    mode,
    theme: 'material-darker',
    lineNumbers: true,
    lineWrapping: false,
    gutters: ['CodeMirror-linenumbers', 'lab-diagnostics'],
    matchBrackets: true,
    autoCloseBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    styleActiveLine: false,
    viewportMargin: Infinity,
    extraKeys: {
      'Ctrl-S': () => { saveFiles(); return false; },
      'Cmd-S': () => { saveFiles(); return false; },
      'Ctrl-F': () => { setFindOpen(true); return false; },
      'Cmd-F': () => { setFindOpen(true); return false; },
      'Ctrl-H': () => { setFindOpen(true, true); return false; },
      'Cmd-Alt-F': () => { setFindOpen(true, true); return false; },
      'Ctrl-P': () => { openPalette('file'); return false; },
      'Cmd-P': () => { openPalette('file'); return false; },
      'Ctrl-Shift-P': () => { openPalette('command'); return false; },
      'Cmd-Shift-P': () => { openPalette('command'); return false; },
      'Ctrl-Shift-F': () => { setActivity('search'); document.getElementById('ide-search-input')?.focus(); return false; },
      'Ctrl-G': () => { goToLine(); return false; },
      'Cmd-G': () => { goToLine(); return false; },
      'Ctrl-/': () => { applyToggleComment(); return false; },
      'Cmd-/': () => { applyToggleComment(); return false; },
      'Ctrl-Space': () => { showCompletions(); return false; },
      'F5': () => { (currentWorkspace()?.language === 'web' ? runWeb() : runExec()); return false; },
      'Ctrl-Enter': () => { (currentWorkspace()?.language === 'web' ? runWeb() : runExec()); return false; },
      Esc: () => { closeOverlays(); return false; },
    },
  });
  state.cm.on('change', () => {
    state.dirty = true;
    const saveBtn = document.getElementById('code-save-btn');
    if (saveBtn && !saveBtn.innerHTML.includes('code-dirty')) {
      saveBtn.insertAdjacentHTML('beforeend', ' <span class="code-dirty">●</span>');
    }
    hideHint();
    if (/\.md$/i.test(state.activeFilePath || '')) {
      syncActiveFileContent();
      updateMarkdownPreview();
    } else {
      scheduleLivePreview();
    }
    if (state.findOpen) refreshFindMarks();
    updateStatusBar();
  });
  state.cm.on('cursorActivity', () => {
    highlightActiveLine();
    highlightSelectionMatches();
    updateStatusBar();
  });
  highlightActiveLine();
  if (state.problems.length) applyDiagnosticMarks(state.problems);
}

function highlightActiveLine() {
  if (!state.cm) return;
  if (state.activeLine != null) {
    state.cm.removeLineClass(state.activeLine, 'background', 'ide-active-line');
  }
  state.activeLine = state.cm.getCursor().line;
  state.cm.addLineClass(state.activeLine, 'background', 'ide-active-line');
}

function clearMarks(list) {
  (list || []).forEach((mark) => mark.clear?.());
}

function highlightSelectionMatches() {
  if (!state.cm) return;
  clearMarks(state.matchMarks);
  state.matchMarks = [];
  const selected = state.cm.getSelection();
  if (!selected || selected.length < 2 || selected.length > 40 || /\s/.test(selected)) return;
  const ranges = findRanges(state.cm.getValue(), selected, { caseSensitive: true });
  ranges.slice(0, 80).forEach((range) => {
    state.matchMarks.push(state.cm.markText(
      state.cm.posFromIndex(range.start),
      state.cm.posFromIndex(range.end),
      { className: 'cm-ide-match' },
    ));
  });
}

function setFindOpen(open, focusReplace = false) {
  state.findOpen = open;
  const bar = document.getElementById('ide-find-bar');
  if (bar) bar.hidden = !open;
  if (open) {
    const input = document.getElementById(focusReplace ? 'ide-replace-input' : 'ide-find-input');
    input?.focus();
    input?.select();
    refreshFindMarks(true);
  } else {
    clearMarks(state.marks);
    state.marks = [];
  }
}

function refreshFindMarks(jump = false) {
  if (!state.cm) return;
  clearMarks(state.marks);
  state.marks = [];
  const ranges = findRanges(state.cm.getValue(), state.findQuery);
  ranges.forEach((range, index) => {
    state.marks.push(state.cm.markText(
      state.cm.posFromIndex(range.start),
      state.cm.posFromIndex(range.end),
      { className: index === state.findIndex ? 'cm-ide-find-current' : 'cm-ide-find' },
    ));
  });
  const count = document.getElementById('ide-find-count');
  if (count) count.textContent = ranges.length ? `${state.findIndex + 1}/${ranges.length}` : '0';
  if (jump && ranges[state.findIndex] && state.cm) {
    const pos = state.cm.posFromIndex(ranges[state.findIndex].start);
    state.cm.setCursor(pos);
    state.cm.scrollIntoView(pos, 60);
  }
}

function stepFind(dir) {
  const ranges = findRanges(state.cm?.getValue() || '', state.findQuery);
  if (!ranges.length) return;
  state.findIndex = (state.findIndex + dir + ranges.length) % ranges.length;
  refreshFindMarks(true);
}

function replaceFind(all) {
  if (!state.cm || !state.findQuery) return;
  const value = state.cm.getValue();
  if (all) {
    const next = value.split(state.findQuery).join(state.findReplace);
    state.cm.setValue(next);
  } else {
    const ranges = findRanges(value, state.findQuery);
    const range = ranges[state.findIndex];
    if (!range) return;
    state.cm.replaceRange(
      state.findReplace,
      state.cm.posFromIndex(range.start),
      state.cm.posFromIndex(range.end),
    );
  }
  refreshFindMarks(true);
}

function applyToggleComment() {
  if (!state.cm) return;
  const ws = currentWorkspace();
  const prefix = commentPrefix(ws?.language, state.activeFilePath);
  const from = state.cm.getCursor('from').line;
  const to = state.cm.getCursor('to').line;
  const lines = [];
  for (let line = from; line <= to; line += 1) lines.push(state.cm.getLine(line));
  const next = toggleLineComments(lines, prefix);
  state.cm.replaceRange(
    next.join('\n'),
    { line: from, ch: 0 },
    { line: to, ch: state.cm.getLine(to).length },
  );
}

async function goToLine() {
  const raw = await showPrompt('Номер рядка:');
  const line = parseInt(raw, 10);
  if (!Number.isFinite(line) || !state.cm) return;
  jumpTo(state.activeFilePath, line, 1);
}

function showCompletions() {
  if (!state.cm) return;
  hideHint();
  const cursor = state.cm.getCursor();
  const prefix = tokenPrefix(state.cm.getLine(cursor.line), cursor.ch);
  const items = completions(state.cm.getValue(), prefix);
  if (!items.length) return;
  const hint = document.createElement('div');
  hint.className = 'ide-hint';
  hint.innerHTML = items.map((word, i) => `<button type="button" class="ide-hint-item${i === 0 ? ' is-active' : ''}" data-word="${esc(word)}">${esc(word)}</button>`).join('');
  const coords = state.cm.cursorCoords(true, 'page');
  hint.style.left = `${coords.left}px`;
  hint.style.top = `${coords.bottom + 4}px`;
  document.body.appendChild(hint);
  state.hintEl = hint;
  hint.querySelectorAll('.ide-hint-item').forEach((btn) => {
    btn.addEventListener('click', () => insertCompletion(prefix, btn.dataset.word));
  });
}

function insertCompletion(prefix, word) {
  if (!state.cm) return;
  const cursor = state.cm.getCursor();
  state.cm.replaceRange(word, { line: cursor.line, ch: cursor.ch - prefix.length }, cursor);
  hideHint();
  state.cm.focus();
}

function hideHint() {
  state.hintEl?.remove();
  state.hintEl = null;
}

function openPalette(mode) {
  state.paletteOpen = true;
  state.paletteMode = mode;
  state.paletteQuery = '';
  const palette = document.getElementById('ide-palette');
  const input = document.getElementById('ide-palette-input');
  if (!palette || !input) return;
  palette.hidden = false;
  input.placeholder = mode === 'file' ? 'Перейти до файлу…' : 'Палітра команд…';
  input.value = '';
  renderPaletteList();
  input.focus();
}

function renderPaletteList() {
  const list = document.getElementById('ide-palette-list');
  if (!list) return;
  if (state.paletteMode === 'file') {
    const q = state.paletteQuery.toLowerCase();
    const files = state.files.filter((f) => !q || f.path.toLowerCase().includes(q));
    list.innerHTML = files.map((f, i) => `<button type="button" class="ide-palette-item${i === 0 ? ' is-active' : ''}" data-kind="file" data-path="${esc(f.path)}">${esc(f.path)}</button>`).join('')
      || '<p class="empty-state">Немає файлів</p>';
  } else {
    const items = filterCommands(commandCatalog({ language: currentWorkspace()?.language, dirty: state.dirty }), state.paletteQuery);
    list.innerHTML = items.map((item, i) => `<button type="button" class="ide-palette-item${i === 0 ? ' is-active' : ''}" data-kind="cmd" data-id="${item.id}">
      <span>${esc(item.label)}</span><kbd>${esc(item.keys)}</kbd>
    </button>`).join('');
  }
  list.querySelectorAll('.ide-palette-item').forEach((btn) => {
    btn.addEventListener('click', () => runPaletteItem(btn));
  });
}

function runPaletteItem(btn) {
  closeOverlays();
  if (btn.dataset.kind === 'file') {
    switchFile(btn.dataset.path);
    return;
  }
  const actions = {
    save: saveFiles,
    'new-file': addFile,
    find: () => setFindOpen(true),
    replace: () => setFindOpen(true, true),
    'search-files': () => { setActivity('search'); document.getElementById('ide-search-input')?.focus(); },
    'goto-line': goToLine,
    run: () => (currentWorkspace()?.language === 'web' ? runWeb() : runExec()),
    test: runTests,
    'toggle-comment': applyToggleComment,
    undo: () => state.cm?.undo(),
    redo: () => state.cm?.redo(),
    history: () => setActivity('history'),
    git: () => { setActivity('git'); loadGitStatus(); },
    explorer: () => setActivity('explorer'),
  };
  actions[btn.dataset.id]?.();
}

function closeOverlays() {
  hideHint();
  const palette = document.getElementById('ide-palette');
  if (palette) palette.hidden = true;
  state.paletteOpen = false;
  if (state.findOpen) setFindOpen(false);
}

function bindGlobalKeys(root) {
  const input = root.querySelector('#ide-palette-input');
  input?.addEventListener('input', () => {
    state.paletteQuery = input.value;
    renderPaletteList();
  });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeOverlays();
      e.preventDefault();
    }
    if (e.key === 'Enter') {
      const item = root.querySelector('.ide-palette-item.is-active') || root.querySelector('.ide-palette-item');
      if (item) runPaletteItem(item);
      e.preventDefault();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...root.querySelectorAll('.ide-palette-item')];
      const idx = items.findIndex((el) => el.classList.contains('is-active'));
      const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
      items.forEach((el, i) => el.classList.toggle('is-active', i === next));
      items[next]?.scrollIntoView({ block: 'nearest' });
      e.preventDefault();
    }
  });
  root.addEventListener('keydown', (e) => {
    if (isMod(e) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveFiles();
    }
    if (isMod(e) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      openPalette('command');
    } else if (isMod(e) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
      e.preventDefault();
      openPalette('file');
    }
  });
}

function updateStatusBar() {
  const el = document.getElementById('ide-statusbar');
  if (!el) return;
  const cursor = state.cm?.getCursor() || { line: 0, ch: 0 };
  const status = formatCursorStatus({
    line: cursor.line + 1,
    ch: cursor.ch,
    lineCount: state.cm ? state.cm.lineCount() : 1,
    language: currentWorkspace()?.language,
    dirty: state.dirty,
  });
  const hist = typeof state.cm?.historySize === 'function' ? state.cm.historySize() : null;
  el.innerHTML = `
    <span>${esc(status.cursor)}</span>
    <span>${esc(status.lines)}</span>
    <span>${esc(status.language)}</span>
    <span>${esc(status.indent)}</span>
    <span>${esc(status.encoding)}</span>
    <span>${hist ? `undo ${hist.undo}` : ''}</span>
    <span class="${state.dirty ? 'is-dirty' : ''}">${esc(status.dirty)}</span>`;
}

function renderProblems() {
  const host = document.getElementById('ide-problems');
  const count = document.getElementById('ide-problem-count');
  if (count) count.textContent = state.problems.length || '';
  if (!host) return;
  if (!state.problems.length) {
    host.innerHTML = '<p class="empty-state">Немає проблем</p>';
    return;
  }
  host.innerHTML = state.problems.map((p, i) => `<button type="button" class="ide-problem ${p.severity}" data-i="${i}">
    <strong>${esc(p.file)}:${p.line}</strong> ${esc(p.message)}
  </button>`).join('');
  host.querySelectorAll('.ide-problem').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = state.problems[Number(btn.dataset.i)];
      if (p) jumpTo(p.file === state.activeFilePath || state.files.some((f) => f.path === p.file || f.path.endsWith(p.file))
        ? (state.files.find((f) => f.path === p.file || f.path.endsWith(p.file))?.path || state.activeFilePath)
        : state.activeFilePath, p.line, p.col);
    });
  });
}

function applyDiagnosticMarks(diagnostics) {
  if (!state.cm) return;
  state.cm.clearGutter('lab-diagnostics');
  const currentFile = state.activeFilePath;
  diagnostics
    .filter((item) => !item.file || currentFile?.endsWith(item.file))
    .forEach((item) => {
      const line = Math.max(0, item.line - 1);
      const marker = document.createElement('span');
      marker.className = 'code-diagnostic-marker';
      marker.textContent = '●';
      marker.title = `${item.file}:${item.line} ${item.message}`;
      state.cm.setGutterMarker(line, 'lab-diagnostics', marker);
      const text = state.cm.getLine(line) || '';
      const fromCh = Math.max(0, (item.col || 1) - 1);
      const toCh = Math.min(text.length, fromCh + Math.max(1, (text.slice(fromCh).match(/[A-Za-z0-9_]+/)?.[0].length || 1)));
      state.cm.markText(
        { line, ch: fromCh },
        { line, ch: Math.max(fromCh + 1, toCh) },
        { className: item.severity === 'warning' ? 'cm-ide-warning' : 'cm-ide-error', title: item.message },
      );
    });
}

function showCompilerDiagnostics(output) {
  const notice = document.getElementById('code-editor-diagnostic');
  state.problems = parseDiagnostics(output);
  if (state.cm) applyDiagnosticMarks(state.problems);
  renderProblems();
  if (notice) {
    notice.hidden = state.problems.length === 0;
    notice.textContent = state.problems.length
      ? `${state.problems.length} ${state.problems.length === 1 ? 'помилка' : 'помилки'}: рядки підкреслені`
      : '';
  }
  if (state.problems.length) setBottomTab('problems');
}

async function saveFiles() {
  syncActiveFileContent();
  try {
    await api(`/code/workspaces/${state.activeId}/files`, {
      method: 'PUT',
      body: JSON.stringify({ files: state.files }),
    });
    state.dirty = false;
    const current = state.files.find((f) => f.path === state.activeFilePath);
    if (current) historyStore.push(state.activeId, current.path, current.content, 'Збереження');
    showCompilerDiagnostics('');
    showToastLocal('Збережено');
    const saveBtn = document.getElementById('code-save-btn');
    if (saveBtn) saveBtn.innerHTML = `${icon('check', 'ico ico--sm')}Зберегти`;
    updateStatusBar();
    if (state.activity === 'history') renderSidebar();
    if (state.activity === 'git') await loadGitStatus();
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
  renderSidebar();
}

async function loadGitStatus() {
  if (!state.activeId) return;
  try {
    const { status } = await api(`/code/workspaces/${state.activeId}/git`);
    if (state.activity !== 'git') return;
    renderGitPanel(status);
  } catch (err) {
    const panel = document.getElementById('code-git-panel');
    if (panel) panel.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
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

function paintRunOutput(run, okLabel, failLabel) {
  const output = document.getElementById('code-output');
  if (!output) return;
  const passed = run.status === 'done' && (run.exit_code === 0 || run.exit_code == null);
  const statusLabel = { done: okLabel, error: failLabel, timeout: 'Перевищено час' }[run.status] || run.status;
  output.innerHTML = `
    <div class="code-output-status status-pill ${passed ? 'running' : 'error'}">${statusLabel}</div>
    ${run.stdout ? `<pre class="code-output-stream">${esc(run.stdout)}</pre>` : ''}
    ${run.stderr ? `<pre class="code-output-stream code-output-stderr">${esc(run.stderr)}</pre>` : ''}
    ${!run.stdout && !run.stderr ? '<p class="empty-state">Немає виводу</p>' : ''}
  `;
  setBottomTab('output');
}

async function runExec() {
  if (!await saveFiles()) return;
  const output = document.getElementById('code-output');
  const btn = document.getElementById('code-run-btn');
  if (btn) btn.disabled = true;
  if (output) output.innerHTML = '<p class="empty-state">Виконується…</p>';
  setBottomTab('output');
  try {
    const { run } = await api(`/code/workspaces/${state.activeId}/run`, { method: 'POST' });
    showCompilerDiagnostics(run.stderr);
    paintRunOutput(run, 'Готово', 'Помилка');
  } catch (err) {
    if (output) output.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function runTests() {
  if (!await saveFiles()) return;
  const btn = document.getElementById('code-test-btn');
  const output = document.getElementById('code-output');
  if (btn) btn.disabled = true;
  if (output) output.innerHTML = '<p class="empty-state">Запуск тестів…</p>';
  setBottomTab('output');
  try {
    const { run } = await api(`/code/workspaces/${state.activeId}/test`, { method: 'POST' });
    showCompilerDiagnostics(run.stderr);
    paintRunOutput(run, 'Тести пройшли', 'Є помилки');
  } catch (err) {
    if (output) output.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function runWeb() {
  if (!await saveFiles()) return;
  const preview = document.getElementById('code-web-preview');
  const btn = document.getElementById('code-run-web-btn');
  if (btn) btn.disabled = true;
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
    if (btn) btn.disabled = false;
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
    renderSidebar();
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
    renderWorkspaceList();
    if (state.workspaces.length) await selectWorkspace(state.workspaces[0].id);
  } catch (err) {
    root.querySelector('#code-editor-main').innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
}
