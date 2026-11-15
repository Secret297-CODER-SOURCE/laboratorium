import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm } from '/dialog.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS_LABEL = { todo: 'Зробити', doing: 'В роботі', done: 'Готово' };
const PRIORITY_LABEL = { low: 'Низький', normal: 'Звичайний', high: 'Високий' };

export async function loadPlannerData(status = '') {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return api(`/admin/planner${q}`);
}

export function renderPlannerPanel(data = {}) {
  const items = data.items || [];
  const open = items.filter((i) => i.status !== 'done').length;
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <div>
        <h2>${icon('notes', 'ico ico--md')}Планер задач</h2>
        <p class="crm-panel-sub">Особисті задачі школи: дзвінки, ДЗ, оплати, follow-up по заявках.</p>
      </div>
      <span class="sched-badge">${open} відкритих</span>
    </div>
    <form class="admin-inline-form planner-create" id="planner-create">
      <input class="admin-inp" name="title" placeholder="Що зробити?" required maxlength="200">
      <input class="admin-inp" name="body" placeholder="Деталі (необов'язково)" maxlength="2000">
      <input class="admin-inp" name="due_at" type="date">
      <select class="admin-inp" name="priority">
        <option value="normal">Пріоритет: звичайний</option>
        <option value="high">Високий</option>
        <option value="low">Низький</option>
      </select>
      <button type="submit" class="btn btn--primary btn--sm">${icon('plus', 'ico ico--sm')}Додати</button>
    </form>
    <div class="planner-filters">
      <button type="button" class="btn btn--ghost btn--sm planner-filter active" data-status="">Усі</button>
      <button type="button" class="btn btn--ghost btn--sm planner-filter" data-status="todo">Зробити</button>
      <button type="button" class="btn btn--ghost btn--sm planner-filter" data-status="doing">В роботі</button>
      <button type="button" class="btn btn--ghost btn--sm planner-filter" data-status="done">Готово</button>
    </div>
    <div class="admin-list planner-list">
      ${items.length ? items.map((item) => `
        <article class="admin-list-item planner-item" data-id="${item.id}">
          <div>
            <strong>${esc(item.title)}</strong>
            <div class="homework-history-meta">
              <span class="crm-pill">${esc(STATUS_LABEL[item.status] || item.status)}</span>
              <span class="crm-pill">${esc(PRIORITY_LABEL[item.priority] || item.priority)}</span>
              ${item.due_at ? `<span>до ${esc(String(item.due_at).slice(0, 10))}</span>` : ''}
            </div>
            ${item.body ? `<p class="homework-history-note">${esc(item.body)}</p>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${item.status !== 'doing' ? `<button type="button" class="btn btn--outline btn--sm planner-status" data-id="${item.id}" data-status="doing">В роботу</button>` : ''}
            ${item.status !== 'done' ? `<button type="button" class="btn btn--primary btn--sm planner-status" data-id="${item.id}" data-status="done">${icon('check', 'ico ico--sm')}</button>` : ''}
            ${item.status === 'done' ? `<button type="button" class="btn btn--ghost btn--sm planner-status" data-id="${item.id}" data-status="todo">Повернути</button>` : ''}
            <button type="button" class="btn btn--ghost btn--sm planner-del" data-id="${item.id}">${icon('trash', 'ico ico--sm')}</button>
          </div>
        </article>`).join('') : '<p class="empty-state">Додайте першу задачу в планер</p>'}
    </div>
  </section>`;
}

export function bindPlannerPanelEvents(showToast, reload) {
  document.getElementById('planner-create')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/planner', {
        method: 'POST',
        body: JSON.stringify({
          title: fd.get('title'),
          body: fd.get('body'),
          due_at: fd.get('due_at') || null,
          priority: fd.get('priority'),
        }),
      });
      showToast('Задачу додано');
      reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.querySelectorAll('.planner-filter').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const data = await loadPlannerData(btn.dataset.status || '');
        const workspace = document.querySelector('.admin-workspace');
        if (!workspace) return reload();
        workspace.innerHTML = renderPlannerPanel(data);
        bindPlannerPanelEvents(showToast, reload);
        document.querySelectorAll('.planner-filter').forEach((b) => {
          b.classList.toggle('active', b.dataset.status === (btn.dataset.status || ''));
        });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('.planner-status').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/admin/planner/${btn.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: btn.dataset.status }),
        });
        reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('.planner-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити задачу?'))) return;
      try {
        await api(`/admin/planner/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Видалено');
        reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}
