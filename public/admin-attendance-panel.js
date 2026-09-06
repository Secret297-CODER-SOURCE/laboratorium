import { api } from '/auth.js';
import { icon } from '/icons.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmtLessonDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('uk-UA', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDur(seconds) {
  if (!seconds) return '0 хв';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} год ${rm} хв` : `${h} год`;
}

const STATUS_LABELS = { present: 'Присутній', partial: 'Частково', absent: 'Відсутній' };
const STATUS_PILL_CLASS = { present: 'approved', partial: 'pending', absent: 'rejected' };

export async function loadAttendanceData(groupFilter = '') {
  const gid = groupFilter || 'all';
  try {
    const { conferences } = await api(`/admin/attendance/groups/${gid}`);
    return { conferences: conferences || [] };
  } catch {
    return { conferences: [] };
  }
}

export async function loadConferenceAttendance(conferenceId) {
  return api(`/admin/attendance/conferences/${conferenceId}`);
}

function renderConferenceRow(c, active) {
  return `<article class="attend-conf-row${active ? ' active' : ''}" data-id="${c.id}">
    <div>
      <strong>${esc(c.title)}</strong>
      <div class="sched-lesson-meta">${fmtLessonDate(c.scheduled_at)}${c.group_name ? ' · ' + esc(c.group_name) : ''}</div>
    </div>
    <div class="attend-conf-counts">
      <span class="status-pill approved" title="Присутні">${c.summary?.present || 0}</span>
      <span class="status-pill pending" title="Частково">${c.summary?.partial || 0}</span>
      <span class="status-pill rejected" title="Відсутні">${c.summary?.absent || 0}</span>
      ${c.has_recording ? `<span class="status-pill" title="Дивилися запис">${icon('video', 'ico ico--sm')}${c.summary?.watched_recording || 0}</span>` : ''}
    </div>
  </article>`;
}

function renderConferenceDetail(detail) {
  if (!detail) return '<p class="empty-state">Оберіть конференцію зліва</p>';
  const { conference, students = [], summary = {}, has_recording } = detail;

  return `
    <h3>${esc(conference.title)}</h3>
    <div class="sched-lesson-meta">${fmtLessonDate(conference.scheduled_at)} · ${conference.duration_minutes} хв${conference.group_name ? ' · ' + esc(conference.group_name) : ''}</div>
    <div class="attend-summary">
      <span class="status-pill approved">Присутні: ${summary.present || 0}</span>
      <span class="status-pill pending">Частково: ${summary.partial || 0}</span>
      <span class="status-pill rejected">Відсутні: ${summary.absent || 0}</span>
      ${has_recording ? `<span class="status-pill">Дивилися запис: ${summary.watched_recording || 0}</span>` : ''}
    </div>
    ${students.length ? `<table class="admin-table">
      <thead><tr><th>Учень</th><th>Статус</th><th>Був у мережі</th><th>Не був на вкладці</th><th>Перемикань</th><th>Запис</th></tr></thead>
      <tbody>${students.map(s => `
        <tr>
          <td>@${esc(s.handle)}</td>
          <td><span class="status-pill ${STATUS_PILL_CLASS[s.status] || ''}">${STATUS_LABELS[s.status] || s.status} · ${s.attendance_pct}%</span></td>
          <td>${fmtDur(s.present_seconds)}</td>
          <td>${s.away_seconds ? fmtDur(s.away_seconds) : '—'}</td>
          <td>${s.switch_count || '—'}</td>
          <td>${s.recording_watch ? `${s.recording_watch.pct}%${s.recording_watch.completed ? ` ${icon('check', 'ico ico--sm')}` : ''}` : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p class="empty-state">У цій конференції ще немає учасників групи</p>'}
  `;
}

export function renderAttendancePanel(groups, data = {}, groupFilter = '', detail = null, selectedId = '') {
  const { conferences = [] } = data;
  const groupOpts = (groups || []).map(g =>
    `<option value="${g.id}"${String(g.id) === String(groupFilter) ? ' selected' : ''}>${esc(g.name)}</option>`).join('');

  const list = conferences.length
    ? conferences.map(c => renderConferenceRow(c, String(c.id) === String(selectedId))).join('')
    : '<p class="empty-state">Конференцій ще не було</p>';

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('video', 'ico ico--md')}Відвідуваність</h2>
      <select class="admin-inp" id="attend-group-filter" style="width:auto;min-width:160px">
        <option value=""${!groupFilter ? ' selected' : ''}>Усі групи</option>${groupOpts}
      </select>
    </div>
    <div class="attend-layout">
      <div class="attend-list" id="attend-conf-list">${list}</div>
      <div class="attend-detail" id="attend-detail">${renderConferenceDetail(detail)}</div>
    </div>
  </section>`;
}

let attendanceEventsBound = false;

export function bindAttendancePanelEvents(reload) {
  if (attendanceEventsBound) return;
  attendanceEventsBound = true;

  document.addEventListener('change', (e) => {
    if (e.target?.id !== 'attend-group-filter') return;
    const url = new URL(location.href);
    if (e.target.value) url.searchParams.set('groupId', e.target.value);
    else url.searchParams.delete('groupId');
    url.searchParams.delete('conferenceId');
    history.replaceState(null, '', url);
    reload();
  });

  document.addEventListener('click', (e) => {
    const row = e.target.closest('.attend-conf-row');
    if (!row) return;
    const url = new URL(location.href);
    url.searchParams.set('conferenceId', row.dataset.id);
    history.replaceState(null, '', url);
    reload();
  });
}
