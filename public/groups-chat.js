import { api, getToken, getUser, requireAuthAsync, initTheme } from '/auth.js';
import { icon, initNavIcons } from '/icons.js';
import { initSiteHeader, refreshAppNav } from '/site-header.js';
import { loadTabAccess, pageAllowed } from '/tab-access.js';

if (!(await requireAuthAsync())) throw new Error('auth');
initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });
initNavIcons();

(async () => {
  await loadTabAccess();
  refreshAppNav();
  if (!pageAllowed('page.groups_chat')) {
    window.location.replace('/portal.html');
    return;
  }
  loadInbox();
})().catch(() => {
  document.getElementById('gc-groups').innerHTML = '<p class="empty-state">Помилка завантаження</p>';
});

const STICKERS = ['target', 'zap', 'code', 'rocket', 'check', 'heart', 'shield', 'book', 'award', 'notes', 'lightbulb', 'chart'];

const socket = io({ auth: { token: getToken() } });
const USER = getUser();
const IS_ADMIN = ['owner', 'developer'].includes(USER?.role);

let inbox = { groups: [], dms: [] };
let activeGroupId = null;
let activeGroup = null;
let activeTab = 'chat';
let activeChannel = null;
let activeMeta = null;
let groupDms = [];
let rankingData = null;
let dmMode = false;

const params = new URLSearchParams(location.search);
const initialGroupId = params.get('group');
const initialTab = params.get('tab');

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('Z') ? iso : `${iso}Z`);
  return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function previewText(msg) {
  if (!msg) return 'Поки немає повідомлень';
  if (msg.msg_type === 'sticker') return msg.body || 'Стікер';
  if (msg.msg_type === 'gif') return 'GIF';
  if (msg.msg_type === 'video') return 'Відео';
  if (msg.msg_type === 'image') return 'Фото';
  return msg.body || '';
}

async function loadInbox() {
  inbox = await api('/chat/inbox');
  if (IS_ADMIN) {
    document.getElementById('gc-sidebar-hint').textContent = 'Усі групи (режим перегляду)';
  }
  renderSidebar();
  if (initialGroupId && !activeGroupId) {
    const gid = parseInt(initialGroupId, 10);
    if (inbox.groups.find(g => g.id === gid)) {
      await openGroup(gid, initialTab || 'chat');
    }
  }
}

function renderSidebar() {
  const groupsEl = document.getElementById('gc-groups');
  groupsEl.innerHTML = inbox.groups.length
    ? inbox.groups.map(g => `
      <button type="button" class="gc-item${activeGroupId === g.id ? ' active' : ''}" data-group-id="${g.id}">
        <div class="gc-item-row">
          <div class="gc-item-title" style="--gc-color:${g.color || 'var(--accent)'}">${esc(g.name)}</div>
          ${g.is_observer ? '<span class="gc-observer-badge">перегляд</span>' : ''}
        </div>
        <div class="gc-item-meta">${g.member_count || 0} учн. · ${esc(g.program_name || 'група')}</div>
        <div class="gc-item-preview">${esc(previewText(g.last_message))}</div>
      </button>`).join('')
    : `<p class="empty-state">${IS_ADMIN ? 'Немає груп. Створіть у панелі викладача.' : 'Ви ще не в жодній групі'}</p>`;

  groupsEl.querySelectorAll('.gc-item').forEach(btn => {
    btn.addEventListener('click', () => openGroup(parseInt(btn.dataset.groupId, 10), 'chat'));
  });
}

function renderMessage(m) {
  const own = m.user_id === USER.id;
  let content = '';
  if (m.msg_type === 'sticker') {
    const stickerName = m.body?.startsWith('icon:') ? m.body.slice(5) : null;
    content = stickerName
      ? `<div class="gc-msg-sticker">${icon(stickerName, 'ico ico--xl')}</div>`
      : `<div class="gc-msg-sticker gc-msg-sticker--legacy">${esc(m.body)}</div>`;
  } else if (m.msg_type === 'gif' || m.msg_type === 'image') {
    content = `${m.body ? `<div class="gc-msg-body">${esc(m.body)}</div>` : ''}
      <div class="gc-msg-media"><img src="${esc(m.attachment_url)}" alt="" loading="lazy"></div>`;
  } else if (m.msg_type === 'video') {
    content = `${m.body ? `<div class="gc-msg-body">${esc(m.body)}</div>` : ''}
      <div class="gc-msg-media"><video src="${esc(m.attachment_url)}" controls playsinline></video></div>`;
  } else {
    content = `<div class="gc-msg-body">${esc(m.body)}</div>`;
  }

  return `
    <div class="gc-msg${own ? ' own' : ''}" data-id="${m.id}">
      <div class="gc-msg-header">
        <span class="gc-msg-handle">@${esc(m.handle || 'system')}</span>
        <span class="gc-msg-time">${formatTime(m.created_at)}</span>
      </div>
      ${content}
    </div>`;
}

function bindCompose() {
  document.getElementById('toggle-stickers')?.addEventListener('click', () => {
    document.getElementById('sticker-panel').classList.toggle('open');
  });

  document.querySelectorAll('.gc-sticker-btn').forEach(btn => {
    btn.addEventListener('click', () => sendPayload({ msg_type: 'sticker', body: btn.dataset.sticker }));
  });

  document.getElementById('send-gif-btn')?.addEventListener('click', async () => {
    const url = prompt('Вставте посилання на GIF (https://...)');
    if (!url?.trim()) return;
    await sendPayload({ msg_type: 'gif', attachment_url: url.trim() });
  });

  document.getElementById('media-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка завантаження');
      await sendPayload({ msg_type: data.msg_type, attachment_url: data.url });
    } catch (err) {
      alert(err.message);
    }
    e.target.value = '';
  });

  const sendText = () => {
    const input = document.getElementById('gc-input');
    const text = input?.value.trim();
    if (!text) return;
    sendPayload({ msg_type: 'text', body: text });
    input.value = '';
  };

  document.getElementById('gc-send')?.addEventListener('click', sendText);
  document.getElementById('gc-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
}

function renderCompose() {
  return `
    <div class="gc-compose">
      <div class="gc-compose-tools">
        <button type="button" class="gc-tool-btn" id="toggle-stickers">Стікери</button>
        <button type="button" class="gc-tool-btn" id="send-gif-btn">GIF</button>
        <label class="gc-tool-btn" style="cursor:pointer">
          Фото/відео
          <input type="file" id="media-file" accept="image/*,video/*" hidden>
        </label>
      </div>
      <div class="gc-sticker-panel" id="sticker-panel">
        ${STICKERS.map(s => `<button type="button" class="gc-sticker-btn" data-sticker="icon:${s}" title="${s}">${icon(s, 'ico ico--md')}</button>`).join('')}
      </div>
      <div class="gc-compose-row">
        <input type="text" id="gc-input" placeholder="Повідомлення..." maxlength="2000">
        <button type="button" class="btn btn--primary btn--sm" id="gc-send">${icon('send', 'ico ico--sm')}</button>
      </div>
    </div>`;
}

function renderRankingTable(data) {
  if (!data?.students?.length) {
    return '<p class="empty-state">У групі поки немає учнів</p>';
  }

  const rankBadge = (rank) => (rank <= 3
    ? `<span class="gc-medal gc-medal--${rank}">${icon('award', 'ico ico--sm')}</span>`
    : rank);
  return `
    <div class="gc-ranking-wrap">
      <table class="gc-ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Учень</th>
            <th>Bounty</th>
            <th>Задачі</th>
            <th>Рівень</th>
          </tr>
        </thead>
        <tbody>
          ${data.students.map(s => `
            <tr class="gc-rank-row${s.id === USER.id ? ' gc-rank-row--me' : ''}">
              <td class="gc-rank-num">${rankBadge(s.rank)}</td>
              <td>
                <strong>@${esc(s.handle)}</strong>
                <div class="gc-rank-name">${esc(s.name)}</div>
              </td>
              <td class="gc-rank-pts">${s.bounty_points.toLocaleString('uk-UA')}</td>
              <td>
                <span class="gc-rank-tasks ico-inline">${icon('check', 'ico ico--sm')}${s.tasks_completed}</span>
                ${s.tasks_active ? `<span class="gc-rank-active">${s.tasks_active} в роботі</span>` : ''}
              </td>
              <td><span class="gc-tier-pill">${esc(s.tier)}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${data.teacher ? `
        <div class="gc-teacher-card">
          <span class="gc-teacher-label">Викладач</span>
          <strong>@${esc(data.teacher.handle)}</strong> · ${esc(data.teacher.name)}
        </div>` : ''}
    </div>`;
}

function renderMembersPanel(members) {
  const others = members.filter(m => m.id !== USER.id);
  return `
    <div class="gc-members-wrap">
      <div class="gc-members-grid">
        ${others.map(m => `
          <button type="button" class="gc-member-card" data-uid="${m.id}">
            <span class="gc-member-avatar">${esc(m.name?.charAt(0) || '?')}</span>
            <div>
              <strong>@${esc(m.handle)}</strong>
              <div class="gc-member-role">${m.member_role === 'author' ? 'Автор' : m.member_role === 'teacher' ? 'Викладач' : 'Учень'}</div>
            </div>
            <span class="gc-member-dm">${icon('chat', 'ico ico--sm')}</span>
          </button>`).join('') || '<p class="empty-state">Немає інших учасників</p>'}
      </div>
      ${groupDms.length ? `
        <h3 class="gc-dms-title">Особисті в групі</h3>
        <div class="gc-dms-list">
          ${groupDms.map(d => `
            <button type="button" class="gc-dm-item" data-channel="${d.channel_id}" data-peer="${d.peer.id}">
              <strong>@${esc(d.peer.handle)}</strong>
              <span>${esc(previewText(d.last_message))}</span>
            </button>`).join('')}
        </div>` : ''}
    </div>`;
}

function renderGroupShell() {
  const g = activeGroup;
  const observerBanner = g?.is_observer
    ? '<div class="gc-observer-banner">Режим перегляду — ви бачите чат і рейтинг для тестування</div>'
    : '';

  const dmBack = dmMode && activeMeta?.type === 'dm'
    ? `<button type="button" class="btn btn--ghost btn--sm ico-inline" id="gc-back-group">${icon('chevron-left', 'ico ico--sm')}До групи</button>`
    : '';

  const headTitle = dmMode && activeMeta?.type === 'dm'
    ? `@${esc(activeMeta.peerHandle)}`
    : esc(g?.name || '');

  const headSub = dmMode && activeMeta?.type === 'dm'
    ? esc(activeMeta.peerName || 'Особистий чат')
    : esc(g?.program_name || '');

  return `
    ${observerBanner}
    <div class="gc-chat-head">
      <div>
        ${dmBack}
        <h2>${headTitle}</h2>
        <div class="gc-head-sub">${headSub}</div>
      </div>
      ${!dmMode ? `
        <nav class="gc-tabs">
          <button type="button" class="gc-tab${activeTab === 'chat' ? ' active' : ''}" data-tab="chat">Чат групи</button>
          <button type="button" class="gc-tab${activeTab === 'ranking' ? ' active' : ''}" data-tab="ranking">Рейтинг</button>
          <button type="button" class="gc-tab${activeTab === 'members' ? ' active' : ''}" data-tab="members">Учасники</button>
        </nav>` : ''}
    </div>
    <div class="gc-panel" id="gc-panel"></div>`;
}

function renderPanelContent(messages = []) {
  const panel = document.getElementById('gc-panel');
  if (!panel) return;

  if (dmMode || activeTab === 'chat') {
    panel.className = 'gc-panel gc-panel--chat';
    panel.innerHTML = `
      <div class="gc-messages" id="gc-messages">${messages.map(renderMessage).join('')}</div>
      ${renderCompose()}`;
    const messagesEl = document.getElementById('gc-messages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    bindCompose();
    return;
  }

  if (activeTab === 'ranking') {
    panel.className = 'gc-panel gc-panel--ranking';
    panel.innerHTML = renderRankingTable(rankingData);
    return;
  }

  if (activeTab === 'members') {
    panel.className = 'gc-panel gc-panel--members';
    panel.innerHTML = renderMembersPanel(activeMeta?.members || []);
    bindMembersEvents();
  }
}

function bindMembersEvents() {
  document.querySelectorAll('.gc-member-card').forEach(btn => {
    btn.addEventListener('click', () => startDm(parseInt(btn.dataset.uid, 10)));
  });
  document.querySelectorAll('.gc-dm-item').forEach(btn => {
    btn.addEventListener('click', () => {
      openDm(parseInt(btn.dataset.channel, 10), parseInt(btn.dataset.peer, 10));
    });
  });
}

function bindGroupShellEvents() {
  document.querySelectorAll('.gc-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  document.getElementById('gc-back-group')?.addEventListener('click', () => {
    dmMode = false;
    switchTab('chat');
  });
}

async function switchTab(tab) {
  activeTab = tab;
  dmMode = false;
  history.replaceState(null, '', `?group=${activeGroupId}&tab=${tab}`);

  if (tab === 'ranking') {
    rankingData = await api(`/chat/groups/${activeGroupId}/ranking`);
  }
  if (tab === 'members') {
    const { dms } = await api(`/chat/groups/${activeGroupId}/dms`);
    groupDms = dms;
  }
  if (tab === 'chat') {
    const data = await api(`/chat/groups/${activeGroupId}`);
    activeChannel = data.channel.id;
    activeMeta = { ...activeMeta, members: data.members };
    socket.emit('chat:join', { channelId: activeChannel });
    document.getElementById('gc-main').innerHTML = renderGroupShell();
    bindGroupShellEvents();
    renderPanelContent(data.messages);
    renderSidebar();
    return;
  }

  document.getElementById('gc-main').innerHTML = renderGroupShell();
  bindGroupShellEvents();
  renderPanelContent();
  renderSidebar();
}

function appendMessage(m) {
  const el = document.getElementById('gc-messages');
  if (!el) return;
  el.insertAdjacentHTML('beforeend', renderMessage(m));
  el.scrollTop = el.scrollHeight;
}

function sendPayload(payload) {
  if (!activeChannel) return;
  socket.emit('chat:send', payload);
}

async function openGroup(groupId, tab = 'chat') {
  activeGroupId = groupId;
  activeGroup = inbox.groups.find(g => g.id === groupId);
  activeTab = tab;
  dmMode = false;

  const [data, rankingRes, dmsRes] = await Promise.all([
    api(`/chat/groups/${groupId}`),
    api(`/chat/groups/${groupId}/ranking`).catch(() => null),
    api(`/chat/groups/${groupId}/dms`).catch(() => ({ dms: [] })),
  ]);

  rankingData = rankingRes;
  groupDms = dmsRes.dms || [];
  activeChannel = data.channel.id;
  activeMeta = {
    type: 'group',
    groupId,
    members: data.members,
    title: data.group.name,
    subtitle: data.group.program_name || '',
  };

  if (tab === 'chat') {
    socket.emit('chat:join', { channelId: activeChannel });
  }

  document.getElementById('gc-main').innerHTML = renderGroupShell();
  bindGroupShellEvents();
  renderPanelContent(tab === 'chat' ? data.messages : []);
  renderSidebar();
  history.replaceState(null, '', `?group=${groupId}&tab=${tab}`);
}

async function startDm(userId) {
  try {
    const data = await api('/chat/dm', { method: 'POST', body: JSON.stringify({ userId }) });
    await openDm(data.channel_id, userId, data.messages);
    const { dms } = await api(`/chat/groups/${activeGroupId}/dms`);
    groupDms = dms;
  } catch (err) {
    alert(err.message);
  }
}

async function openDm(channelId, peerId, messages = null) {
  let peer = groupDms.find(d => d.channel_id === channelId)?.peer;
  if (!peer) {
    const { users } = await api(`/chat/dm/candidates?groupId=${activeGroupId}`);
    peer = users.find(u => u.id === peerId);
  }
  if (!messages) {
    const res = await api(`/chat/channels/${channelId}/messages`);
    messages = res.messages;
  }

  dmMode = true;
  activeChannel = channelId;
  activeMeta = {
    type: 'dm',
    peerId,
    peerHandle: peer?.handle || 'user',
    peerName: peer?.name || '',
  };
  socket.emit('chat:join', { channelId });

  document.getElementById('gc-main').innerHTML = renderGroupShell();
  bindGroupShellEvents();
  renderPanelContent(messages);
}

socket.on('chat:joined', ({ messages }) => {
  const el = document.getElementById('gc-messages');
  if (el) {
    el.innerHTML = messages.map(renderMessage).join('');
    el.scrollTop = el.scrollHeight;
  }
});

socket.on('chat:message', (m) => {
  if (activeChannel && m.channel_id === activeChannel) appendMessage(m);
  loadInbox();
});
