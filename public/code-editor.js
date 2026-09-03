import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm, showForm, showPrompt } from '/dialog.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const LANGUAGE_LABELS = {
  python: 'Python', node: 'Node.js', cpp: 'C++', bash: 'Bash', web: 'Web (HTML/CSS/JS)',
};

function modeForFile(language, path) {
  if (language === 'cpp') return 'text/x-c++src';
  if (language === 'bash') return 'shell';
  if (language === 'node') return 'javascript';
  if (language === 'python') return 'python';
  if (/\.css$/i.test(path)) return 'css';
  if (/\.html?$/i.test(path)) return 'htmlmixed';
  return 'javascript';
}

let sandboxInfo = null;

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
  cm: null,
  dirty: false,
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
      <div class="code-workspace-list" id="code-workspace-list"></div>
    </div>
    <div class="code-editor-main" id="code-editor-main">
      <p class="empty-state">Оберіть або створіть проєкт зліва</p>
    </div>`;

  root.querySelector('.code-new-btn').addEventListener('click', createWorkspace);
}

function renderWorkspaceList(root) {
  const list = root.querySelector('#code-workspace-list');
  if (!list) return;
  if (!state.workspaces.length) {
    list.innerHTML = '<p class="empty-state" style="padding:12px 0">Немає проєктів</p>';
    return;
  }
  list.innerHTML = state.workspaces.map(w => `
    <button type="button" class="code-workspace-item${w.id === state.activeId ? ' active' : ''}" data-id="${w.id}">
      <span>${esc(w.name)}</span>
      <span class="code-workspace-lang">${LANGUAGE_LABELS[w.language] || w.language}</span>
    </button>`).join('');
  list.querySelectorAll('.code-workspace-item').forEach(btn => {
    btn.addEventListener('click', () => selectWorkspace(parseInt(btn.dataset.id, 10)));
  });
}

async function createWorkspace() {
  const result = await showForm('Новий проєкт', [
    { id: 'name', label: 'Назва', type: 'text', placeholder: 'Мій проєкт' },
    {
      id: 'language',
      label: 'Мова',
      type: 'select',
      options: Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label })),
    },
  ]);
  if (!result) return;
  try {
    const { workspace } = await api('/code/workspaces', { method: 'POST', body: JSON.stringify(result) });
    state.workspaces = await api('/code/workspaces').then(r => r.workspaces);
    renderWorkspaceList(document.getElementById('code-editor-root'));
    await selectWorkspace(workspace.id);
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

function destroyEditor() {
  if (state.cm) {
    state.cm = null;
  }
}

function currentWorkspace() {
  return state.workspaces.find(w => w.id === state.activeId);
}

async function selectWorkspace(id) {
  const root = document.getElementById('code-editor-root');
  try {
    const { workspace } = await api(`/code/workspaces/${id}`);
    state.activeId = id;
    state.files = workspace.files.length ? workspace.files : [{ path: 'main', content: '' }];
    state.activeFilePath = state.files[0].path;
    state.activeRun = workspace.activeWebRun || null;
    const idx = state.workspaces.findIndex(w => w.id === id);
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
  main.innerHTML = `
    <div class="code-editor-toolbar">
      <div class="code-file-tabs" id="code-file-tabs"></div>
      <div class="code-editor-actions">
        <button type="button" class="btn btn--ghost btn--sm" id="code-add-file-btn" title="Новий файл">${icon('plus', 'ico ico--sm')}</button>
        <button type="button" class="btn btn--outline btn--sm" id="code-save-btn">${icon('check', 'ico ico--sm')}Зберегти</button>
        ${isWeb
    ? `<button type="button" class="btn btn--primary btn--sm" id="code-run-web-btn">${icon('play', 'ico ico--sm')}Запустити прев'ю</button>`
    : `<button type="button" class="btn btn--primary btn--sm" id="code-run-btn">${icon('play', 'ico ico--sm')}Запустити</button>`}
        <button type="button" class="btn btn--ghost btn--sm" id="code-delete-ws-btn" title="Видалити проєкт">${icon('trash', 'ico ico--sm')}</button>
      </div>
    </div>
    <div class="code-editor-cm" id="code-cm-host"></div>
    ${isWeb ? `
      <div class="code-web-preview" id="code-web-preview">
        ${ws.activeWebRun?.target_url ? webPreviewMarkup(ws.activeWebRun.target_url) : '<p class="empty-state">Натисніть «Запустити прев\'ю», щоб побачити результат</p>'}
      </div>` : `
      <div class="code-output" id="code-output">
        <p class="empty-state">Вивід зʼявиться тут після запуску</p>
      </div>`}
  `;

  renderFileTabs(main);
  mountEditor(main);

  main.querySelector('#code-add-file-btn').addEventListener('click', addFile);
  main.querySelector('#code-save-btn').addEventListener('click', saveFiles);
  main.querySelector('#code-delete-ws-btn').addEventListener('click', deleteWorkspace);
  if (isWeb) {
    main.querySelector('#code-run-web-btn').addEventListener('click', runWeb);
  } else {
    main.querySelector('#code-run-btn').addEventListener('click', runExec);
  }
}

function webPreviewMarkup(url) {
  return `
    <div class="code-web-preview-bar">
      <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
      <button type="button" class="btn btn--ghost btn--sm" id="code-stop-web-btn">${icon('x', 'ico ico--sm')}Зупинити</button>
    </div>
    <iframe class="code-web-iframe" src="${esc(url)}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`;
}

function renderFileTabs(main) {
  const tabs = main.querySelector('#code-file-tabs');
  tabs.innerHTML = state.files.map(f => `
    <button type="button" class="code-file-tab${f.path === state.activeFilePath ? ' active' : ''}" data-path="${esc(f.path)}">
      ${esc(f.path)}
      ${state.files.length > 1 ? `<span class="code-file-tab-close" data-path="${esc(f.path)}">×</span>` : ''}
    </button>`).join('');
  tabs.querySelectorAll('.code-file-tab').forEach(btn => {
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
  const f = state.files.find(x => x.path === state.activeFilePath);
  if (f) f.content = state.cm.getValue();
}

function switchFile(path) {
  syncActiveFileContent();
  state.activeFilePath = path;
  const main = document.getElementById('code-editor-main');
  renderFileTabs(main);
  mountEditor(main);
}

async function addFile() {
  const name = await showPrompt('Ім\'я файлу (наприклад: helper.py):');
  if (!name?.trim()) return;
  const path = name.trim().slice(0, 64);
  if (state.files.some(f => f.path === path)) return showToastLocal('Файл вже існує', 'error');
  state.files.push({ path, content: '' });
  switchFile(path);
}

function removeFile(path) {
  if (state.files.length <= 1) return;
  state.files = state.files.filter(f => f.path !== path);
  if (state.activeFilePath === path) state.activeFilePath = state.files[0].path;
  const main = document.getElementById('code-editor-main');
  renderFileTabs(main);
  mountEditor(main);
}

function mountEditor(main) {
  const host = main.querySelector('#code-cm-host');
  if (!host) return;
  host.innerHTML = '';
  const ws = currentWorkspace();
  const file = state.files.find(f => f.path === state.activeFilePath) || state.files[0];

  state.cm = window.CodeMirror(host, {
    value: file?.content || '',
    mode: modeForFile(ws.language, file?.path || ''),
    theme: 'material-darker',
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    viewportMargin: Infinity,
  });
  state.cm.on('change', () => { state.dirty = true; });
}

async function saveFiles() {
  syncActiveFileContent();
  try {
    await api(`/code/workspaces/${state.activeId}/files`, {
      method: 'PUT',
      body: JSON.stringify({ files: state.files }),
    });
    state.dirty = false;
    showToastLocal('Збережено');
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

async function runExec() {
  await saveFiles();
  const output = document.getElementById('code-output');
  const btn = document.getElementById('code-run-btn');
  btn.disabled = true;
  output.innerHTML = '<p class="empty-state">Виконується…</p>';
  try {
    const { run } = await api(`/code/workspaces/${state.activeId}/run`, { method: 'POST' });
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

async function runWeb() {
  await saveFiles();
  const preview = document.getElementById('code-web-preview');
  const btn = document.getElementById('code-run-web-btn');
  btn.disabled = true;
  preview.innerHTML = '<p class="empty-state">Запускається…</p>';
  try {
    const { run } = await api(`/code/workspaces/${state.activeId}/run-web`, { method: 'POST' });
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
    const preview = document.getElementById('code-web-preview');
    preview.innerHTML = '<p class="empty-state">Натисніть «Запустити прев\'ю», щоб побачити результат</p>';
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

async function deleteWorkspace() {
  if (!(await showConfirm('Видалити проєкт остаточно?', { danger: true }))) return;
  try {
    await api(`/code/workspaces/${state.activeId}`, { method: 'DELETE' });
    state.workspaces = state.workspaces.filter(w => w.id !== state.activeId);
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
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = '1';

  const tag = document.getElementById('code-sandbox-tag');
  if (tag && sandboxInfo) {
    tag.textContent = sandboxInfo.enabled ? 'Docker sandbox' : 'не налаштовано';
    tag.classList.add('status-pill', sandboxInfo.enabled ? 'running' : 'stopped');
  }

  renderShell(root);
  try {
    state.workspaces = await api('/code/workspaces').then(r => r.workspaces);
    renderWorkspaceList(root);
    if (state.workspaces.length) await selectWorkspace(state.workspaces[0].id);
  } catch (err) {
    root.querySelector('#code-editor-main').innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
}
