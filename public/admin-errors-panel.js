import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm } from '/dialog.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export async function loadErrorsData(source = '') {
  try {
    const qs = source ? `?source=${source}` : '';
    const data = await api(`/admin/errors${qs}`);
    return { errors: data.errors || [] };
  } catch {
    return { errors: [] };
  }
}

export function renderErrorsPanel({ errors } = {}, source = '') {
  const list = errors || [];
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('warning', 'ico ico--md')}Помилки сайту</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="admin-inp" id="errors-source-filter" style="width:auto;min-width:140px">
          <option value=""${!source ? ' selected' : ''}>Усі джерела</option>
          <option value="server"${source === 'server' ? ' selected' : ''}>Сервер</option>
          <option value="client"${source === 'client' ? ' selected' : ''}>Браузер</option>
        </select>
        <button type="button" class="btn btn--outline btn--sm" id="errors-clear-btn">${icon('trash', 'ico ico--sm')}Очистити</button>
      </div>
    </div>
    <p class="empty-state" style="padding:0 0 12px;text-align:left">
      Тут — тільки неочікувані помилки (збої сервера, необроблені винятки, JS-помилки в браузері). Звичайні відповіді на кшталт «404» чи «невірний пароль» сюди не потрапляють.
    </p>
    ${list.length ? `<table class="admin-table">
      <thead><tr><th>Час</th><th>Джерело</th><th>Код</th><th>Повідомлення</th><th>Шлях</th><th></th></tr></thead>
      <tbody>${list.map((e) => `
        <tr>
          <td style="white-space:nowrap;font-size:0.75rem;color:var(--text-muted)">${fmtDate(e.created_at)}</td>
          <td><span class="status-pill ${e.source === 'server' ? 'error' : 'pending'}">${e.source === 'server' ? 'Сервер' : 'Браузер'}</span></td>
          <td>${e.status_code || '—'}</td>
          <td>${esc(e.message)}</td>
          <td style="font-size:0.75rem;color:var(--text-muted)">${esc(e.method ? `${e.method} ${e.path || ''}` : (e.path || '—'))}</td>
          <td>${e.stack ? `<button type="button" class="btn btn--ghost btn--sm error-toggle-stack" data-id="${e.id}">${icon('code', 'ico ico--sm')}</button>` : ''}</td>
        </tr>
        ${e.stack ? `<tr class="error-stack-row" id="error-stack-${e.id}" hidden><td colspan="6"><pre style="white-space:pre-wrap;font-size:0.75rem;color:var(--text-dim);margin:0;padding:8px 0">${esc(e.stack)}</pre></td></tr>` : ''}
      `).join('')}
      </tbody>
    </table>` : '<p class="empty-state">Помилок ще не було</p>'}
  </section>`;
}

let errorsEventsBound = false;

export function bindErrorsPanelEvents(showToast, reload) {
  if (errorsEventsBound) return;
  errorsEventsBound = true;

  document.addEventListener('change', (e) => {
    if (e.target?.id !== 'errors-source-filter') return;
    reload(e.target.value);
  });

  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.error-toggle-stack');
    if (toggleBtn) {
      const row = document.getElementById(`error-stack-${toggleBtn.dataset.id}`);
      if (row) row.hidden = !row.hidden;
      return;
    }

    if (e.target.closest('#errors-clear-btn')) {
      (async () => {
        if (!(await showConfirm('Очистити весь журнал помилок? Дію не можна скасувати.', { danger: true }))) return;
        try {
          await api('/admin/errors', { method: 'DELETE' });
          showToast('Журнал очищено');
          reload();
        } catch (err) { showToast(err.message, 'error'); }
      })();
    }
  });
}
