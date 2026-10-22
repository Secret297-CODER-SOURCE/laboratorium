import { api, getToken, getUser, requireUnrestrictedAsync, initTheme } from '/auth.js';
import { icon, initNavIcons } from '/icons.js';
import { initSiteHeader, refreshAppNav } from '/site-header.js';
import { loadTabAccess, pageAllowed } from '/tab-access.js';
import { showAlert } from '/dialog.js';
import { NFT_STICKERS, STICKER_THEMES, renderNftSticker } from '/chat-stickers.js';

if (!(await requireUnrestrictedAsync())) throw new Error('auth');
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

const GIF_HISTORY_KEY = 'lab-gif-history';
const GIF_HISTORY_LIMIT = 5;

function readGifHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(GIF_HISTORY_KEY) || '[]');
    return Array.isArray(list) ? list.filter((url) => typeof url === 'string').slice(0, GIF_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberGif(url) {
  if (!url) return;
  const next = [url, ...readGifHistory().filter((item) => item !== url)].slice(0, GIF_HISTORY_LIMIT);
  try { localStorage.setItem(GIF_HISTORY_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
}

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
    const emoji = m.body?.startsWith('emoji:') ? m.body.slice(6) : null;
    const nftId = m.body?.startsWith('nft:') ? m.body.slice(4) : null;
    content = nftId
      ? renderNftSticker(nftId)
      : stickerName
      ? `<div class="gc-msg-sticker">${icon(stickerName, 'ico ico--xl')}</div>`
      : m.attachment_url
        ? `<div class="gc-msg-sticker-image"><img src="${esc(m.attachment_url)}" alt="Стікер" loading="lazy"></div>`
        : emoji
          ? `<div class="gc-msg-emoji-sticker">${esc(emoji)}</div>`
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
  const stickerPanel = document.getElementById('sticker-panel');
  const gifPopover = document.getElementById('gif-popover');
  const stickerButton = document.getElementById('toggle-stickers');
  const gifButton = document.getElementById('send-gif-btn');

  function closePanels() {
    stickerPanel?.classList.remove('open');
    stickerButton?.setAttribute('aria-expanded', 'false');
    if (gifPopover) gifPopover.hidden = true;
    gifButton?.setAttribute('aria-expanded', 'false');
  }

  stickerButton?.addEventListener('click', () => {
    const willOpen = !stickerPanel.classList.contains('open');
    closePanels();
    stickerPanel.classList.toggle('open', willOpen);
    stickerButton.setAttribute('aria-expanded', String(willOpen));
  });

  document.querySelectorAll('.gc-sticker-category').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.gc-sticker-category').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('.gc-sticker-group').forEach((group) => {
        group.hidden = group.dataset.category !== button.dataset.category;
      });
    });
  });

  document.querySelectorAll('.gc-sticker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sendPayload({ msg_type: 'sticker', body: btn.dataset.sticker });
      closePanels();
    });
  });

  function renderGifHistory() {
    const list = document.getElementById('gif-history');
    if (!list) return;
    const history = readGifHistory();
    list.innerHTML = history.length
      ? history.map((url) => `<button type="button" class="gc-gif-thumb" data-gif-url="${esc(url)}" aria-label="Надіслати GIF ще раз"><img src="${esc(url)}" alt="" loading="lazy"></button>`).join('')
      : '<p class="gc-gif-empty">Тут з’являться ваші останні GIF</p>';
    list.querySelectorAll('[data-gif-url]').forEach((thumb) => {
      thumb.addEventListener('click', async () => {
        closePanels();
        await sendPayload({ msg_type: 'gif', attachment_url: thumb.dataset.gifUrl });
      });
    });
  }

  gifButton?.addEventListener('click', () => {
    const willOpen = gifPopover.hidden;
    closePanels();
    if (!willOpen) return;
    renderGifHistory();
    gifPopover.hidden = false;
    gifButton.setAttribute('aria-expanded', 'true');
    document.getElementById('gif-input')?.focus();
  });

  async function sendGifFromInput() {
    const field = document.getElementById('gif-input');
    const url = field?.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { await showAlert('Вставте GIF із буфера або посилання, що починається з https://'); return; }
    field.value = '';
    closePanels();
    rememberGif(url);
    await sendPayload({ msg_type: 'gif', attachment_url: url });
  }

  document.getElementById('gif-send')?.addEventListener('click', sendGifFromInput);
  document.getElementById('gif-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendGifFromInput(); }
  });
  document.getElementById('gif-input')?.addEventListener('paste', async (event) => {
    const file = [...(event.clipboardData?.items || [])]
      .find((item) => item.kind === 'file' && /^(image|video)\//.test(item.type))?.getAsFile();
    if (!file) return;
    event.preventDefault();
    closePanels();
    await uploadChatFile(file);
  });
  document.getElementById('gif-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    closePanels();
    if (file) await uploadChatFile(file);
    e.target.value = '';
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.gc-compose')) closePanels();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanels();
  });

  async function uploadChatFile(file, { asSticker = false } = {}) {
    if (!file || (!file.type.startsWith('image/') && !file.type.startsWith('video/'))) {
      throw new Error('Можна надіслати лише зображення або відео');
    }
    if (file.size > 50 * 1024 * 1024) throw new Error('Максимальний розмір файлу — 50 МБ');
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
      if (file.type === 'image/gif' || data.msg_type === 'gif') rememberGif(data.url);
      await sendPayload({
        msg_type: asSticker && data.msg_type === 'image' ? 'sticker' : data.msg_type,
        attachment_url: data.url,
      });
    } catch (err) {
      await showAlert(err.message);
    }
  }

  document.getElementById('media-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await uploadChatFile(file);
    e.target.value = '';
  });

  document.getElementById('gc-input')?.addEventListener('paste', async (event) => {
    const file = [...(event.clipboardData?.items || [])]
      .find((item) => item.kind === 'file' && /^(image|video)\//.test(item.type))
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    await uploadChatFile(file, { asSticker: file.type.startsWith('image/') && file.type !== 'image/gif' });
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
        <button type="button" class="gc-tool-btn" id="toggle-stickers" aria-expanded="false">Стікери</button>
        <div class="gc-gif-wrap">
          <button type="button" class="gc-tool-btn" id="send-gif-btn" aria-expanded="false" aria-haspopup="dialog">GIF</button>
          <div class="gc-gif-popover" id="gif-popover" role="dialog" aria-label="GIF" hidden>
            <div class="gc-gif-head"><strong>GIF</strong><span>5 останніх</span></div>
            <div class="gc-gif-history" id="gif-history"></div>
            <div class="gc-gif-add">
              <input type="text" id="gif-input" class="gc-gif-input" autocomplete="off" placeholder="Ctrl/Cmd+V — вставити GIF або посилання">
              <button type="button" class="btn btn--primary btn--sm" id="gif-send">Надіслати</button>
            </div>
            <label class="gc-gif-upload">Вибрати файл<input type="file" id="gif-file" accept="image/gif,image/*,video/*" hidden></label>
          </div>
        </div>
        <label class="gc-tool-btn" style="cursor:pointer">
          Фото/відео
          <input type="file" id="media-file" accept="image/*,video/*" hidden>
        </label>
      </div>
      <div class="gc-sticker-panel" id="sticker-panel">
        <div class="gc-sticker-categories" role="tablist" aria-label="Категорії стікерів">
          ${STICKER_THEMES.map((theme, index) => `<button type="button" class="gc-sticker-category${index === 0 ? ' active' : ''}" data-category="${theme.id}" role="tab" aria-selected="${index === 0}">${theme.label}</button>`).join('')}
        </div>
        ${STICKER_THEMES.map((theme, index) => `
          <div class="gc-sticker-group" data-category="${theme.id}"${index ? ' hidden' : ''}>
            ${NFT_STICKERS.filter((sticker) => sticker.theme === theme.id).map((sticker) => `<button type="button" class="gc-sticker-btn" data-sticker="nft:${sticker.id}" aria-label="${sticker.title}">${renderNftSticker(sticker.id, { mini: true })}</button>`).join('')}
          </div>`).join('')}
      </div>
      <div class="gc-compose-row">
        <input type="text" id="gc-input" placeholder="Повідомлення... (можна вставити зображення)" maxlength="2000">
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
    await showAlert(err.message);
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
