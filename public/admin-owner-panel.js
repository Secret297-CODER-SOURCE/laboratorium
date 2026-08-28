import { api } from '/auth.js';
import { icon, ROLE_LABELS } from '/icons.js';

export function renderOwnerTabs(active = 'overview') {
  const tabs = [
    { id: 'overview', label: 'Огляд', icon: 'grid' },
    { id: 'directions', label: 'Напрямки', icon: 'book' },
    { id: 'programs', label: 'Програми', icon: 'notes' },
    { id: 'ctf', label: 'CTF', icon: 'shield' },
    { id: 'users', label: 'Користувачі', icon: 'users' },
    { id: 'billing', label: 'Оплата', icon: 'chart' },
    { id: 'access', label: 'Доступ', icon: 'shield' },
    { id: 'applications', label: 'Заявки', icon: 'calendar' },
    { id: 'proxmox', label: 'Proxmox', icon: 'server' },
    { id: 'storage', label: 'Сховище', icon: 'upload' },
    { id: 'schedule', label: 'Розклад', icon: 'calendar' },
  ];
  return `<nav class="admin-tabs">${tabs.map(t => `
    <button type="button" class="admin-tab${active === t.id ? ' active' : ''}" data-tab="${t.id}">
      ${icon(t.icon, 'ico ico--sm')}${t.label}
    </button>`).join('')}</nav>`;
}

export function renderDirectionsPanel(directions) {
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('book', 'ico ico--md')}Напрямки</h2>
      <button type="button" class="btn btn--outline btn--sm" id="add-direction-btn">${icon('plus', 'ico ico--sm')}Додати</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Назва</th><th>Slug</th><th>Порядок</th><th>Активний</th><th></th></tr></thead>
      <tbody>${(directions || []).map(d => `
        <tr data-direction-id="${d.id}">
          <td><input class="admin-inp" data-field="name" value="${esc(d.name)}"></td>
          <td><input class="admin-inp admin-inp--sm" data-field="slug" value="${esc(d.slug)}"></td>
          <td><input class="admin-inp admin-inp--xs" type="number" data-field="sort_order" value="${d.sort_order}"></td>
          <td><input type="checkbox" data-field="is_active" ${d.is_active ? 'checked' : ''}></td>
          <td>
            <a href="/content-builder.html?type=direction&id=${d.id}" class="btn btn--outline btn--sm" title="Конструктор">${icon('edit', 'ico ico--sm')}</a>
            <button class="btn btn--ghost btn--sm dir-save" data-id="${d.id}">${icon('check', 'ico ico--sm')}</button>
            <button class="btn btn--ghost btn--sm dir-del" data-id="${d.id}">${icon('trash', 'ico ico--sm')}</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" class="empty-state">Немає напрямків</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

export function renderProgramsPanel(programs, directions) {
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('notes', 'ico ico--md')}Програми курсів</h2>
      <button type="button" class="btn btn--outline btn--sm" id="add-program-btn">${icon('plus', 'ico ico--sm')}Додати</button>
    </div>
    <table class="admin-table admin-table--programs">
      <thead><tr><th>Назва</th><th>Напрямок</th><th>Рівень</th><th>Тривалість</th><th>Bounty</th><th title="Рекомендована"><span class="admin-th-icon">${icon('star', 'ico ico--xs')}</span></th><th></th></tr></thead>
      <tbody>${(programs || []).map(p => `
        <tr data-program-id="${p.id}">
          <td><input class="admin-inp" data-field="name" value="${esc(p.name)}"></td>
          <td><select class="admin-inp" data-field="direction_id">${(directions || []).map(d => `<option value="${d.id}" ${d.id === p.direction_id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></td>
          <td><input class="admin-inp admin-inp--sm" data-field="level" value="${esc(p.level)}"></td>
          <td><input class="admin-inp admin-inp--sm" data-field="duration" value="${esc(p.duration)}"></td>
          <td><input class="admin-inp admin-inp--xs" type="number" data-field="bounty_reward" value="${p.bounty_reward}"></td>
          <td><input type="checkbox" data-field="is_featured" ${p.is_featured ? 'checked' : ''}></td>
          <td>
            <a href="/content-builder.html?type=program&id=${p.id}" class="btn btn--outline btn--sm" title="Налаштування курсу">${icon('edit', 'ico ico--sm')}</a>
            <button class="btn btn--ghost btn--sm prog-save" data-id="${p.id}">${icon('check', 'ico ico--sm')}</button>
            <button class="btn btn--ghost btn--sm prog-del" data-id="${p.id}">${icon('trash', 'ico ico--sm')}</button>
          </td>
        </tr>
        <tr class="prog-desc-row" data-program-id="${p.id}">
          <td colspan="7">
            <input class="admin-inp" data-field="description" placeholder="Опис" value="${esc(p.description || '')}">
            <input class="admin-inp" data-field="tags" placeholder="Теги через кому" value="${esc((p.tags || []).join ? p.tags.join(',') : p.tags || '')}" style="margin-top:6px">
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="empty-state">Немає програм</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

export function renderUsersPanelExtended(users, role) {
  const roles = ['student', 'teacher', 'owner'];
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('users', 'ico ico--md')}Користувачі</h2>
      <button type="button" class="btn btn--outline btn--sm" id="add-user-btn">${icon('plus', 'ico ico--sm')}Створити акаунт</button>
    </div>
    <div id="create-user-form" class="admin-inline-form" hidden>
      <input class="admin-inp" id="new-user-name" placeholder="Ім'я">
      <input class="admin-inp" id="new-user-email" type="email" placeholder="Email">
      <select class="admin-inp" id="new-user-role">${roles.map(r => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select>
      <button type="button" class="btn btn--primary btn--sm" id="create-user-submit">Створити і надіслати пароль</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Handle</th><th>Ім'я</th><th>Email</th><th>Роль</th><th>Дії</th></tr></thead>
      <tbody>${(users || []).map(u => `
        <tr>
          <td>@${u.handle}</td>
          <td>${esc(u.name)}</td>
          <td>${esc(u.email)}</td>
          <td>
            <select class="role-select" data-user-id="${u.id}" data-current="${u.role}">
              ${roles.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
            </select>
          </td>
          <td class="admin-actions">
            <button class="btn btn--ghost btn--sm user-send-reset" data-id="${u.id}" title="Посилання скидання">${icon('notes', 'ico ico--sm')}</button>
            <button class="btn btn--ghost btn--sm user-send-pwd" data-id="${u.id}" title="Новий пароль на email">${icon('shield', 'ico ico--sm')}</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>`;
}

export function renderProxmoxPanel(settings, labPublic = {}) {
  const s = settings || {};
  const lp = labPublic || {};
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('server', 'ico ico--md')}Proxmox — лабораторні машини</h2>
      <span class="status-pill ${s.configured ? 'running' : 'stopped'}">${s.configured ? 'налаштовано' : 'не налаштовано'}</span>
    </div>
    <p class="empty-state" style="padding:0 0 16px;text-align:left">
      Після збереження ключів API для кожного нового учня автоматично створюється віртуальна машина.
    </p>
    <form id="proxmox-settings-form" class="admin-form-grid">
      <label class="admin-check">
        <input type="checkbox" id="px-enabled" ${s.enabled ? 'checked' : ''}>
        Увімкнути Proxmox
      </label>
      <label>URL Proxmox
        <input class="admin-inp" id="px-host" placeholder="https://pve.example.com:8006" value="${esc(s.host || '')}">
      </label>
      <label>Token ID
        <input class="admin-inp" id="px-token-id" placeholder="root@pam!laboratorium" value="${esc(s.tokenId || '')}">
      </label>
      <label>API Secret
        <input class="admin-inp" id="px-token-secret" type="password" placeholder="${s.hasTokenSecret ? '•••••••• (залиште порожнім, щоб не змінювати)' : 'секрет токена'}">
      </label>
      <label>Node
        <input class="admin-inp" id="px-node" value="${esc(s.node || 'pve')}">
      </label>
      <label>Template VMID
        <input class="admin-inp" id="px-template" type="number" value="${s.templateVmid || 9000}">
      </label>
      <label>Storage
        <input class="admin-inp" id="px-storage" value="${esc(s.storage || 'local-lvm')}">
      </label>
      <label>Bridge
        <input class="admin-inp" id="px-bridge" value="${esc(s.bridge || 'vmbr0')}">
      </label>
      <label>RAM (MB)
        <input class="admin-inp" id="px-memory" type="number" value="${s.vmMemoryMb || 4096}">
      </label>
      <label>CPU cores
        <input class="admin-inp" id="px-cores" type="number" value="${s.vmCores || 2}">
      </label>
      <div class="admin-form-actions">
        <button type="submit" class="btn btn--primary btn--sm">${icon('check', 'ico ico--sm')}Зберегти Proxmox</button>
        <button type="button" class="btn btn--outline btn--sm" id="px-provision-missing">Створити машини учням без VM</button>
      </div>
    </form>
  </section>
  <section class="admin-panel admin-panel--wide" style="margin-top:16px">
    <div class="admin-panel-head">
      <h2>${icon('grid', 'ico ico--md')}Публічний доступ — sslip.io</h2>
    </div>
    <p class="empty-state" style="padding:0 0 16px;text-align:left">
      Безпечний тунель через HTTPS: учні отримують адреси виду
      <code>https://203-0-113-10.sslip.io/lab/t/TOKEN</code> — DNS sslip.io вказує на шлюз,
      доступ захищений одноразовим токеном (без відкритих портів Docker/VM в інтернет).
    </p>
    <form id="lab-public-form" class="admin-form-grid">
      <label class="admin-check">
        <input type="checkbox" id="lp-secure-tunnel" ${lp.useSecureTunnel !== false ? 'checked' : ''}>
        Безпечний HTTPS-тунель (рекомендовано)
      </label>
      <label class="admin-check">
        <input type="checkbox" id="lp-sslip" ${lp.useSslip !== false ? 'checked' : ''}>
        Використовувати sslip.io для шлюзу
      </label>
      <label>Домен sslip
        <input class="admin-inp" id="lp-domain" value="${esc(lp.sslipDomain || 'sslip.io')}">
      </label>
      <label>IP шлюзу (публічний, sslip → цей сервер)
        <input class="admin-inp" id="lp-gateway-ip" placeholder="203.0.113.10" value="${esc(lp.tunnelGatewayIp || lp.dockerHostIp || '')}">
      </label>
      <label>IP Docker-хоста (внутрішній/Proxmox)
        <input class="admin-inp" id="lp-docker-ip" placeholder="10.10.10.1" value="${esc(lp.dockerHostIp || '')}">
      </label>
      <label>Термін токена (год)
        <input class="admin-inp" id="lp-token-hours" type="number" min="1" max="720" value="${lp.tunnelTokenHours || 72}">
      </label>
      <label>Схема прямого URL (legacy)
        <select class="admin-inp" id="lp-scheme">
          <option value="http" ${lp.scheme === 'http' ? 'selected' : ''}>http</option>
          <option value="https" ${lp.scheme === 'https' ? 'selected' : ''}>https</option>
        </select>
      </label>
      <label>SSH user для VM
        <input class="admin-inp" id="lp-ssh-user" value="${esc(lp.vmSshUser || 'lab')}">
      </label>
      <label>SSH port
        <input class="admin-inp" id="lp-ssh-port" type="number" value="${lp.vmSshPort || 22}">
      </label>
      <div class="admin-form-actions" style="grid-column:1/-1">
        <button type="submit" class="btn btn--primary btn--sm">${icon('check', 'ico ico--sm')}Зберегти доступ</button>
      </div>
      ${lp.exampleTunnel ? `<p class="builder-hint" style="grid-column:1/-1">Тунель: <code>${esc(lp.exampleTunnel)}</code>${lp.exampleVm ? ` · SSH VM: <code>${esc(lp.exampleVm)}</code>` : ''}</p>` : ''}
    </form>
  </section>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function rowData(row) {
  const data = {};
  row.querySelectorAll('[data-field]').forEach(el => {
    const key = el.dataset.field;
    if (el.type === 'checkbox') data[key] = el.checked;
    else if (el.type === 'number') data[key] = parseInt(el.value, 10);
    else data[key] = el.value;
  });
  const descRow = document.querySelector(`.prog-desc-row[data-program-id="${row.dataset.programId}"]`);
  if (descRow) {
    descRow.querySelectorAll('[data-field]').forEach(el => {
      data[el.dataset.field] = el.value;
    });
  }
  return data;
}

export function bindOwnerPanelEvents(showToast, reload) {
  document.getElementById('add-direction-btn')?.addEventListener('click', async () => {
    const name = prompt('Назва напрямку:');
    if (!name?.trim()) return;
    try {
      await api('/admin/directions', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      showToast('Напрямок додано');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.dir-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      try {
        await api(`/admin/directions/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify(rowData(row)) });
        showToast('Збережено');
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.dir-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити напрямок?')) return;
      try {
        await api(`/admin/directions/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.getElementById('add-program-btn')?.addEventListener('click', async () => {
    const name = prompt('Назва програми:');
    if (!name?.trim()) return;
    try {
      await api('/admin/programs', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      showToast('Програму додано');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.prog-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const data = rowData(row);
      if (typeof data.tags === 'string') data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
      try {
        await api(`/admin/programs/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify(data) });
        showToast('Збережено');
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.prog-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Деактивувати програму?')) return;
      try {
        await api(`/admin/programs/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Деактивовано');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.getElementById('add-user-btn')?.addEventListener('click', () => {
    const form = document.getElementById('create-user-form');
    form.hidden = !form.hidden;
  });

  document.getElementById('create-user-submit')?.addEventListener('click', async () => {
    const name = document.getElementById('new-user-name').value;
    const email = document.getElementById('new-user-email').value;
    const role = document.getElementById('new-user-role').value;
    try {
      await api('/admin/users', { method: 'POST', body: JSON.stringify({ name, email, role, sendEmail: true }) });
      showToast('Акаунт створено, пароль надіслано на email');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.user-send-reset').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/admin/users/${btn.dataset.id}/send-reset`, { method: 'POST' });
        showToast('Посилання для скидання надіслано');
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.user-send-pwd').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Надіслати новий пароль на email?')) return;
      try {
        await api(`/admin/users/${btn.dataset.id}/send-password`, { method: 'POST' });
        showToast('Новий пароль надіслано');
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.getElementById('proxmox-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/admin/settings/proxmox', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: document.getElementById('px-enabled').checked,
          host: document.getElementById('px-host').value,
          tokenId: document.getElementById('px-token-id').value,
          tokenSecret: document.getElementById('px-token-secret').value,
          node: document.getElementById('px-node').value,
          templateVmid: document.getElementById('px-template').value,
          storage: document.getElementById('px-storage').value,
          bridge: document.getElementById('px-bridge').value,
          vmMemoryMb: document.getElementById('px-memory').value,
          vmCores: document.getElementById('px-cores').value,
        }),
      });
      const extra = res.provisioned?.started ? ` · створення ${res.provisioned.started} VM` : '';
      showToast((res.message || 'Збережено') + extra);
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('px-provision-missing')?.addEventListener('click', async () => {
    if (!confirm('Створити машини всім учням, у яких їх ще немає?')) return;
    try {
      const res = await api('/admin/settings/proxmox/provision-missing', { method: 'POST' });
      showToast(res.message);
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('lab-public-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/admin/settings/lab-public', {
        method: 'PATCH',
        body: JSON.stringify({
          useSslip: document.getElementById('lp-sslip').checked,
          useSecureTunnel: document.getElementById('lp-secure-tunnel').checked,
          sslipDomain: document.getElementById('lp-domain').value,
          scheme: document.getElementById('lp-scheme').value,
          dockerHostIp: document.getElementById('lp-docker-ip').value,
          tunnelGatewayIp: document.getElementById('lp-gateway-ip').value,
          tunnelTokenHours: document.getElementById('lp-token-hours').value,
          vmSshUser: document.getElementById('lp-ssh-user').value,
          vmSshPort: document.getElementById('lp-ssh-port').value,
        }),
      });
      showToast(res.message || 'Збережено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });
}
