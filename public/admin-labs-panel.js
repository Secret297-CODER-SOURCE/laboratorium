import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm, showPrompt } from '/dialog.js';

const STATUS_LABELS = {
  running: 'Працює',
  provisioning: 'Створюється',
  deploying: 'Створюється',
  stopped: 'Зупинено',
  error: 'Помилка',
  none: 'Немає',
  pending: 'Очікує',
};

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('uk-UA');
}

function vmStatusCell(vm) {
  const status = vm?.status || 'none';
  const label = STATUS_LABELS[status] || status;
  const detail = [];
  if (vm?.ip) detail.push(vm.ip);
  if (vm?.proxmox_vmid) detail.push(`vmid ${vm.proxmox_vmid}`);
  return `
    <span class="status-pill ${status}">${esc(label)}</span>
    ${detail.length ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">${esc(detail.join(' · '))}</div>` : ''}
    ${vm?.error_message ? `<div style="font-size:0.72rem;color:#ff6b7a;margin-top:4px" title="${esc(vm.error_message)}">${esc(vm.error_message)}</div>` : ''}
  `;
}

function dockerRow(userId, dep) {
  return `
    <div class="admin-list-item" data-deploy-id="${dep.id}">
      <div>
        <strong>${esc(dep.name)}</strong>
        <div style="font-size:0.72rem;color:var(--text-muted)">${esc(dep.image)} ${dep.target_url ? `· <a href="${esc(dep.target_url)}" target="_blank" rel="noopener">${esc(dep.target_url)}</a>` : ''}</div>
        ${dep.error_message ? `<div style="font-size:0.72rem;color:#ff6b7a">${esc(dep.error_message)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span class="status-pill ${dep.status}">${esc(STATUS_LABELS[dep.status] || dep.status)}</span>
        <button type="button" class="btn btn--ghost btn--sm docker-backup-now" data-user="${userId}" data-deploy="${dep.id}" title="Створити бекап">${icon('database', 'ico ico--sm')}</button>
        <button type="button" class="btn btn--ghost btn--sm docker-backup-toggle" data-user="${userId}" data-deploy="${dep.id}" title="Історія бекапів">${icon('clock', 'ico ico--sm')}</button>
      </div>
    </div>
    <div class="backup-history" data-docker-history="${dep.id}" hidden></div>
  `;
}

export function renderLabsPanel(labs) {
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('server', 'ico ico--md')}Машини учнів</h2>
    </div>
    <table class="admin-table">
      <thead><tr><th>Учень</th><th>Віртуальна машина</th><th>Docker-контейнери</th><th>Дії</th></tr></thead>
      <tbody>${(labs || []).map((row) => `
        <tr data-user-id="${row.userId}">
          <td>
            <strong>${esc(row.name || row.handle)}</strong>
            <div style="font-size:0.72rem;color:var(--text-muted)">@${esc(row.handle)}</div>
          </td>
          <td>${vmStatusCell(row.vm)}</td>
          <td>
            ${(row.dockerDeployments || []).length
              ? `<div class="admin-list">${row.dockerDeployments.map((d) => dockerRow(row.userId, d)).join('')}</div>`
              : '<span class="empty-state" style="padding:0">Немає деплоїв</span>'}
          </td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn btn--outline btn--sm vm-start" data-user="${row.userId}" title="Запустити">${icon('play', 'ico ico--sm')}</button>
              <button type="button" class="btn btn--outline btn--sm vm-stop" data-user="${row.userId}" title="Зупинити">${icon('x', 'ico ico--sm')}</button>
              <button type="button" class="btn btn--outline btn--sm vm-reset" data-user="${row.userId}" title="Пересоздати машину">${icon('zap', 'ico ico--sm')}</button>
              <button type="button" class="btn btn--outline btn--sm vm-backup-now" data-user="${row.userId}" title="Створити бекап зараз">${icon('database', 'ico ico--sm')}</button>
              <button type="button" class="btn btn--outline btn--sm vm-backup-toggle" data-user="${row.userId}" title="Історія бекапів">${icon('clock', 'ico ico--sm')}</button>
            </div>
          </td>
        </tr>
        <tr class="backup-history-row" data-vm-history-row="${row.userId}" hidden>
          <td colspan="4"><div class="backup-history" data-vm-history="${row.userId}"></div></td>
        </tr>`).join('') || '<tr><td colspan="4" class="empty-state">Немає учнів</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

function renderBackupList(backups, { onRestore, onDelete }) {
  if (!backups?.length) return '<p class="empty-state">Бекапів ще немає</p>';
  return `<table class="admin-table admin-table--compact">
    <thead><tr><th>Створено</th><th>Мітка</th><th>Джерело</th><th>Статус</th><th></th></tr></thead>
    <tbody>${backups.map((b) => `
      <tr data-backup-id="${b.id}">
        <td>${fmtDate(b.created_at)}</td>
        <td>${esc(b.label || '—')}</td>
        <td>${b.source === 'auto' ? 'Авто' : 'Вручну'}</td>
        <td><span class="status-pill ${b.status}">${b.status === 'ready' ? 'Готовий' : b.status === 'error' ? 'Помилка' : 'Створюється'}</span>${b.error_message ? `<div style="font-size:0.7rem;color:#ff6b7a">${esc(b.error_message)}</div>` : ''}</td>
        <td style="display:flex;gap:6px">
          <button type="button" class="btn btn--ghost btn--sm backup-restore" data-backup="${b.id}" title="Відновити" ${b.status !== 'ready' ? 'disabled' : ''}>${icon('download', 'ico ico--sm')}</button>
          <button type="button" class="btn btn--ghost btn--sm backup-delete" data-backup="${b.id}" title="Видалити">${icon('trash', 'ico ico--sm')}</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

export function bindLabsPanelEvents(showToast, reload) {
  document.querySelectorAll('.vm-start').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      const res = await api(`/admin/labs/${btn.dataset.user}/start`, { method: 'POST' });
      showToast(res.message);
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  }));

  document.querySelectorAll('.vm-stop').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      const res = await api(`/admin/labs/${btn.dataset.user}/stop`, { method: 'POST' });
      showToast(res.message);
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  }));

  document.querySelectorAll('.vm-reset').forEach((btn) => btn.addEventListener('click', async () => {
    if (!(await showConfirm('Пересоздати машину учня? Поточну машину буде видалено і створено заново.', { danger: true }))) return;
    try {
      const res = await api(`/admin/labs/${btn.dataset.user}/reset`, { method: 'POST' });
      showToast(res.message);
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  }));

  document.querySelectorAll('.vm-backup-now').forEach((btn) => btn.addEventListener('click', async () => {
    const label = (await showPrompt('Мітка бекапу (необов\'язково):')) || undefined;
    try {
      const res = await api(`/admin/labs/${btn.dataset.user}/backups`, { method: 'POST', body: JSON.stringify({ label }) });
      showToast(res.message);
      const row = document.querySelector(`[data-vm-history-row="${btn.dataset.user}"]`);
      if (row && !row.hidden) await loadVmHistory(btn.dataset.user, showToast, reload);
    } catch (err) { showToast(err.message, 'error'); }
  }));

  document.querySelectorAll('.vm-backup-toggle').forEach((btn) => btn.addEventListener('click', async () => {
    const userId = btn.dataset.user;
    const row = document.querySelector(`[data-vm-history-row="${userId}"]`);
    if (!row) return;
    row.hidden = !row.hidden;
    if (!row.hidden) await loadVmHistory(userId, showToast, reload);
  }));

  document.querySelectorAll('.docker-backup-now').forEach((btn) => btn.addEventListener('click', async () => {
    const label = (await showPrompt('Мітка бекапу (необов\'язково):')) || undefined;
    try {
      const res = await api(`/admin/labs/${btn.dataset.user}/docker/${btn.dataset.deploy}/backups`, { method: 'POST', body: JSON.stringify({ label }) });
      showToast(res.message);
      const box = document.querySelector(`[data-docker-history="${btn.dataset.deploy}"]`);
      if (box && !box.hidden) await loadDockerHistory(btn.dataset.user, btn.dataset.deploy, showToast, reload);
    } catch (err) { showToast(err.message, 'error'); }
  }));

  document.querySelectorAll('.docker-backup-toggle').forEach((btn) => btn.addEventListener('click', async () => {
    const box = document.querySelector(`[data-docker-history="${btn.dataset.deploy}"]`);
    if (!box) return;
    box.hidden = !box.hidden;
    if (!box.hidden) await loadDockerHistory(btn.dataset.user, btn.dataset.deploy, showToast, reload);
  }));
}

async function loadVmHistory(userId, showToast, reload) {
  const box = document.querySelector(`[data-vm-history="${userId}"]`);
  if (!box) return;
  box.innerHTML = '<p class="empty-state">Завантаження...</p>';
  try {
    const { backups } = await api(`/admin/labs/${userId}/backups`);
    box.innerHTML = renderBackupList(backups, {});
    box.querySelectorAll('.backup-restore').forEach((b) => b.addEventListener('click', async () => {
      if (!(await showConfirm('Відновити машину з цього бекапу? Поточний стан диска буде втрачено.', { danger: true }))) return;
      try {
        const res = await api(`/admin/labs/${userId}/backups/${b.dataset.backup}/restore`, { method: 'POST' });
        showToast(res.message);
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    }));
    box.querySelectorAll('.backup-delete').forEach((b) => b.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити бекап?', { danger: true }))) return;
      try {
        const res = await api(`/admin/labs/${userId}/backups/${b.dataset.backup}`, { method: 'DELETE' });
        showToast(res.message);
        await loadVmHistory(userId, showToast, reload);
      } catch (err) { showToast(err.message, 'error'); }
    }));
  } catch (err) {
    box.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
}

async function loadDockerHistory(userId, deployId, showToast, reload) {
  const box = document.querySelector(`[data-docker-history="${deployId}"]`);
  if (!box) return;
  box.innerHTML = '<p class="empty-state">Завантаження...</p>';
  try {
    const { backups } = await api(`/admin/labs/${userId}/docker/${deployId}/backups`);
    box.innerHTML = renderBackupList(backups, {});
    box.querySelectorAll('.backup-restore').forEach((b) => b.addEventListener('click', async () => {
      if (!(await showConfirm('Відновити контейнер з цього бекапу?', { danger: true }))) return;
      try {
        const res = await api(`/admin/labs/${userId}/docker/backups/${b.dataset.backup}/restore`, { method: 'POST' });
        showToast(res.message);
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    }));
    box.querySelectorAll('.backup-delete').forEach((b) => b.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити бекап?', { danger: true }))) return;
      try {
        const res = await api(`/admin/labs/${userId}/docker/backups/${b.dataset.backup}`, { method: 'DELETE' });
        showToast(res.message);
        await loadDockerHistory(userId, deployId, showToast, reload);
      } catch (err) { showToast(err.message, 'error'); }
    }));
  } catch (err) {
    box.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
  }
}
