import { t, getLocale } from '/i18n.js';
import {
  CATEGORIES, DIFFICULTIES, TOOLS, PATHS, SCENARIO, filterTools, pathProgress, scoreScenario,
} from '/lab-tools-catalog.js';
import {
  WORKBENCH_TOOLS, workbenchStore, createProject, deleteProject, renameProject, addFinding, removeFinding,
  textToBase64, base64ToText, sha256Hex, analyzeHeaders, decodeJwt, extractIocs, testRegex,
} from '/lab-workbench.js';

const DIFF = { beginner: 'Початковий', intermediate: 'Середній', advanced: 'Просунутий' };
const refState = { query: '', category: 'all', difficulty: 'all' };
const wb = { store: null, activeTool: WORKBENCH_TOOLS[0].id };

function esc(value) {
  const el = document.createElement('span');
  el.textContent = String(value);
  return el.innerHTML;
}

const L = () => (getLocale() === 'en' ? 'en' : 'uk');

// --- Reference catalog (informational, from the previous iteration) -------

function renderReference(root) {
  const loc = L();
  const progress = JSON.parse(localStorage.getItem('lab_tools_progress_v1') || '{}');
  const tools = filterTools(TOOLS, { ...refState, locale: loc });
  const done = progress.done || {};
  root.querySelector('[data-lt="list"]').innerHTML = tools.length ? tools.map((tool) => `
    <article class="lab-tool-card lt-card">
      <h3>${esc(tool.name)}</h3>
      <div class="lt-badges">
        <span class="status-pill">${esc(t(CATEGORIES.find((c) => c.id === tool.category)[loc]))}</span>
        <span class="status-pill">${esc(t(DIFF[tool.difficulty]))}</span>
        ${tool.offensive ? `<span class="status-pill review">${esc(t('Лише інформація'))}</span>` : ''}
      </div>
      <p>${esc(tool.purpose[loc])}</p>
      <p class="lt-meta"><strong>${esc(t('Передумови'))}:</strong> ${esc(tool.prerequisites[loc])}</p>
      <p class="lt-meta"><strong>${esc(t('Вправа'))}:</strong> ${esc(tool.exercise[loc])}</p>
      <div class="lab-tool-actions">
        <a class="btn btn--outline btn--sm" href="${esc(tool.repo)}" target="_blank" rel="noopener noreferrer">${esc(t('Офіційний репозиторій'))}</a>
        <label class="lt-check"><input type="checkbox" data-lt-done="${esc(tool.id)}" ${done[tool.id] ? 'checked' : ''}> ${esc(t('Вивчено'))}</label>
      </div>
    </article>`).join('') : `<p class="empty-state">${esc(t('Нічого не знайдено'))}</p>`;

  root.querySelector('[data-lt="paths"]').innerHTML = PATHS.map((p) => {
    const pr = pathProgress(p, done);
    return `<div class="lt-path"><strong>${esc(p[loc])}</strong>
      <progress max="100" value="${pr.percent}" aria-label="${esc(p[loc])}"></progress>
      <span>${pr.done}/${pr.total}</span></div>`;
  }).join('');
}

function renderScenario(root) {
  const box = root.querySelector('[data-lt="scenario"]');
  box.innerHTML = `
    <p class="lt-meta">${esc(t('Симуляція: жодних запитів до мережі чи реальних моделей. Позначте, які запити є спробою витоку секрету.'))}</p>
    <p class="lt-meta"><code>${esc(SCENARIO.system)}</code></p>
    <ul class="lt-cases">${SCENARIO.cases.map((c) => `
      <li><code>${esc(c.prompt)}</code>
        <label class="lt-check"><input type="checkbox" data-lt-case="${esc(c.id)}"> ${esc(t('Спроба витоку'))}</label></li>`).join('')}
    </ul>
    <div class="lab-tool-actions"><button type="button" class="btn btn--outline btn--sm" data-lt="check">${esc(t('Перевірити'))}</button></div>
    <output class="lab-tool-output" data-lt="result" aria-live="polite"></output>`;
}

function initReference(root) {
  root.querySelector('[data-lt="category"]').innerHTML = `<option value="all">${esc(t('Усі категорії'))}</option>`
    + CATEGORIES.map((c) => `<option value="${c.id}">${esc(t(c[L()]))}</option>`).join('');
  root.querySelector('[data-lt="difficulty"]').innerHTML = `<option value="all">${esc(t('Будь-яка складність'))}</option>`
    + DIFFICULTIES.map((d) => `<option value="${d}">${esc(t(DIFF[d]))}</option>`).join('');
  renderReference(root);
  renderScenario(root);

  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-lt="search"]')) { refState.query = e.target.value; renderReference(root); }
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-lt="category"]')) { refState.category = el.value; renderReference(root); }
    else if (el.matches('[data-lt="difficulty"]')) { refState.difficulty = el.value; renderReference(root); }
    else if (el.dataset.ltDone) {
      const data = JSON.parse(localStorage.getItem('lab_tools_progress_v1') || '{}');
      data.done = { ...data.done, [el.dataset.ltDone]: el.checked };
      localStorage.setItem('lab_tools_progress_v1', JSON.stringify(data));
      renderReference(root);
    }
  });
  root.addEventListener('click', (e) => {
    if (!e.target.matches('[data-lt="check"]')) return;
    const answers = {};
    root.querySelectorAll('[data-lt-case]').forEach((cb) => { answers[cb.dataset.ltCase] = cb.checked; });
    const r = scoreScenario(answers);
    root.querySelector('[data-lt="result"]').textContent = `${r.correct}/${r.total} — ${r.passed ? t('Відмінно!') : t('Спробуйте ще раз')}`;
  });
}

// --- Project workbench ------------------------------------------------------

function activeProject() {
  const { store } = wb;
  return store.activeId ? store.projects[store.activeId] : null;
}

function persist(nextStore) {
  wb.store = nextStore;
  workbenchStore.save(wb.store);
}

function renderProjectBar(root) {
  const select = root.querySelector('[data-wb="project-select"]');
  const projects = Object.values(wb.store.projects).sort((a, b) => b.createdAt - a.createdAt);
  select.innerHTML = projects.length
    ? projects.map((p) => `<option value="${esc(p.id)}" ${p.id === wb.store.activeId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
    : `<option value="">${esc(t('Немає проєктів'))}</option>`;
}

function renderToolList(root) {
  const list = root.querySelector('[data-wb="tool-list"]');
  list.innerHTML = WORKBENCH_TOOLS.map((tool) => `
    <button type="button" class="lt-tool-btn ${tool.id === wb.activeTool ? 'active' : ''}" data-wb-tool="${tool.id}">
      ${esc(t(tool.name))}
    </button>`).join('');
}

function renderToolForm(root) {
  const tool = WORKBENCH_TOOLS.find((x) => x.id === wb.activeTool);
  root.querySelector('[data-wb="tool-title"]').textContent = t(tool.name);
  root.querySelector('[data-wb="tool-input-label"]').textContent = t(tool.inputLabel);
  const extra = root.querySelector('[data-wb="tool-extra"]');
  const actions = root.querySelector('[data-wb="tool-actions"]');
  if (tool.id === 'url' || tool.id === 'base64') {
    extra.hidden = true;
    actions.innerHTML = `<button type="button" class="btn btn--outline btn--sm" data-wb-run="encode">${esc(t('Кодувати'))}</button>
      <button type="button" class="btn btn--outline btn--sm" data-wb-run="decode">${esc(t('Декодувати'))}</button>`;
  } else if (tool.id === 'regex') {
    extra.hidden = false;
    extra.innerHTML = `<input type="text" data-wb="regex-pattern" placeholder="^[a-z]+$" aria-label="${esc(t('Патерн'))}">
      <input type="text" data-wb="regex-flags" placeholder="gi" aria-label="flags" style="max-width:80px">`;
    actions.innerHTML = `<button type="button" class="btn btn--outline btn--sm" data-wb-run="run">${esc(t('Виконати'))}</button>`;
  } else {
    extra.hidden = true;
    actions.innerHTML = `<button type="button" class="btn btn--outline btn--sm" data-wb-run="run">${esc(t('Виконати'))}</button>`;
  }
  root.querySelector('[data-wb="tool-input"]').value = '';
}

function findingSummary(toolId, result) {
  switch (toolId) {
    case 'ioc': {
      const total = result.ips.length + result.domains.length + result.emails.length + result.urls.length
        + result.hashes.md5.length + result.hashes.sha1.length + result.hashes.sha256.length;
      return t('Знайдено індикаторів: {n}').replace('{n}', total);
    }
    case 'jwt': return t('JWT розкодовано (підпис не перевірявся)');
    case 'headers': return t('Перевірено заголовків: {n}').replace('{n}', result.length);
    case 'regex': return t('Збігів: {n}').replace('{n}', result.count);
    default: return t('Виконано');
  }
}

function renderFindingBody(toolId, result) {
  if (toolId === 'ioc') {
    const rows = [
      ['IP', result.ips], ['Domains', result.domains], ['Emails', result.emails], ['URLs', result.urls],
      ['MD5', result.hashes.md5], ['SHA1', result.hashes.sha1], ['SHA256', result.hashes.sha256],
    ].filter(([, arr]) => arr.length);
    if (!rows.length) return `<p>${esc(t('Нічого не знайдено'))}</p>`;
    return rows.map(([label, arr]) => `<p class="lt-meta"><strong>${esc(label)}:</strong> ${arr.map(esc).join(', ')}</p>`).join('');
  }
  if (toolId === 'jwt') {
    return `<p class="lt-meta"><strong>header:</strong></p><pre class="lab-tool-output">${esc(JSON.stringify(result.header, null, 2))}</pre>
      <p class="lt-meta"><strong>payload:</strong></p><pre class="lab-tool-output">${esc(JSON.stringify(result.payload, null, 2))}</pre>
      <p class="lt-meta">${result.hasSignature ? esc(t('Підпис присутній, але не перевірявся.')) : esc(t('Підпис відсутній.'))}</p>`;
  }
  if (toolId === 'headers') {
    return `<ul class="lab-tool-checklist">${result.map((c) => `
      <li class="${c.ok ? 'is-ok' : 'is-review'}"><span aria-hidden="true">${c.ok ? '✓' : '!'}</span>${esc(t(c.label))}</li>
    `).join('')}</ul>`;
  }
  if (toolId === 'regex') {
    if (!result.matches.length) return `<p>${esc(t('Нічого не знайдено'))}</p>`;
    return `<ul class="lab-tool-checklist">${result.matches.map((m) => `<li>#${m.index}: <code>${esc(m.match)}</code></li>`).join('')}</ul>`;
  }
  return `<pre class="lab-tool-output">${esc(String(result))}</pre>`;
}

function renderFindings(root) {
  const project = activeProject();
  const box = root.querySelector('[data-wb="findings"]');
  if (!project) { box.innerHTML = `<p class="empty-state">${esc(t('Створіть проєкт, щоб почати'))}</p>`; return; }
  if (!project.findings.length) { box.innerHTML = `<p class="empty-state">${esc(t('Поки немає знахідок. Запустіть інструмент зліва.'))}</p>`; return; }
  box.innerHTML = project.findings.map((f) => `
    <article class="lt-finding">
      <div class="lt-finding-head">
        <strong>${esc(t(WORKBENCH_TOOLS.find((x) => x.id === f.toolId)?.name || f.toolId))}</strong>
        <span class="lt-meta">${new Date(f.createdAt).toLocaleString()}</span>
        <button type="button" class="btn btn--outline btn--sm" data-wb-remove="${esc(f.id)}">${esc(t('Видалити'))}</button>
      </div>
      <p class="lt-meta">${esc(f.summary)}</p>
      <div class="lt-finding-body">${f.body}</div>
    </article>`).join('');
}

function renderWorkbench(root) {
  renderProjectBar(root);
  renderToolList(root);
  renderToolForm(root);
  renderFindings(root);
}

async function runTool(root, action) {
  const tool = wb.activeTool;
  const input = root.querySelector('[data-wb="tool-input"]').value;
  const project = activeProject();
  if (!project) { window.alert?.(t('Спочатку створіть або оберіть проєкт')); return; }
  try {
    let summary; let body; let result;
    if (tool === 'url') {
      result = action === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input);
      summary = t('Виконано'); body = `<pre class="lab-tool-output">${esc(result)}</pre>`;
    } else if (tool === 'base64') {
      result = action === 'encode' ? textToBase64(input) : base64ToText(input);
      summary = t('Виконано'); body = `<pre class="lab-tool-output">${esc(result)}</pre>`;
    } else if (tool === 'hash') {
      result = await sha256Hex(input);
      summary = t('Виконано'); body = `<pre class="lab-tool-output">${esc(result)}</pre>`;
    } else if (tool === 'headers') {
      result = analyzeHeaders(input);
      summary = findingSummary(tool, result); body = renderFindingBody(tool, result);
    } else if (tool === 'jwt') {
      result = decodeJwt(input);
      summary = findingSummary(tool, result); body = renderFindingBody(tool, result);
    } else if (tool === 'ioc') {
      result = extractIocs(input);
      summary = findingSummary(tool, result); body = renderFindingBody(tool, result);
    } else if (tool === 'regex') {
      const pattern = root.querySelector('[data-wb="regex-pattern"]').value;
      const flags = root.querySelector('[data-wb="regex-flags"]').value;
      result = testRegex(pattern, flags, input);
      summary = findingSummary(tool, result); body = renderFindingBody(tool, result);
    }
    persist(addFinding(wb.store, project.id, { toolId: tool, input, summary, body }));
    renderFindings(root);
  } catch (err) {
    persist(addFinding(wb.store, project.id, {
      toolId: tool, input, summary: t('Помилка'), body: `<p class="lt-meta">${esc(err.message)}</p>`,
    }));
    renderFindings(root);
  }
}

function initWorkbench(root) {
  wb.store = workbenchStore.load();
  if (!Object.keys(wb.store.projects).length) {
    persist(createProject(wb.store, t('Мій перший проєкт')));
  }
  renderWorkbench(root);

  root.querySelector('[data-wb="new-project"]').addEventListener('click', () => {
    const name = window.prompt?.(t('Назва проєкту'), t('Новий проєкт'));
    if (name === null) return;
    persist(createProject(wb.store, name || t('Новий проєкт')));
    renderWorkbench(root);
  });
  root.querySelector('[data-wb="rename-project"]').addEventListener('click', () => {
    const project = activeProject();
    if (!project) return;
    const name = window.prompt?.(t('Нова назва'), project.name);
    if (!name) return;
    persist(renameProject(wb.store, project.id, name));
    renderWorkbench(root);
  });
  root.querySelector('[data-wb="delete-project"]').addEventListener('click', () => {
    const project = activeProject();
    if (!project) return;
    if (!window.confirm?.(t('Видалити проєкт разом із усіма знахідками?'))) return;
    persist(deleteProject(wb.store, project.id));
    renderWorkbench(root);
  });
  root.querySelector('[data-wb="export-project"]').addEventListener('click', () => {
    const project = activeProject();
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${project.name.replace(/[^a-z0-9а-яіїє_-]+/gi, '_') || 'project'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  root.querySelector('[data-wb="project-select"]').addEventListener('change', (e) => {
    wb.store = { ...wb.store, activeId: e.target.value || null };
    persist(wb.store);
    renderFindings(root);
  });
  root.querySelector('[data-wb="tool-list"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wb-tool]');
    if (!btn) return;
    wb.activeTool = btn.dataset.wbTool;
    renderToolList(root);
    renderToolForm(root);
  });
  root.querySelector('[data-wb="tool-form"]').addEventListener('submit', (e) => e.preventDefault());
  root.querySelector('[data-wb="tool-actions"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wb-run]');
    if (!btn) return;
    runTool(root, btn.dataset.wbRun);
  });
  root.querySelector('[data-wb="findings"]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wb-remove]');
    if (!btn) return;
    const project = activeProject();
    if (!project) return;
    persist(removeFinding(wb.store, project.id, btn.dataset.wbRemove));
    renderFindings(root);
  });
}

export function initLabTools() {
  const panel = document.getElementById('lab-panel-tools');
  if (!panel || panel.dataset.ready) return;
  panel.dataset.ready = '1';
  initWorkbench(document.getElementById('lab-tools-lab'));
  initReference(panel);
}
