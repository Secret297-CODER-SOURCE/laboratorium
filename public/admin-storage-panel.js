import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm } from '/dialog.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function renderStoragePanel(data = {}) {
  const { servers = [], assets = [] } = data;
  const serverOpts = servers.map(s =>
    `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  return `<section class="admin-panel admin-panel--wide storage-panel">
    <div class="admin-panel-head">
      <h2>${icon('server', 'ico ico--md')}Сховище даних</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn--outline btn--sm" id="storage-sync-btn">${icon('upload', 'ico ico--sm')}Оновити індекс</button>
        <button type="button" class="btn btn--outline btn--sm" id="storage-add-toggle">${icon('plus', 'ico ico--sm')}Додати сервер</button>
      </div>
    </div>

    <div id="storage-create-form" class="admin-inline-form storage-create-form" hidden>
      <input class="admin-inp" id="storage-name" placeholder="Назва (NAS Kyiv)">
      <input class="admin-inp" id="storage-path" placeholder="Шлях (/mnt/nas1 або ./data/uploads2)">
      <input class="admin-inp" id="storage-notes" placeholder="Примітки">
      <label class="admin-check"><input type="checkbox" id="storage-default"> Сервер за замовчуванням</label>
      <button type="button" class="btn btn--primary btn--sm" id="storage-create-btn">Створити</button>
    </div>

    <div class="storage-servers-grid">
      ${servers.length ? servers.map(s => `
        <article class="storage-server-card${s.is_default ? ' storage-server-card--default' : ''}">
          <div class="storage-server-head">
            <strong>${esc(s.name)}</strong>
            ${s.is_default ? '<span class="sched-badge">default</span>' : ''}
            ${!s.is_active ? '<span class="sched-badge">off</span>' : ''}
          </div>
          <code class="storage-path">${esc(s.root_path)}</code>
          <div class="storage-server-stats">
            <span>${s.asset_count} файлів</span>
            <span>${esc(s.total_size_label)}</span>
            <span class="ico-inline">${icon('video', 'ico ico--sm')}${s.recordings_count}</span>
            <span class="ico-inline">${icon('chat', 'ico ico--sm')}${s.chat_count}</span>
          </div>
          ${s.notes ? `<p class="storage-notes">${esc(s.notes)}</p>` : ''}
          ${!s.is_default ? `<button type="button" class="btn btn--ghost btn--sm storage-del" data-id="${s.id}">${icon('trash', 'ico ico--sm')}</button>` : ''}
        </article>`).join('') : '<p class="empty-state">Немає серверів сховища</p>'}
    </div>

    <div class="storage-move-bar">
      <h3>Перемістити файли</h3>
      <div class="storage-move-controls">
        <select class="admin-inp" id="storage-filter-server">
          <option value="">Усі сервери</option>
          ${serverOpts}
        </select>
        <select class="admin-inp" id="storage-filter-type">
          <option value="">Усі типи</option>
          <option value="recording">Записи</option>
          <option value="chat">Чат</option>
        </select>
        <select class="admin-inp" id="storage-move-target" required>
          <option value="">Цільовий сервер</option>
          ${serverOpts}
        </select>
        <button type="button" class="btn btn--primary btn--sm" id="storage-move-btn">Перемістити обрані</button>
      </div>
    </div>

    <div class="stats-table-wrap">
      <table class="stats-table storage-assets-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="storage-select-all"></th>
            <th>Тип</th>
            <th>Назва</th>
            <th>Сервер</th>
            <th>Файл</th>
            <th>Розмір</th>
          </tr>
        </thead>
        <tbody id="storage-assets-body">
          ${assets.length ? assets.map(a => `
            <tr>
              <td><input type="checkbox" class="storage-asset-cb" value="${a.id}"></td>
              <td>${esc(a.type_label)}</td>
              <td>${esc(a.label || '—')}</td>
              <td>${esc(a.server_name)}</td>
              <td><code>${esc(a.filename)}</code></td>
              <td>${esc(a.size_label)}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="empty-state">Файлів поки немає</td></tr>'}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function bindStoragePanelEvents(showToast, reload) {
  document.getElementById('storage-add-toggle')?.addEventListener('click', () => {
    const f = document.getElementById('storage-create-form');
    if (f) f.hidden = !f.hidden;
  });

  document.getElementById('storage-create-btn')?.addEventListener('click', async () => {
    try {
      await api('/admin/storage/servers', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('storage-name').value,
          root_path: document.getElementById('storage-path').value,
          notes: document.getElementById('storage-notes').value,
          is_default: document.getElementById('storage-default').checked,
        }),
      });
      showToast('Сервер додано');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.storage-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити сервер? (лише якщо порожній)', { danger: true }))) return;
      try {
        await api(`/admin/storage/servers/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.getElementById('storage-sync-btn')?.addEventListener('click', async () => {
    try {
      const res = await api('/admin/storage/sync', { method: 'POST' });
      showToast(res.message || 'Оновлено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('storage-select-all')?.addEventListener('change', (e) => {
    document.querySelectorAll('.storage-asset-cb').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });

  document.getElementById('storage-move-btn')?.addEventListener('click', async () => {
    const targetId = document.getElementById('storage-move-target').value;
    const ids = [...document.querySelectorAll('.storage-asset-cb:checked')].map(cb => parseInt(cb.value, 10));
    if (!targetId) return showToast('Оберіть цільовий сервер', 'error');
    if (!ids.length) return showToast('Оберіть файли', 'error');
    try {
      const res = await api('/admin/storage/move', {
        method: 'POST',
        body: JSON.stringify({ asset_ids: ids, target_server_id: parseInt(targetId, 10) }),
      });
      showToast(res.message || 'Переміщено');
      if (res.errors?.length) showToast(`Помилок: ${res.errors.length}`, 'error');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  const reloadAssets = async () => {
    const serverId = document.getElementById('storage-filter-server')?.value;
    const type = document.getElementById('storage-filter-type')?.value;
    const qs = new URLSearchParams();
    if (serverId) qs.set('server_id', serverId);
    if (type) qs.set('type', type);
    const { assets } = await api(`/admin/storage/assets?${qs}`);
    const body = document.getElementById('storage-assets-body');
    if (!body) return;
    body.innerHTML = assets.length ? assets.map(a => `
      <tr>
        <td><input type="checkbox" class="storage-asset-cb" value="${a.id}"></td>
        <td>${esc(a.type_label)}</td>
        <td>${esc(a.label || '—')}</td>
        <td>${esc(a.server_name)}</td>
        <td><code>${esc(a.filename)}</code></td>
        <td>${esc(a.size_label)}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty-state">Немає файлів</td></tr>';
  };

  document.getElementById('storage-filter-server')?.addEventListener('change', () => {
    reloadAssets().catch(err => showToast(err.message, 'error'));
  });
  document.getElementById('storage-filter-type')?.addEventListener('change', () => {
    reloadAssets().catch(err => showToast(err.message, 'error'));
  });
}

export async function loadStorageAdminData() {
  return api('/admin/storage');
}
