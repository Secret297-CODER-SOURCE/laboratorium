import {
  api, requireAuthAsync, handleSessionError, initTheme,
} from '/auth.js';
import { icon } from '/icons.js';
import { initSiteHeader } from '/site-header.js';
import { showForm } from '/dialog.js';

if (!(await requireAuthAsync())) throw new Error('auth');

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

function renderManuals(manuals, activeDirection) {
  const list = document.getElementById('manuals-list');
  const filtered = activeDirection ? manuals.filter(m => String(m.direction_id || '') === activeDirection) : manuals;

  if (!manuals.length) {
    list.innerHTML = '<p class="empty-state">Мануалів поки немає</p>';
    return;
  }
  if (!filtered.length) {
    list.innerHTML = '<p class="empty-state">Немає мануалів у цьому напрямку</p>';
    return;
  }

  list.innerHTML = filtered.map(m => `
    <a href="/manual.html?slug=${encodeURIComponent(m.slug)}" class="group-content-card">
      <span class="group-content-name">${esc(m.title)}${m.direction_name ? `<br><span style="font-size:0.72rem;color:var(--text-dim);font-weight:400">${esc(m.direction_name)}</span>` : ''}</span>
      <span class="group-content-arrow">${icon('chevron-right', 'ico ico--sm')}</span>
    </a>`).join('');
}

function renderFilters(manuals) {
  const wrap = document.getElementById('manuals-filters');
  const seen = new Map();
  manuals.forEach(m => { if (m.direction_id) seen.set(String(m.direction_id), m.direction_name); });
  if (!seen.size) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = `
    <button type="button" class="btn btn--outline btn--sm manual-filter active" data-dir="">Усі</button>
    ${[...seen].map(([id, name]) => `<button type="button" class="btn btn--outline btn--sm manual-filter" data-dir="${id}">${esc(name)}</button>`).join('')}
  `;
  wrap.querySelectorAll('.manual-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.manual-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderManuals(manuals, btn.dataset.dir);
    });
  });
}

function renderMine(mine) {
  const section = document.getElementById('my-manuals-section');
  const list = document.getElementById('my-manuals-list');
  const drafts = mine.filter(m => !m.is_published);
  if (!drafts.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  list.innerHTML = drafts.map(m => `
    <a href="/content-builder.html?type=manual&id=${m.id}" class="group-content-card">
      <span class="group-content-name">${esc(m.title)}<br><span style="font-size:0.72rem;color:var(--text-dim);font-weight:400">${STATUS_LABELS[m.review_status] || 'Чернетка'}</span></span>
      <span class="group-content-arrow">${icon('edit', 'ico ico--sm')}</span>
    </a>`).join('');
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
      options: [{ value: '', label: '— не вибрано —' }, ...directions.map(d => ({ value: String(d.id), label: d.name }))],
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
  renderFilters(manuals);
  renderManuals(manuals, '');
  renderMine(mineRes.manuals || []);
}

document.getElementById('create-manual-btn')?.addEventListener('click', createManual);

load().catch(handleSessionError);
