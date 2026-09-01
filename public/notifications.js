import { api, getToken, getUser } from '/auth.js';
import { icon } from '/icons.js';
import { showAlert } from '/dialog.js';

const STAFF_ROLES = ['teacher', 'owner', 'developer'];

let notifications = [];
let unreadCount = 0;
let loadingMore = false;
let hasMore = true;
let socket = null;
let audienceCache = null;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmtTime(iso) {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'щойно';
  if (diffMin < 60) return `${diffMin} хв тому`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} год тому`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} дн тому`;
  return d.toLocaleDateString('uk-UA');
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function setBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  badge.hidden = unreadCount === 0;
  badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
}

function renderList() {
  const el = document.getElementById('notif-list');
  if (!el) return;
  if (!notifications.length) {
    el.innerHTML = '<p class="empty-state">Сповіщень немає</p>';
    return;
  }
  el.innerHTML = notifications.map((n) => `
    <div class="notif-item${n.read ? '' : ' notif-item--unread'}" data-id="${n.id}" data-link="${esc(n.link || '')}">
      <div class="notif-item-title">${esc(n.title)}</div>
      ${n.body ? `<div class="notif-item-body">${esc(n.body)}</div>` : ''}
      <div class="notif-item-time">${fmtTime(n.created_at)}</div>
    </div>`).join('')
    + (hasMore ? '<button type="button" id="notif-load-more" class="btn btn--ghost btn--sm notif-load-more">Показати ще</button>' : '');

  el.querySelectorAll('.notif-item').forEach((row) => {
    row.addEventListener('click', async () => {
      const id = parseInt(row.dataset.id, 10);
      const n = notifications.find((x) => x.id === id);
      if (n && !n.read) {
        n.read = true;
        unreadCount = Math.max(0, unreadCount - 1);
        setBadge();
        row.classList.remove('notif-item--unread');
        api(`/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
      }
      if (row.dataset.link) window.location.href = row.dataset.link;
    });
  });

  document.getElementById('notif-load-more')?.addEventListener('click', loadMore);
}

async function loadInitial() {
  const el = document.getElementById('notif-list');
  if (el) el.innerHTML = '<p class="empty-state">Завантаження...</p>';
  try {
    const { notifications: rows } = await api('/notifications?limit=20');
    notifications = rows;
    hasMore = rows.length === 20;
    renderList();
  } catch {
    if (el) el.innerHTML = '<p class="empty-state">Не вдалося завантажити</p>';
  }
}

async function loadMore() {
  if (loadingMore || !notifications.length) return;
  loadingMore = true;
  try {
    const beforeId = notifications[notifications.length - 1].id;
    const { notifications: rows } = await api(`/notifications?limit=20&beforeId=${beforeId}`);
    notifications = notifications.concat(rows);
    hasMore = rows.length === 20;
    renderList();
  } finally {
    loadingMore = false;
  }
}

async function refreshUnreadCount() {
  try {
    const { count } = await api('/notifications/unread-count');
    unreadCount = count;
    setBadge();
  } catch { /* offline or logged out — badge just stays stale */ }
}

function toggleDropdown(force) {
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;
  const willOpen = force ?? dropdown.hidden;
  dropdown.hidden = !willOpen;
  if (willOpen) loadInitial();
}

function showTransientPopup(n) {
  const popup = document.createElement('div');
  popup.className = 'notif-popup';
  popup.innerHTML = `<strong>${esc(n.title)}</strong>${n.body ? `<div>${esc(n.body)}</div>` : ''}`;
  popup.addEventListener('click', () => {
    if (n.link) window.location.href = n.link;
  });
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 6000);
}

function connectSocket() {
  if (socket || typeof io === 'undefined') return;
  const token = getToken();
  if (!token) return;
  socket = io({ auth: { token } });
  socket.on('notification:new', (n) => {
    notifications.unshift(n);
    unreadCount += 1;
    setBadge();
    renderList();
    showTransientPopup(n);
  });
  socket.on('connect_error', () => { /* billing-suspended users can't connect — bell still works via REST */ });
}

async function loadAudienceOptions() {
  if (audienceCache) return audienceCache;
  const role = getUser()?.role;
  const result = { groups: [], programs: [] };
  try {
    if (role === 'teacher') {
      const { groups } = await api('/admin/groups');
      result.groups = groups || [];
    } else {
      const [{ groups }, { programs }] = await Promise.all([
        api('/admin/groups?all=1'),
        api('/programs'),
      ]);
      result.groups = groups || [];
      result.programs = programs || [];
    }
  } catch { /* leave empty — composer still works for "all students" */ }
  audienceCache = result;
  return result;
}

async function openComposer() {
  const role = getUser()?.role;
  const { groups, programs } = await loadAudienceOptions();
  const panel = document.getElementById('notif-composer');
  if (!panel) return;

  const audienceOptions = role === 'teacher'
    ? groups.map((g) => `<option value="group:${g.id}">${esc(g.name)}</option>`).join('')
    : [
      '<option value="all">Усі учні</option>',
      ...groups.map((g) => `<option value="group:${g.id}">Група: ${esc(g.name)}</option>`),
      ...programs.map((p) => `<option value="program:${p.id}">Програма: ${esc(p.name)}</option>`),
    ].join('');

  panel.innerHTML = `
    <input type="text" id="notif-comp-title" class="notif-comp-inp" placeholder="Заголовок оголошення" maxlength="200">
    <textarea id="notif-comp-body" class="notif-comp-inp" placeholder="Текст (необов'язково)" rows="3"></textarea>
    <select id="notif-comp-audience" class="notif-comp-inp">${audienceOptions}</select>
    <div class="notif-comp-actions">
      <button type="button" id="notif-comp-cancel" class="btn btn--ghost btn--sm">Скасувати</button>
      <button type="button" id="notif-comp-send" class="btn btn--primary btn--sm">Надіслати</button>
    </div>`;
  panel.hidden = false;

  document.getElementById('notif-comp-cancel').addEventListener('click', () => { panel.hidden = true; });
  document.getElementById('notif-comp-send').addEventListener('click', async () => {
    const title = document.getElementById('notif-comp-title').value.trim();
    if (!title) return;
    const body = document.getElementById('notif-comp-body').value.trim();
    const audience = document.getElementById('notif-comp-audience').value;
    const [audienceType, id] = audience.includes(':') ? audience.split(':') : [audience, null];

    const payload = { title, body, audienceType };
    if (audienceType === 'group') payload.groupId = id;
    if (audienceType === 'program') payload.programId = id;

    try {
      const res = await api('/admin/announcements', { method: 'POST', body: JSON.stringify(payload) });
      panel.hidden = true;
      await showAlert(res.message);
    } catch (err) {
      await showAlert(err.message);
    }
  });
}

async function setupPush() {
  const item = document.getElementById('notif-push-toggle');
  if (!item) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    item.hidden = true;
    return;
  }

  const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
  if (!reg) { item.hidden = true; return; }

  const existing = await reg.pushManager.getSubscription();
  item.textContent = existing ? 'Вимкнути push-сповіщення' : 'Увімкнути push-сповіщення';

  item.onclick = async () => {
    const current = await reg.pushManager.getSubscription();
    if (current) {
      await current.unsubscribe();
      api('/notifications/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: current.endpoint }) }).catch(() => {});
      item.textContent = 'Увімкнути push-сповіщення';
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    try {
      const { publicKey } = await api('/notifications/push/public-key');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api('/notifications/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
      item.textContent = 'Вимкнути push-сповіщення';
    } catch (err) {
      await showAlert(err.message || 'Не вдалося увімкнути push-сповіщення');
    }
  };
}

export function renderNotificationBell() {
  const isStaff = STAFF_ROLES.includes(getUser()?.role);
  return `<div class="notif-bell-wrap">
    <button type="button" id="notif-bell-btn" class="notif-bell-btn" aria-label="Сповіщення">
      ${icon('bell', 'ico ico--md')}
      <span id="notif-badge" class="notif-badge" hidden>0</span>
    </button>
    <div id="notif-dropdown" class="notif-dropdown" hidden>
      <div class="notif-dropdown-head">
        <strong>Сповіщення</strong>
        <div class="notif-dropdown-actions">
          ${isStaff ? `<button type="button" id="notif-announce-btn" class="btn btn--ghost btn--sm" title="Надіслати оголошення">${icon('send', 'ico ico--sm')}</button>` : ''}
          <button type="button" id="notif-mark-all" class="btn btn--ghost btn--sm">Прочитати всі</button>
        </div>
      </div>
      <div id="notif-composer" class="notif-composer" hidden></div>
      <div id="notif-list" class="notif-list"><p class="empty-state">Завантаження...</p></div>
      <button type="button" id="notif-push-toggle" class="notif-push-toggle"></button>
    </div>
  </div>`;
}

export function initNotificationBell(mountEl) {
  if (!mountEl || !getToken()) return;
  mountEl.innerHTML = renderNotificationBell();

  document.getElementById('notif-bell-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const wrap = document.querySelector('.notif-bell-wrap');
    if (dropdown && !dropdown.hidden && wrap && !wrap.contains(e.target)) dropdown.hidden = true;
  });
  document.getElementById('notif-mark-all').addEventListener('click', async () => {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
    notifications.forEach((n) => { n.read = true; });
    unreadCount = 0;
    setBadge();
    renderList();
  });
  document.getElementById('notif-announce-btn')?.addEventListener('click', openComposer);

  refreshUnreadCount();
  connectSocket();
  setupPush();
}
