import { api } from '/auth.js';
import { icon, ROLE_LABELS } from '/icons.js';
import { showConfirm, showPrompt, showCopyDialog } from '/dialog.js';

export function renderOwnerTabs(active = 'overview') {
  const tabs = [
    { id: 'overview', label: 'Огляд', icon: 'grid' },
    { id: 'directions', label: 'Напрямки', icon: 'book' },
    { id: 'programs', label: 'Програми', icon: 'notes' },
    { id: 'manuals', label: 'Мануали', icon: 'list' },
    { id: 'ctf', label: 'CTF', icon: 'shield' },
    { id: 'users', label: 'Користувачі', icon: 'users' },
    { id: 'billing', label: 'Оплата', icon: 'chart' },
    { id: 'access', label: 'Доступ', icon: 'shield' },
    { id: 'applications', label: 'Заявки', icon: 'calendar' },
    { id: 'proxmox', label: 'Proxmox', icon: 'server' },
    { id: 'labs', label: 'Машини', icon: 'database' },
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
      <thead><tr><th>Назва</th><th>Slug</th><th>Порядок</th><th title="Ховає напрямок з головної сторінки та із запису на нові програми для всіх. Існуючі групи, записи учнів і мануали цього напрямку продовжують працювати — нічого не видаляється.">Активний</th><th title="Показує вкладку «Редактор коду» учням груп цього напрямку">Програмування</th><th></th></tr></thead>
      <tbody>${(directions || []).map(d => `
        <tr data-direction-id="${d.id}">
          <td><input class="admin-inp" data-field="name" value="${esc(d.name)}"></td>
          <td><input class="admin-inp admin-inp--sm" data-field="slug" value="${esc(d.slug)}"></td>
          <td><input class="admin-inp admin-inp--xs" type="number" data-field="sort_order" value="${d.sort_order}"></td>
          <td><input type="checkbox" data-field="is_active" ${d.is_active ? 'checked' : ''}></td>
          <td><input type="checkbox" data-field="is_programming" ${d.is_programming ? 'checked' : ''}></td>
          <td>
            <a href="/content-builder.html?type=direction&id=${d.id}" class="btn btn--outline btn--sm" title="Конструктор">${icon('edit', 'ico ico--sm')}</a>
            <button class="btn btn--ghost btn--sm dir-save" data-id="${d.id}">${icon('check', 'ico ico--sm')}</button>
            <button class="btn btn--ghost btn--sm dir-del" data-id="${d.id}">${icon('trash', 'ico ico--sm')}</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Немає напрямків</td></tr>'}
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

export function renderUsersPanelExtended(users, role, smtp = {}) {
  const roles = ['student', 'teacher', 'owner'];
  const mailOk = !!smtp.configured;
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('users', 'ico ico--md')}Користувачі</h2>
      <button type="button" class="btn btn--outline btn--sm" id="add-user-btn">${icon('plus', 'ico ico--sm')}Створити акаунт</button>
    </div>
    ${mailOk ? '' : `<p class="smtp-warn">SMTP не налаштовано — пароль не піде на email. Заповніть форму пошти нижче, або скопіюйте пароль і передайте учню вручну.</p>`}
    <div id="create-user-form" class="admin-inline-form" hidden>
      <input class="admin-inp" id="new-user-name" placeholder="Ім'я">
      <input class="admin-inp" id="new-user-email" type="email" placeholder="Email">
      <select class="admin-inp" id="new-user-role">${roles.map(r => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select>
      <button type="button" class="btn btn--primary btn--sm" id="create-user-submit">Створити і надіслати пароль</button>
    </div>
    <input type="search" class="admin-inp admin-search" id="users-search" placeholder="Пошук за handle, ім'ям чи email...">
    <table class="admin-table">
      <thead><tr><th>Handle</th><th>Ім'я</th><th>Email</th><th>Роль</th><th>Дії</th></tr></thead>
      <tbody>${(users || []).map(u => `
        <tr data-search="${esc(`${u.handle} ${u.name} ${u.email}`.toLowerCase())}"${u.is_frozen ? ' style="opacity:0.55"' : ''}>
          <td>@${u.handle}${u.is_frozen ? ` <span class="status-pill error" style="margin-left:4px">заморожено</span>` : ''}</td>
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
            <button class="btn btn--ghost btn--sm user-freeze" data-id="${u.id}" data-frozen="${u.is_frozen ? '1' : '0'}" title="${u.is_frozen ? 'Розморозити' : 'Заморозити'}">${icon(u.is_frozen ? 'play' : 'lock', 'ico ico--sm')}</button>
            <button class="btn btn--ghost btn--sm user-delete" data-id="${u.id}" title="Видалити">${icon('trash', 'ico ico--sm')}</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>
  <section class="admin-panel admin-panel--wide smtp-panel">
    <div class="admin-panel-head">
      <h2>${icon('send', 'ico ico--md')}Пошта (SMTP)</h2>
      <span class="status-pill ${mailOk ? 'running' : 'stopped'}">${mailOk ? 'налаштовано' : 'не налаштовано'}</span>
    </div>
    <p class="empty-state" style="padding:0 0 16px;text-align:left">
      Листи з паролем і скиданням доступу. Для Gmail: <code>smtp.gmail.com</code>, порт 587, пароль додатку (не звичайний пароль акаунта).
    </p>
    <form id="smtp-settings-form" class="admin-form-grid">
      <label>SMTP хост
        <input class="admin-inp" id="smtp-host" placeholder="smtp.gmail.com" value="${esc(smtp.host || '')}">
      </label>
      <label>Порт
        <input class="admin-inp" id="smtp-port" type="number" value="${smtp.port || 587}">
      </label>
      <label>Логін
        <input class="admin-inp" id="smtp-user" placeholder="noreply@laboratorium.club" value="${esc(smtp.user || '')}" autocomplete="off">
      </label>
      <label>Пароль
        <input class="admin-inp" id="smtp-pass" type="password" placeholder="${smtp.hasPassword ? '•••••••• (залиште порожнім, щоб не змінювати)' : 'пароль SMTP'}" autocomplete="new-password">
      </label>
      <label>Від кого (From)
        <input class="admin-inp" id="smtp-from" placeholder="noreply@laboratorium.club" value="${esc(smtp.from || '')}">
      </label>
      <label>Ім'я відправника (Display Name)
        <input class="admin-inp" id="smtp-from-name" placeholder="Laboratorium" value="${esc(smtp.fromName || '')}">
      </label>
      <label class="admin-check">
        <input type="checkbox" id="smtp-secure" ${smtp.secure ? 'checked' : ''}>
        SSL (порт 465)
      </label>
      <label class="admin-check">
        <input type="checkbox" id="smtp-insecure-tls" ${smtp.insecureTls ? 'checked' : ''}>
        Не перевіряти TLS-сертифікат
      </label>
      <p class="empty-state" style="padding:0;text-align:left;grid-column:1/-1;font-size:0.72rem">
        Увімкніть, якщо власний поштовий сервер налаштовано по внутрішній IP-адресі (наприклад Docker gateway) — сертифікат випущено на домен, а не на IP, і без цього SMTP видаватиме помилку "Hostname/IP does not match certificate's altnames".
      </p>
      <div class="admin-form-actions">
        <button type="submit" class="btn btn--primary btn--sm">${icon('check', 'ico ico--sm')}Зберегти SMTP</button>
        <button type="button" class="btn btn--outline btn--sm" id="smtp-test-btn">${icon('send', 'ico ico--sm')}Надіслати тест</button>
      </div>
    </form>
  </section>`;
}

const VM_STATUS_LABELS = {
  running: 'Працює',
  provisioning: 'Створюється',
  deploying: 'Створюється',
  stopped: 'Зупинено',
  error: 'Помилка',
  none: 'Немає',
  pending: 'Очікує',
};

function isLinkedVm(vm) {
  if (!vm) return false;
  return !!(vm.proxmox_vmid || vm.hostname);
}

function hostDisplay(host) {
  if (!host) return '—';
  try {
    return new URL(host).host;
  } catch {
    return String(host).replace(/^https?:\/\//, '');
  }
}

function renderLinkedServersSidebar(settings, labs = []) {
  const s = settings || {};
  const rows = labs || [];
  const linked = rows.filter((r) => isLinkedVm(r.vm));
  const unlinked = rows.length - linked.length;
  const running = linked.filter((r) => r.vm?.status === 'running').length;

  const hostCard = `
    <article class="px-host-card${s.configured ? ' is-online' : ''}">
      <div class="px-host-card-top">
        <span class="px-host-dot" aria-hidden="true"></span>
        <div>
          <strong>${esc(s.node || 'pve')}</strong>
          <code class="px-host-url">${esc(hostDisplay(s.host))}</code>
        </div>
        <span class="status-pill ${s.configured ? 'running' : 'stopped'}">${s.configured ? 'онлайн' : 'офлайн'}</span>
      </div>
      <div class="px-host-meta">
        <span>tpl ${esc(s.templateVmid || 9000)}</span>
        <span>${esc(s.storage || 'local-lvm')}</span>
        <span>${esc(s.bridge || 'vmbr0')}</span>
      </div>
    </article>`;

  const cards = linked.length
    ? linked.map((row) => {
      const vm = row.vm || {};
      const status = vm.status || 'none';
      const meta = [
        vm.hostname,
        vm.ip,
        vm.proxmox_vmid ? `#${vm.proxmox_vmid}` : null,
        vm.node && vm.node !== (s.node || 'pve') ? vm.node : null,
      ].filter(Boolean);
      const dockerN = (row.dockerDeployments || []).length;
      const canControl = !!vm.proxmox_vmid;
      return `
        <article class="px-server-card${status === 'running' ? ' is-running' : ''}${status === 'error' ? ' is-error' : ''}">
          <div class="px-server-card-top">
            <div>
              <strong>@${esc(row.handle)}</strong>
              <div class="px-server-name">${esc(row.name || '')}</div>
            </div>
            <span class="status-pill ${esc(status)}">${esc(VM_STATUS_LABELS[status] || status)}</span>
          </div>
          ${meta.length ? `<div class="px-server-meta">${esc(meta.join(' · '))}</div>` : ''}
          ${vm.error_message ? `<div class="px-server-err" title="${esc(vm.error_message)}">${esc(vm.error_message)}</div>` : ''}
          <div class="px-server-foot">
            ${dockerN ? `<span class="px-server-docker">${icon('database', 'ico ico--xs')}${dockerN} docker</span>` : '<span></span>'}
            ${canControl ? `
              <div class="px-server-actions">
                <button type="button" class="btn btn--ghost btn--sm vm-start" data-user="${row.userId}" title="Запустити">${icon('play', 'ico ico--sm')}</button>
                <button type="button" class="btn btn--ghost btn--sm vm-stop" data-user="${row.userId}" title="Зупинити">${icon('x', 'ico ico--sm')}</button>
              </div>` : ''}
          </div>
        </article>`;
    }).join('')
    : `<p class="empty-state px-servers-empty">Ще немає прив'язаних машин. Після збереження API ключів VM створюються автоматично.</p>`;

  return `
    <aside class="px-servers">
      <section class="admin-panel px-servers-panel">
        <div class="admin-panel-head">
          <h2>${icon('server', 'ico ico--md')}Прив'язані сервери</h2>
          <span class="px-servers-count" title="${running} працює">${linked.length}</span>
        </div>
        ${hostCard}
        <div class="px-servers-list">${cards}</div>
        <div class="px-servers-footer">
          ${unlinked ? `<span>${unlinked} учнів без VM</span>` : '<span></span>'}
          <button type="button" class="btn btn--ghost btn--sm" id="px-goto-labs">Усі машини →</button>
        </div>
      </section>
    </aside>`;
}

export function renderProxmoxPanel(settings, labPublic = {}, labs = []) {
  const s = settings || {};
  const lp = labPublic || {};
  return `<div class="px-layout">
  <div class="px-layout-main">
  <section class="admin-panel">
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
      <label>Proxmox User
        <input class="admin-inp" id="px-token-user" placeholder="root@pam" value="${esc((s.tokenId || '').split('!')[0] || '')}">
      </label>
      <label>Token Name
        <input class="admin-inp" id="px-token-name" placeholder="laboratorium" value="${esc((s.tokenId || '').split('!')[1] || '')}">
      </label>
      <p class="empty-state" style="padding:0;text-align:left;grid-column:1/-1;font-size:0.75rem">
        Це два окремі поля з Proxmox: Datacenter → Permissions → API Tokens → User name і Token Name.
      </p>
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
      <h2>${icon('database', 'ico ico--md')}Автоматичні бекапи</h2>
    </div>
    <p class="empty-state" style="padding:0 0 16px;text-align:left">
      Регулярні бекапи всіх запущених машин і Docker-контейнерів учнів зі старими копіями, що видаляються автоматично.
    </p>
    <form id="backup-settings-form" class="admin-form-grid">
      <label class="admin-check">
        <input type="checkbox" id="bk-enabled" ${s.backupAutoEnabled ? 'checked' : ''}>
        Увімкнути автоматичні бекапи
      </label>
      <label>Інтервал (год)
        <input class="admin-inp" id="bk-interval" type="number" min="1" value="${s.backupIntervalHours || 24}">
      </label>
      <label>Зберігати останніх копій
        <input class="admin-inp" id="bk-retention" type="number" min="1" value="${s.backupRetention || 3}">
      </label>
      <div class="admin-form-actions">
        <button type="submit" class="btn btn--primary btn--sm">${icon('check', 'ico ico--sm')}Зберегти розклад бекапів</button>
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
  </section>
  </div>
  ${renderLinkedServersSidebar(s, labs)}
  </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function mailFailMessage(prefix, reason) {
  const detail = !reason || reason === 'no-smtp'
    ? 'SMTP не налаштовано — збережіть хост на цій вкладці.'
    : reason;
  return `${prefix} (${detail})`;
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
  document.getElementById('users-search')?.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    document.querySelectorAll('tr[data-search]').forEach(row => {
      row.hidden = !!query && !row.dataset.search.includes(query);
    });
  });

  document.getElementById('add-direction-btn')?.addEventListener('click', async () => {
    const name = await showPrompt('Назва напрямку:');
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
      if (!(await showConfirm('Видалити напрямок?', { danger: true }))) return;
      try {
        await api(`/admin/directions/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.getElementById('add-program-btn')?.addEventListener('click', async () => {
    const name = await showPrompt('Назва програми:');
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
      if (!(await showConfirm('Деактивувати програму?', { danger: true }))) return;
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
      const res = await api('/admin/users', { method: 'POST', body: JSON.stringify({ name, email, role, sendEmail: true }) });
      if (res.emailSent) {
        showToast('Акаунт створено, пароль надіслано на email');
      } else {
        await showCopyDialog(mailFailMessage(`Акаунт створено, але email НЕ надіслано. Скопіюйте пароль і передайте учню (${email}) вручну.`, res.mailReason), res.password, { title: 'Пароль учня' });
      }
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.user-send-reset').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api(`/admin/users/${btn.dataset.id}/send-reset`, { method: 'POST' });
        if (res.emailSent) {
          showToast('Посилання для скидання надіслано');
        } else {
          await showCopyDialog(mailFailMessage('Email НЕ надіслано. Скопіюйте посилання і передайте учню вручну.', res.mailReason), res.resetUrl, { title: 'Посилання для скидання' });
        }
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.user-send-pwd').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Надіслати новий пароль на email?'))) return;
      try {
        const res = await api(`/admin/users/${btn.dataset.id}/send-password`, { method: 'POST' });
        if (res.emailSent) {
          showToast('Новий пароль надіслано');
        } else {
          await showCopyDialog(mailFailMessage('Email НЕ надіслано. Скопіюйте новий пароль і передайте учню вручну.', res.mailReason), res.password, { title: 'Новий пароль' });
        }
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.user-freeze').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nextFrozen = btn.dataset.frozen !== '1';
      if (nextFrozen && !(await showConfirm('Заморозити акаунт? Користувач не зможе увійти, дані збережуться.', { danger: true }))) return;
      try {
        const res = await api(`/admin/users/${btn.dataset.id}/freeze`, { method: 'PATCH', body: JSON.stringify({ frozen: nextFrozen }) });
        showToast(res.message);
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.user-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити користувача остаточно? Усі його дані (прогрес, здачі, машини) буде втрачено. Це не можна скасувати.', { danger: true, confirmText: 'Видалити' }))) return;
      try {
        const res = await api(`/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
        showToast(res.message);
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.getElementById('smtp-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/admin/settings/smtp', {
        method: 'PATCH',
        body: JSON.stringify({
          host: document.getElementById('smtp-host').value,
          port: document.getElementById('smtp-port').value,
          user: document.getElementById('smtp-user').value,
          pass: document.getElementById('smtp-pass').value,
          from: document.getElementById('smtp-from').value,
          fromName: document.getElementById('smtp-from-name').value,
          secure: document.getElementById('smtp-secure').checked,
          insecureTls: document.getElementById('smtp-insecure-tls').checked,
        }),
      });
      showToast(res.message || 'Збережено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('smtp-test-btn')?.addEventListener('click', async () => {
    const to = await showPrompt('Куди надіслати тестовий лист?', document.getElementById('smtp-user')?.value || '', {
      title: 'Тест SMTP',
      placeholder: 'you@example.com',
      okText: 'Надіслати',
    });
    if (!to?.trim()) return;
    try {
      const res = await api('/admin/settings/smtp/test', {
        method: 'POST',
        body: JSON.stringify({ to: to.trim() }),
      });
      showToast(res.message || 'Надіслано');
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('proxmox-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const tokenUser = document.getElementById('px-token-user').value.trim();
      const tokenName = document.getElementById('px-token-name').value.trim();
      const res = await api('/admin/settings/proxmox', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: document.getElementById('px-enabled').checked,
          host: document.getElementById('px-host').value,
          tokenId: tokenUser && tokenName ? `${tokenUser}!${tokenName}` : (tokenUser || ''),
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

  document.getElementById('backup-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api('/admin/settings/proxmox', {
        method: 'PATCH',
        body: JSON.stringify({
          backupAutoEnabled: document.getElementById('bk-enabled').checked,
          backupIntervalHours: document.getElementById('bk-interval').value,
          backupRetention: document.getElementById('bk-retention').value,
        }),
      });
      showToast(res.message || 'Збережено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('px-provision-missing')?.addEventListener('click', async () => {
    if (!(await showConfirm('Створити машини всім учням, у яких їх ще немає?'))) return;
    try {
      const res = await api('/admin/settings/proxmox/provision-missing', { method: 'POST' });
      showToast(res.message);
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('px-goto-labs')?.addEventListener('click', () => {
    document.querySelector('.admin-tab[data-tab="labs"]')?.click();
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
