import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showForm, showConfirm } from '/dialog.js';

let state = {
  projects: [],
  activeId: null,
  info: null,
  dirty: false,
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function showToastLocal(msg, type = 'success') {
  if (typeof window.showToast === 'function') window.showToast(msg, type);
  else console.log(msg);
}

function renderShell(root) {
  root.innerHTML = `
    <aside class="circuits-sidebar">
      <button type="button" class="btn btn--outline btn--sm" id="circuits-new-tpl">${icon('plus', 'ico ico--sm')}З шаблону Wokwi</button>
      <button type="button" class="btn btn--ghost btn--sm" id="circuits-new-link">${icon('link', 'ico ico--sm')}Посилання EasyEDA/Wokwi</button>
      <div class="circuits-list" id="circuits-list"></div>
    </aside>
    <div class="circuits-main" id="circuits-main">
      <p class="empty-state">Оберіть або створіть проєкт схеми</p>
    </div>`;
  root.querySelector('#circuits-new-tpl').addEventListener('click', createFromTemplate);
  root.querySelector('#circuits-new-link').addEventListener('click', createFromLink);
  renderList();
}

function renderList() {
  const list = document.getElementById('circuits-list');
  if (!list) return;
  if (!state.projects.length) {
    list.innerHTML = '<p class="empty-state" style="padding:12px 0">Немає проєктів</p>';
    return;
  }
  list.innerHTML = state.projects.map((p) => `
    <button type="button" class="circuits-item${p.id === state.activeId ? ' active' : ''}" data-id="${p.id}">
      <span>${esc(p.title)}</span>
      <span class="circuits-kind">${esc(p.kind)}</span>
    </button>`).join('');
  list.querySelectorAll('.circuits-item').forEach((btn) => {
    btn.addEventListener('click', () => selectProject(parseInt(btn.dataset.id, 10)));
  });
}

async function createFromTemplate() {
  const templates = state.info?.templates || [];
  const result = await showForm('Шаблон Wokwi', [
    { id: 'title', label: 'Назва', type: 'text', placeholder: 'Blink' },
    {
      id: 'template',
      label: 'Шаблон',
      type: 'select',
      options: templates.map((t) => ({ value: t.id, label: t.title })),
    },
  ]);
  if (!result?.template) return;
  try {
    const { project } = await api('/circuits/projects', {
      method: 'POST',
      body: JSON.stringify({ template: result.template, title: result.title }),
    });
    state.projects = (await api('/circuits/projects')).projects;
    renderList();
    await selectProject(project.id);
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

async function createFromLink() {
  const result = await showForm('Проєкт за посиланням', [
    { id: 'title', label: 'Назва', type: 'text' },
    {
      id: 'kind',
      label: 'Тип',
      type: 'select',
      options: [
        { value: 'wokwi', label: 'Wokwi (Arduino)' },
        { value: 'easyeda', label: 'EasyEDA (схема/PCB)' },
      ],
    },
    { id: 'embed_url', label: 'URL / embed', type: 'text', placeholder: 'https://...' },
    { id: 'external_id', label: 'Wokwi project id (опційно)', type: 'text' },
  ]);
  if (!result?.title || !result?.embed_url) return;
  try {
    const { project } = await api('/circuits/projects', {
      method: 'POST',
      body: JSON.stringify(result),
    });
    state.projects = (await api('/circuits/projects')).projects;
    renderList();
    await selectProject(project.id);
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

async function selectProject(id) {
  try {
    const { project } = await api(`/circuits/projects/${id}`);
    state.activeId = id;
    renderList();
    renderMain(project);
  } catch (err) {
    showToastLocal(err.message, 'error');
  }
}

function renderMain(project) {
  const main = document.getElementById('circuits-main');
  if (!main) return;
  const embed = project.embed_url || 'https://wokwi.com/projects/new/arduino-uno';
  const sketch = project.metadata?.sketch || '';
  main.innerHTML = `
    <div class="circuits-toolbar">
      <div>
        <h3>${esc(project.title)}</h3>
        <p class="circuits-sub">${esc(project.kind)} · <a href="${esc(embed)}" target="_blank" rel="noopener">відкрити зовні</a></p>
      </div>
      <div class="circuits-actions">
        <button type="button" class="btn btn--outline btn--sm" id="circuits-diagnose">${icon('check', 'ico ico--sm')}Діагностика</button>
        <button type="button" class="btn btn--ghost btn--sm" id="circuits-delete">${icon('trash', 'ico ico--sm')}</button>
      </div>
    </div>
    <div class="circuits-split">
      <iframe class="circuits-embed" title="${esc(project.title)}" src="${esc(embed)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"></iframe>
      <aside class="circuits-side">
        <h4>Діагностика уроку</h4>
        <div id="circuits-diag" class="circuits-diag"><p class="empty-state">Натисніть «Діагностика»</p></div>
        ${sketch ? `<h4>Sketch (шаблон)</h4><pre class="circuits-sketch">${esc(sketch)}</pre>` : ''}
        <p class="circuits-note">Симуляція — у Wokwi. Підказки — навчальні правила (не SPICE).</p>
      </aside>
    </div>`;
  main.querySelector('#circuits-diagnose').addEventListener('click', runDiagnose);
  main.querySelector('#circuits-delete').addEventListener('click', async () => {
    if (!await showConfirm('Видалити проєкт схеми?')) return;
    try {
      await api(`/circuits/projects/${project.id}`, { method: 'DELETE' });
      state.projects = (await api('/circuits/projects')).projects;
      state.activeId = null;
      renderList();
      main.innerHTML = '<p class="empty-state">Оберіть або створіть проєкт схеми</p>';
    } catch (err) {
      showToastLocal(err.message, 'error');
    }
  });
}

async function runDiagnose() {
  const box = document.getElementById('circuits-diag');
  if (!box || !state.activeId) return;
  box.innerHTML = '<p class="empty-state">Перевірка…</p>';
  try {
    const res = await api(`/circuits/projects/${state.activeId}/diagnose`);
    box.innerHTML = `
      <ul class="circuits-checks">
        ${(res.checks || []).map((c) => `<li class="${c.pass ? 'ok' : 'fail'}">${c.pass ? '✓' : '✗'} ${esc(c.label)}</li>`).join('') || '<li class="empty-state">Немає правил</li>'}
      </ul>
      ${(res.tips || []).map((t) => `<p class="circuits-tip">${esc(t)}</p>`).join('')}`;
  } catch (err) {
    box.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
}

export async function initCircuitsLab() {
  const root = document.getElementById('circuits-lab-root');
  if (!root) return;
  try {
    state.info = await api('/circuits/info');
    if (!state.info.canUse) {
      root.innerHTML = '<p class="empty-state">Circuits доступні учасникам програмістських напрямків</p>';
      return;
    }
    state.projects = (await api('/circuits/projects')).projects;
    renderShell(root);
    const params = new URLSearchParams(location.search);
    const openId = parseInt(params.get('circuit') || '', 10);
    if (openId && state.projects.some((p) => p.id === openId)) {
      await selectProject(openId);
    }
  } catch (err) {
    root.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
}

export async function loadCircuitsInfo() {
  try {
    return await api('/circuits/info');
  } catch {
    return { canUse: false, templates: [] };
  }
}
