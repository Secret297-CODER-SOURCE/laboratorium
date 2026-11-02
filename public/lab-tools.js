import { t, getLocale } from '/i18n.js';
import {
  CATEGORIES, DIFFICULTIES, TOOLS, PATHS, SCENARIO, filterTools, pathProgress, scoreScenario,
} from '/lab-tools-catalog.js';

const STORE = 'lab_tools_progress_v1';
const DIFF = { beginner: 'Початковий', intermediate: 'Середній', advanced: 'Просунутий' };
const state = { query: '', category: 'all', difficulty: 'all' };

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

function esc(value) {
  const el = document.createElement('span');
  el.textContent = String(value);
  return el.innerHTML;
}

const L = () => (getLocale() === 'en' ? 'en' : 'uk');

function renderCatalog(root) {
  const loc = L();
  const progress = load();
  const tools = filterTools(TOOLS, { ...state, locale: loc });
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

export function initLabTools() {
  const root = document.getElementById('lab-tools-lab');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';

  root.querySelector('[data-lt="category"]').innerHTML = `<option value="all">${esc(t('Усі категорії'))}</option>`
    + CATEGORIES.map((c) => `<option value="${c.id}">${esc(t(c[L()]))}</option>`).join('');
  root.querySelector('[data-lt="difficulty"]').innerHTML = `<option value="all">${esc(t('Будь-яка складність'))}</option>`
    + DIFFICULTIES.map((d) => `<option value="${d}">${esc(t(DIFF[d]))}</option>`).join('');

  renderCatalog(root);
  renderScenario(root);

  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-lt="search"]')) state.query = e.target.value;
    else return;
    renderCatalog(root);
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-lt="category"]')) { state.category = el.value; renderCatalog(root); }
    else if (el.matches('[data-lt="difficulty"]')) { state.difficulty = el.value; renderCatalog(root); }
    else if (el.dataset.ltDone) {
      const data = load();
      data.done = { ...data.done, [el.dataset.ltDone]: el.checked };
      save(data);
      renderCatalog(root);
    }
  });
  root.addEventListener('click', (e) => {
    if (!e.target.matches('[data-lt="check"]')) return;
    const answers = {};
    root.querySelectorAll('[data-lt-case]').forEach((cb) => { answers[cb.dataset.ltCase] = cb.checked; });
    const r = scoreScenario(answers);
    const data = load();
    data.scenario = { best: Math.max(data.scenario?.best || 0, r.correct), passed: Boolean(data.scenario?.passed || r.passed) };
    save(data);
    root.querySelector('[data-lt="result"]').textContent = `${r.correct}/${r.total} — ${r.passed ? t('Відмінно!') : t('Спробуйте ще раз')}`;
  });
}
