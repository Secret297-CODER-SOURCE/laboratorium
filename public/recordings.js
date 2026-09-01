import { api, initTheme, requireAuthAsync, getToken } from '/auth.js';
import { icon, initNavIcons } from '/icons.js';
import { initSiteHeader, refreshAppNav } from '/site-header.js';
import { loadTabAccess, pageAllowed } from '/tab-access.js';
import { showConfirm, showPrompt } from '/dialog.js';

initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });
initNavIcons();
if (!(await requireAuthAsync())) throw new Error('auth');

(async () => {
  await loadTabAccess();
  refreshAppNav();
  if (!pageAllowed('page.recordings')) {
    window.location.replace('/portal.html');
    return;
  }
  load();
})();

const TOKEN = getToken();
let recordings = [];
let currentRecordingId = null;
let player = null;

function playableRecordings() {
  return recordings.filter(r => r.has_file);
}

function setEmptyView(message, hint) {
  document.getElementById('empty-state').hidden = false;
  document.getElementById('rec-layout').hidden = true;
  const empty = document.getElementById('empty-state');
  empty.querySelector('p').textContent = message;
  const hintEl = empty.querySelector('p + p');
  if (hintEl && hint) hintEl.textContent = hint;
}

async function load() {
  const { recordings: recs } = await api('/recordings');
  recordings = recs;

  if (!playableRecordings().length) {
    setEmptyView(
      recs.length ? 'Відеозаписів поки немає' : 'Записів поки немає',
      recs.length
        ? 'Запис конференції ще не завантажено або файл недоступний'
        : 'Записи з\'являться після конференцій із увімкненим записом',
    );
    initNavIcons();
    return;
  }

  document.getElementById('empty-state').hidden = true;
  document.getElementById('rec-layout').hidden = false;
  renderSidebar();

  const params = new URLSearchParams(location.search);
  const preselect = parseInt(params.get('id'), 10);
  const playable = playableRecordings();
  const initial = playable.find(r => r.id === preselect) || playable[0];
  if (initial) await loadRecording(initial.id);
}

function formatDuration(sec) {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatTimestamp(sec) {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderSidebar() {
  const playable = playableRecordings();
  document.getElementById('rec-sidebar').innerHTML = playable.map(r => `
    <div class="rec-card ${r.id === currentRecordingId ? 'active' : ''}" data-id="${r.id}">
      <h3>${r.title}</h3>
      <div class="rec-card-meta">
        ${r.conference_title ? `<span class="meta-icon">${icon('calendar', 'ico ico--sm')}${r.conference_title}</span>` : `<span class="meta-icon">${icon('upload', 'ico ico--sm')}Завантажено</span>`}
        <span class="meta-icon">${icon('clock', 'ico ico--sm')}${formatDuration(r.duration_seconds)}</span>
        <span class="meta-icon">${icon('notes', 'ico ico--sm')}${r.notes_count || 0}</span>
        <span class="meta-icon">${icon('calendar', 'ico ico--sm')}${new Date(r.created_at).toLocaleDateString('uk-UA')}</span>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.rec-card').forEach(card => {
    card.addEventListener('click', () => loadRecording(parseInt(card.dataset.id, 10)));
  });
}

function setPlayerVisible(visible) {
  document.getElementById('rec-player-wrap').hidden = !visible;
  document.getElementById('rec-no-video').hidden = visible;
  document.getElementById('note-timestamp').disabled = !visible;
  if (!visible) {
    player = document.getElementById('rec-player');
    player.removeAttribute('src');
    player.load();
  }
}

async function loadRecording(id) {
  currentRecordingId = id;
  renderSidebar();

  const { recording, notes } = await api(`/recordings/${id}`);
  const hasFile = !!recording.has_file;

  document.getElementById('rec-detail').hidden = false;
  document.getElementById('rec-title').textContent = recording.title;
  document.getElementById('rec-meta').innerHTML = `
    ${recording.conference_title ? `<span class="meta-icon">${icon('calendar', 'ico ico--sm')}${recording.conference_title}</span>` : ''}
    <span class="meta-icon">${icon('clock', 'ico ico--sm')}${formatDuration(recording.duration_seconds)}</span>
    <span class="meta-icon">${icon('user', 'ico ico--sm')}@${recording.uploader_handle}</span>
    <span class="meta-icon">${icon('calendar', 'ico ico--sm')}${new Date(recording.created_at).toLocaleDateString('uk-UA')}</span>
    <span class="meta-icon">${icon('database', 'ico ico--sm')}${recording.file_size ? Math.round(recording.file_size / 1024 / 1024) + ' МБ' : '—'}</span>`;

  if (hasFile) {
    setPlayerVisible(true);
    player = document.getElementById('rec-player');
    player.src = `/api/recordings/${id}/stream`;
    player.load();
  } else {
    setPlayerVisible(false);
    initNavIcons();
  }

  renderNotes(notes);
}

function renderNotes(notes) {
  document.getElementById('notes-count').textContent = `${notes.length} нотаток`;

  document.getElementById('notes-list').innerHTML = notes.map(n => `
    <div class="note-item ${n.is_pinned ? 'pinned' : ''}" id="note-${n.id}">
      <div class="note-top">
        <div style="display:flex;gap:8px;align-items:center">
          ${n.timestamp_seconds != null
            ? `<span class="note-timestamp" data-sec="${n.timestamp_seconds}">${formatTimestamp(n.timestamp_seconds)}</span>`
            : `<span class="note-no-ts">${icon('clock', 'ico ico--xs')}без таймкоду</span>`}
          ${n.is_pinned ? `<span class="note-pin-icon">${icon('pin', 'ico ico--sm')}</span>` : ''}
        </div>
        <span class="note-author">@${n.author_handle}</span>
      </div>
      <div class="note-content" id="note-content-${n.id}">${escapeHtml(n.content)}</div>
      <div class="note-actions">
        <button data-action="pin" data-id="${n.id}" data-pinned="${n.is_pinned}" class="ico-inline">${icon('pin', 'ico ico--sm')}${n.is_pinned ? 'Відкріпити' : 'Закріпити'}</button>
        <button data-action="edit" data-id="${n.id}" class="ico-inline">${icon('edit', 'ico ico--sm')}Редагувати</button>
        <button data-action="delete" data-id="${n.id}" class="ico-inline note-delete">${icon('trash', 'ico ico--sm')}Видалити</button>
      </div>
    </div>`).join('') || '<p class="empty-state" style="text-align:center;color:var(--text-dim);padding:20px">Нотаток поки немає</p>';

  document.querySelectorAll('.note-timestamp').forEach(ts => {
    ts.addEventListener('click', () => {
      if (player && player.src) {
        player.currentTime = parseFloat(ts.dataset.sec);
        player.play();
      }
    });
  });

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleNoteAction(btn.dataset.action, parseInt(btn.dataset.id, 10), btn));
  });
}

async function handleNoteAction(action, noteId, btn) {
  if (action === 'delete') {
    if (!(await showConfirm('Видалити нотатку?', { danger: true }))) return;
    await api(`/recordings/${currentRecordingId}/notes/${noteId}`, { method: 'DELETE' });
    await refreshNotes();
  } else if (action === 'pin') {
    const isPinned = btn.dataset.pinned === '1' || btn.dataset.pinned === 'true';
    await api(`/recordings/${currentRecordingId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPinned: !isPinned }),
    });
    await refreshNotes();
  } else if (action === 'edit') {
    const contentEl = document.getElementById(`note-content-${noteId}`);
    const current = contentEl.textContent;
    const newContent = await showPrompt('Редагувати нотатку:', current, { multiline: true });
    if (newContent && newContent !== current) {
      await api(`/recordings/${currentRecordingId}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: newContent }),
      });
      await refreshNotes();
    }
  }
}

async function refreshNotes() {
  const { notes } = await api(`/recordings/${currentRecordingId}/notes`);
  renderNotes(notes);
  recordings = recordings.map(r => r.id === currentRecordingId ? { ...r, notes_count: notes.length } : r);
  renderSidebar();
}

document.getElementById('add-note-btn').addEventListener('click', async () => {
  const content = document.getElementById('note-input').value.trim();
  if (!content || !currentRecordingId) return;

  const isPinned = document.getElementById('note-pin').checked;
  const useTimestamp = document.getElementById('note-timestamp').checked;
  const timestampSeconds = useTimestamp && player?.src ? player.currentTime : null;

  await api(`/recordings/${currentRecordingId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content, isPinned, timestampSeconds }),
  });

  document.getElementById('note-input').value = '';
  await refreshNotes();
});

document.getElementById('note-input').addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') document.getElementById('add-note-btn').click();
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
