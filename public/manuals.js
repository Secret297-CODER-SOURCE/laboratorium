import {
  api, requireUnrestrictedAsync, handleSessionError, initTheme,
} from '/auth.js';
import { icon } from '/icons.js';
import { initSiteHeader } from '/site-header.js';
import { showForm } from '/dialog.js';

if (!(await requireUnrestrictedAsync())) throw new Error('auth');

initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast--${type}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

const STATUS_LABELS = {
  draft: 'Чернетка',
  submitted: 'На перевірці',
};

let allManuals = [];
let activeDirection = '';
let searchTimer = null;
let searchSeq = 0;

function renderManuals(manuals) {
  const list = document.getElementById('manuals-list');
  const filtered = activeDirection
    ? manuals.filter((m) => String(m.direction_id || '') === activeDirection)
    : manuals;

  if (!manuals.length) {
    list.innerHTML = '<p class="empty-state">Мануалів школи поки немає</p>';
    return;
  }
  if (!filtered.length) {
    list.innerHTML = '<p class="empty-state">Нічого не знайдено</p>';
    return;
  }

  list.innerHTML = filtered.map((m) => `
    <a href="/manual.html?slug=${encodeURIComponent(m.slug)}" class="group-content-card">
      <span class="group-content-name">${esc(m.title)}${m.direction_name ? `<br><span style="font-size:0.72rem;color:var(--text-dim);font-weight:400">${esc(m.direction_name)}</span>` : ''}</span>
      <span class="group-content-arrow">${icon('chevron-right', 'ico ico--sm')}</span>
    </a>`).join('');
}

function renderFilters(manuals) {
  const wrap = document.getElementById('manuals-filters');
  const seen = new Map();
  manuals.forEach((m) => {
    if (m.direction_id) seen.set(String(m.direction_id), m.direction_name);
  });
  if (!seen.size) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = `
    <button type="button" class="btn btn--outline btn--sm manual-filter ${activeDirection === '' ? 'active' : ''}" data-dir="">Усі</button>
    ${[...seen].map(([id, name]) => `<button type="button" class="btn btn--outline btn--sm manual-filter ${activeDirection === id ? 'active' : ''}" data-dir="${id}">${esc(name)}</button>`).join('')}
  `;
  wrap.querySelectorAll('.manual-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeDirection = btn.dataset.dir || '';
      wrap.querySelectorAll('.manual-filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const q = document.getElementById('manuals-search-input')?.value.trim() || '';
      if (q.length >= 2) runSearch(q);
      else renderManuals(allManuals);
    });
  });
}

function renderMine(mine) {
  const section = document.getElementById('my-manuals-section');
  const list = document.getElementById('my-manuals-list');
  const drafts = mine.filter((m) => !m.is_published);
  if (!drafts.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  list.innerHTML = drafts.map((m) => `
    <a href="/content-builder.html?type=manual&id=${m.id}" class="group-content-card">
      <span class="group-content-name">${esc(m.title)}<br><span style="font-size:0.72rem;color:var(--text-dim);font-weight:400">${STATUS_LABELS[m.review_status] || 'Чернетка'}</span></span>
      <span class="group-content-arrow">${icon('edit', 'ico ico--sm')}</span>
    </a>`).join('');
}

function renderCatalog(payload) {
  const list = document.getElementById('catalog-list');
  const sub = document.getElementById('catalog-sub');
  if (!list) return;

  const items = payload?.external || [];
  const query = payload?.query || '';

  if (sub) {
    if (payload?.error && !items.length) sub.textContent = 'Каталог тимчасово недоступний';
    else if (query) sub.textContent = `Результати за запитом «${query}»`;
    else sub.textContent = 'Підбірка гайдів і туторіалів';
  }

  if (!items.length) {
    list.innerHTML = query
      ? '<p class="empty-state">Нічого не знайдено</p>'
      : `<p class="empty-state">${esc(payload?.error || 'Поки немає карток')}</p>`;
    return;
  }

  list.innerHTML = items.map((r) => {
    const thumb = r.image
      ? `<img class="spy-soft-card__img" src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="spy-soft-card__img spy-soft-card__img--empty" aria-hidden="true">${icon('book', 'ico')}</div>`;
    const tags = (r.tags || []).slice(0, 2);
    return `
      <a class="spy-soft-card" href="${esc(r.href)}">
        ${thumb}
        <div class="spy-soft-card__body">
          <h3 class="spy-soft-card__title">${esc(r.title)}</h3>
          ${r.excerpt ? `<p class="spy-soft-card__excerpt">${esc(r.excerpt)}</p>` : ''}
          ${tags.length ? `<p class="spy-soft-card__meta">${esc(tags.join(' · '))}</p>` : ''}
        </div>
      </a>`;
  }).join('');
}

function setHint(text, show) {
  const hint = document.getElementById('manuals-search-hint');
  if (!hint) return;
  hint.hidden = !show;
  hint.textContent = text || '';
}

async function runSearch(query) {
  const seq = ++searchSeq;
  setHint('Шукаємо…', true);
  try {
    const payload = await api(`/manuals/search?q=${encodeURIComponent(query)}`);
    if (seq !== searchSeq) return;
    renderManuals(payload.manuals || []);
    renderCatalog(payload);
    const nLocal = (payload.manuals || []).length;
    const nExt = (payload.external || []).length;
    setHint(query ? `Знайдено: ${nLocal + nExt}` : '', Boolean(query));
  } catch (err) {
    if (seq !== searchSeq) return;
    setHint(err.message || 'Помилка пошуку', true);
    showToast(err.message || 'Помилка пошуку', 'error');
  }
}

function scheduleSearch(raw) {
  clearTimeout(searchTimer);
  const q = String(raw || '').trim();
  if (q.length < 2) {
    searchSeq += 1;
    setHint('', false);
    renderManuals(allManuals);
    runSearch('');
    return;
  }
  searchTimer = setTimeout(() => runSearch(q), 280);
}

async function createManual() {
  let directions = [];
  try {
    ({ directions } = await api('/directions'));
  } catch { /* optional */ }

  const result = await showForm('Новий мануал', [
    { id: 'title', label: 'Назва', type: 'text', placeholder: 'Наприклад: Налаштування VPN' },
    {
      id: 'direction_id',
      label: 'Напрямок (необов\'язково)',
      type: 'select',
      options: [{ value: '', label: '— не вибрано —' }, ...directions.map((d) => ({ value: String(d.id), label: d.name }))],
    },
  ]);
  if (!result?.title?.trim()) return;

  try {
    const res = await api('/manuals', { method: 'POST', body: JSON.stringify(result) });
    showToast(res.message);
    location.href = `/content-builder.html?type=manual&id=${res.manual.id}`;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function load() {
  const [{ manuals }, mineRes] = await Promise.all([
    api('/manuals'),
    api('/manuals/mine').catch(() => ({ manuals: [] })),
  ]);
  allManuals = manuals || [];
  renderFilters(allManuals);
  renderManuals(allManuals);
  renderMine(mineRes.manuals || []);
  await runSearch('');
}

document.getElementById('create-manual-btn')?.addEventListener('click', createManual);
document.getElementById('manuals-search-input')?.addEventListener('input', (e) => {
  scheduleSearch(e.target.value);
});

load().catch(handleSessionError);
