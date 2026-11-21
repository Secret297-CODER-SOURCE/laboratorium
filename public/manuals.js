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
    list.innerHTML = '<p class="empty-state">Мануалів поки немає</p>';
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

function renderExternalSource({
  listId, subId, openId, payloadKey, label, emptyLabel, badgeClass = '',
}, payload) {
  const list = document.getElementById(listId);
  const sub = document.getElementById(subId);
  const open = document.getElementById(openId);
  if (!list) return;

  const block = payload?.[payloadKey] || {};
  const results = block.results || [];
  const query = payload?.query || '';

  if (open && block.source_url) open.href = block.source_url;
  if (sub) {
    if (block.error) sub.textContent = `Не вдалося завантажити ${label} — спробуйте пізніше`;
    else if (query) sub.textContent = `Результати пошуку «${query}» на ${label}`;
    else sub.textContent = emptyLabel;
  }

  if (block.error && !results.length) {
    list.innerHTML = `<p class="empty-state">${esc(block.error)}</p>`;
    return;
  }
  if (!results.length) {
    list.innerHTML = query
      ? `<p class="empty-state">На ${esc(label)} нічого не знайдено</p>`
      : '<p class="empty-state">Поки немає карток</p>';
    return;
  }

  list.innerHTML = results.map((r) => {
    const thumb = r.image
      ? `<img class="spy-soft-card__img" src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="spy-soft-card__img spy-soft-card__img--empty" aria-hidden="true">${icon('book', 'ico')}</div>`;
    const meta = [
      ...(r.authors || []).slice(0, 1),
      ...(r.tags || []).slice(0, 2),
    ].filter(Boolean);
    return `
      <a class="spy-soft-card ${badgeClass}" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">
        ${thumb}
        <div class="spy-soft-card__body">
          <span class="spy-soft-card__badge">${esc(r.source_label || label)}</span>
          <h3 class="spy-soft-card__title">${esc(r.title)}</h3>
          ${r.excerpt ? `<p class="spy-soft-card__excerpt">${esc(r.excerpt)}</p>` : ''}
          ${meta.length ? `<p class="spy-soft-card__meta">${esc(meta.join(' · '))}</p>` : ''}
          <span class="spy-soft-card__cta">Читати на сайті ${icon('link', 'ico ico--sm')}</span>
        </div>
      </a>`;
  }).join('');
}

function renderExternal(payload) {
  renderExternalSource({
    listId: 'spy-soft-list',
    subId: 'spy-soft-sub',
    openId: 'spy-soft-open',
    payloadKey: 'spySoft',
    label: 'spy-soft.net',
    emptyLabel: 'Свіжі мануали та гайди з зовнішнього каталогу',
  }, payload);
  renderExternalSource({
    listId: 'digitalocean-list',
    subId: 'digitalocean-sub',
    openId: 'digitalocean-open',
    payloadKey: 'digitalOcean',
    label: 'DigitalOcean',
    emptyLabel: 'Свіжі Community tutorials',
    badgeClass: 'spy-soft-card--do',
  }, payload);
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
    renderExternal(payload);
    const nLocal = (payload.manuals || []).length;
    const nSpy = (payload.spySoft?.results || []).length;
    const nDo = (payload.digitalOcean?.results || []).length;
    setHint(query
      ? `Знайдено: ${nLocal} локально · ${nSpy} spy-soft · ${nDo} DigitalOcean`
      : '', Boolean(query));
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
