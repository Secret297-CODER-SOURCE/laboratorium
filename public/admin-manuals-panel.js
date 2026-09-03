import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm, showPrompt } from '/dialog.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export async function loadManualsAdminData() {
  const [{ manuals }, { directions }] = await Promise.all([
    api('/admin/manuals'),
    api('/admin/directions'),
  ]);
  return { manuals, directions };
}

function statusPill(m) {
  if (m.is_published) return `<span class="status-pill running">Опубліковано</span>`;
  if (m.review_status === 'submitted') return `<span class="status-pill pending">На перевірці</span>`;
  return `<span class="status-pill none">Чернетка</span>`;
}

function directionOptions(directions, selectedId) {
  return '<option value="">—</option>' + (directions || []).map(d => `
    <option value="${d.id}" ${String(d.id) === String(selectedId || '') ? 'selected' : ''}>${esc(d.name)}${d.is_active ? '' : ' (неактивний)'}</option>`).join('');
}

export function renderManualsPanel({ manuals, directions } = {}) {
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('notes', 'ico ico--md')}Мануали</h2>
      <button type="button" class="btn btn--outline btn--sm" id="add-manual-btn">${icon('plus', 'ico ico--sm')}Додати</button>
    </div>
    <p class="empty-state" style="padding:0 0 12px;text-align:left">
      Мануали може створювати будь-хто (учні також) — чернетки з'являються тут для перевірки. Опублікувати може лише викладач/адмін.
    </p>
    <table class="admin-table">
      <thead><tr><th>Назва</th><th>Slug</th><th>Напрямок</th><th>Автор</th><th>Порядок</th><th>Статус</th><th></th></tr></thead>
      <tbody>${(manuals || []).map(m => `
        <tr data-manual-id="${m.id}">
          <td><input class="admin-inp" data-field="title" value="${esc(m.title)}"></td>
          <td><input class="admin-inp admin-inp--sm" data-field="slug" value="${esc(m.slug)}"></td>
          <td><select class="admin-inp admin-inp--sm" data-field="direction_id">${directionOptions(directions, m.direction_id)}</select></td>
          <td style="font-size:0.75rem;color:var(--text-muted)">${esc(m.author_name || m.author_handle || '—')}</td>
          <td><input class="admin-inp admin-inp--xs" type="number" data-field="sort_order" value="${m.sort_order}"></td>
          <td>${statusPill(m)}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <a href="/content-builder.html?type=manual&id=${m.id}" class="btn btn--outline btn--sm" title="Конструктор">${icon('edit', 'ico ico--sm')}</a>
              <a href="/manual.html?slug=${encodeURIComponent(m.slug)}" target="_blank" rel="noopener" class="btn btn--outline btn--sm" title="Переглянути">${icon('link', 'ico ico--sm')}</a>
              <button type="button" class="btn btn--ghost btn--sm manual-save" data-id="${m.id}" title="Зберегти">${icon('check', 'ico ico--sm')}</button>
              ${!m.is_published && m.review_status === 'submitted' ? `<button type="button" class="btn btn--ghost btn--sm manual-return" data-id="${m.id}" title="Повернути на доопрацювання">${icon('loader', 'ico ico--sm')}</button>` : ''}
              <button type="button" class="btn btn--ghost btn--sm manual-del" data-id="${m.id}" title="Видалити">${icon('trash', 'ico ico--sm')}</button>
            </div>
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="empty-state">Мануалів ще немає</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

function rowData(row) {
  const data = {};
  row.querySelectorAll('[data-field]').forEach(inp => {
    data[inp.dataset.field] = inp.type === 'checkbox' ? inp.checked : inp.value;
  });
  if ('direction_id' in data) data.direction_id = data.direction_id || null;
  return data;
}

export function bindManualsPanelEvents(showToast, reload) {
  document.getElementById('add-manual-btn')?.addEventListener('click', async () => {
    const title = await showPrompt('Назва мануала:');
    if (!title?.trim()) return;
    try {
      await api('/admin/manuals', { method: 'POST', body: JSON.stringify({ title: title.trim() }) });
      showToast('Мануал додано');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.manual-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      try {
        await api(`/admin/manuals/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify(rowData(row)) });
        showToast('Збережено');
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.manual-return').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api(`/admin/manuals/${btn.dataset.id}/return`, { method: 'POST' });
        showToast(res.message);
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.manual-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити мануал? Весь вміст сторінки буде втрачено.', { danger: true }))) return;
      try {
        await api(`/admin/manuals/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}
