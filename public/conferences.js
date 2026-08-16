import { api, initTheme, requireAuthAsync, getUser } from '/auth.js';
import { isAdminUser } from '/roles.js';
import { icon, initNavIcons } from '/icons.js';
import { initSiteHeader, refreshAppNav } from '/site-header.js';
import { loadTabAccess, pageAllowed } from '/tab-access.js';
import { initNumberInputs } from '/number-inputs.js';

initTheme();
initNumberInputs();
initSiteHeader({ showLogout: true, navMode: 'app' });
initNavIcons();
if (!(await requireAuthAsync())) throw new Error('auth');

(async () => {
  await loadTabAccess();
  refreshAppNav();
  if (!pageAllowed('page.conferences')) {
    window.location.replace('/portal.html');
    return;
  }
  loadConferences();
  loadPrograms();
  loadGroups();
})();

const MONTHS = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const DAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let allConferences = [];
let teacherRequiresGroup = false;

async function loadConferences() {
  const { conferences } = await api('/conferences');
  allConferences = conferences;
  renderCalendar();
  renderUpcoming();
  renderAll();
}

async function loadGroups() {
  const user = getUser();
  if (!isAdminUser(user)) {
    document.getElementById('create-conf-btn').hidden = true;
    return;
  }
  teacherRequiresGroup = user.role === 'teacher';
  try {
    const { groups } = await api(user.role === 'teacher' ? '/admin/groups' : '/admin/groups?all=1');
    const sel = document.getElementById('group-select');
    const quickSel = document.getElementById('quick-group-select');
    (groups || []).forEach(g => {
      const opt = `<option value="${g.id}">${g.name}</option>`;
      sel.insertAdjacentHTML('beforeend', opt);
      quickSel.insertAdjacentHTML('beforeend', opt);
    });
    if (!teacherRequiresGroup) {
      document.getElementById('quick-group-label').hidden = true;
      quickSel.removeAttribute('required');
    } else {
      quickSel.required = true;
    }
  } catch {
    document.getElementById('create-conf-btn').hidden = true;
  }
}

function formatDateRu(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function statusLabel(s) {
  if (s === 'live') return `<span class="live-dot">${icon('live', 'ico ico--sm')} LIVE</span>`;
  const map = { scheduled: 'запланована', ended: 'завершена', cancelled: 'скасована' };
  return map[s] || s;
}

function confCardHTML(c) {
  const d = new Date(c.scheduled_at);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()].slice(0,3).toUpperCase();
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const canJoin = c.status === 'scheduled' || c.status === 'live';

  return `
  <article class="conf-card" data-id="${c.id}">
    <div class="conf-date-block">
      <span class="conf-date-day">${day}</span>
      <span class="conf-date-month">${month}</span>
    </div>
    <div>
      <h3>${c.title}</h3>
      <div class="conf-meta">
        <span class="meta-icon">${icon('clock', 'ico ico--sm')}${time} · ${c.duration_minutes} хв</span>
        <span class="meta-icon">${icon('user', 'ico ico--sm')}${c.host_handle || c.host_name}</span>
        ${c.program_name ? `<span class="meta-icon">${icon('book', 'ico ico--sm')}${c.program_name}</span>` : ''}
        ${c.group_name ? `<span class="meta-icon">${icon('users', 'ico ico--sm')}${c.group_name}</span>` : ''}
        ${c.participant_count !== undefined ? `<span class="meta-icon">${icon('users', 'ico ico--sm')}${c.participant_count}</span>` : ''}
        ${c.recording_enabled ? `<span class="meta-icon">${icon('record', 'ico ico--sm')}Запис</span>` : ''}
      </div>
    </div>
    <div class="conf-actions">
      <span class="conf-status ${c.status}">${statusLabel(c.status)}</span>
      ${canJoin ? `<a href="/room.html?id=${c.id}" class="btn btn--primary btn--sm">Увійти</a>` : ''}
    </div>
  </article>`;
}

function renderCalendar() {
  document.getElementById('cal-title').textContent = `${MONTHS[calMonth]} ${calYear}`;

  const first = new Date(calYear, calMonth, 1);
  const last = new Date(calYear, calMonth + 1, 0);
  let startDow = (first.getDay() + 6) % 7;

  let html = DAYS_SHORT.map(d => `<div class="cal-day-label">${d}</div>`).join('');

  const today = new Date();

  for (let i = 0; i < startDow; i++) {
    const d = new Date(calYear, calMonth, -startDow + 1 + i);
    html += `<div class="cal-day other-month"><div class="cal-day-num">${d.getDate()}</div></div>`;
  }

  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(calYear, calMonth, d);
    const isToday = date.toDateString() === today.toDateString();
    const dayConfs = allConferences.filter(c => {
      const cd = new Date(c.scheduled_at);
      return cd.getFullYear() === calYear && cd.getMonth() === calMonth && cd.getDate() === d;
    });

    const events = dayConfs.map(c =>
      `<a class="cal-event ${c.status}" href="/room.html?id=${c.id}" title="${c.title}">
        ${String(new Date(c.scheduled_at).getHours()).padStart(2,'0')}:${String(new Date(c.scheduled_at).getMinutes()).padStart(2,'0')} ${c.title}
      </a>`
    ).join('');

    html += `<div class="cal-day ${isToday ? 'today' : ''}">
      <div class="cal-day-num">${d}</div>
      ${events}
    </div>`;
  }

  const remaining = 42 - startDow - last.getDate();
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`;
  }

  document.getElementById('calendar-grid').innerHTML = html;
}

function renderUpcoming() {
  const upcoming = allConferences
    .filter(c => (c.status === 'scheduled' || c.status === 'live') && new Date(c.scheduled_at) >= new Date(Date.now() - 3600000))
    .slice(0, 10);

  document.getElementById('upcoming-list').innerHTML = upcoming.length
    ? upcoming.map(confCardHTML).join('')
    : '<p class="empty-state" style="padding:40px;text-align:center;color:var(--text-dim)">Немає майбутніх конференцій</p>';
}

function renderAll() {
  document.getElementById('all-list').innerHTML = allConferences.length
    ? allConferences.map(confCardHTML).join('')
    : '<p class="empty-state" style="padding:40px;text-align:center;color:var(--text-dim)">Конференцій поки немає</p>';
}

document.querySelectorAll('.conf-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.conf-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-calendar').hidden = true;
    document.getElementById('tab-upcoming').hidden = true;
    document.getElementById('tab-all').hidden = true;
    const tab = btn.dataset.tab;
    document.getElementById(`tab-${tab}`).hidden = false;
  });
});

document.getElementById('cal-prev').addEventListener('click', () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});

document.getElementById('cal-next').addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

const modal = document.getElementById('create-modal');
const stepChoice = document.getElementById('create-step-choice');
const stepPlanned = document.getElementById('create-step-planned');
const stepQuick = document.getElementById('create-step-quick');

function showCreateStep(step) {
  stepChoice.hidden = step !== 'choice';
  stepPlanned.hidden = step !== 'planned';
  stepQuick.hidden = step !== 'quick';
}

function openCreateModal() {
  showCreateStep('choice');
  modal.hidden = false;
}

function closeCreateModal() {
  modal.hidden = true;
  showCreateStep('choice');
  document.getElementById('create-error').hidden = true;
  document.getElementById('quick-error').hidden = true;
}

document.getElementById('create-conf-btn').addEventListener('click', openCreateModal);

document.getElementById('choose-planned').addEventListener('click', () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  document.querySelector('#create-form [name="scheduledAt"]').value =
    now.toISOString().slice(0, 16);
  showCreateStep('planned');
});

document.getElementById('choose-quick').addEventListener('click', () => {
  showCreateStep('quick');
});

document.getElementById('back-from-planned').addEventListener('click', () => showCreateStep('choice'));
document.getElementById('back-from-quick').addEventListener('click', () => showCreateStep('choice'));

document.getElementById('cancel-modal').addEventListener('click', closeCreateModal);
document.getElementById('cancel-planned').addEventListener('click', closeCreateModal);
document.getElementById('cancel-quick').addEventListener('click', closeCreateModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeCreateModal(); });

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('create-error');
  const btn = e.target.querySelector('[type="submit"]');
  const fd = new FormData(e.target);

  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Створення...';

  try {
    const body = {
      title: fd.get('title'),
      description: fd.get('description') || undefined,
      scheduledAt: new Date(fd.get('scheduledAt')).toISOString(),
      durationMinutes: parseInt(fd.get('durationMinutes'), 10),
      maxParticipants: parseInt(fd.get('maxParticipants'), 10),
      programId: fd.get('programId') ? parseInt(fd.get('programId'), 10) : null,
      groupId: parseInt(fd.get('groupId'), 10),
      recordingEnabled: fd.get('recordingEnabled') === 'on',
    };

    await api('/conferences', { method: 'POST', body: JSON.stringify(body) });
    closeCreateModal();
    e.target.reset();
    await loadConferences();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Створити';
  }
});

document.getElementById('quick-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('quick-error');
  const btn = e.target.querySelector('[type="submit"]');
  const fd = new FormData(e.target);

  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Створення...';

  try {
    const groupId = fd.get('groupId');
    const body = {
      title: (fd.get('title') || '').trim() || 'Швидка конференція',
      scheduledAt: new Date().toISOString(),
      durationMinutes: 120,
      maxParticipants: 30,
      programId: null,
      recordingEnabled: fd.get('recordingEnabled') === 'on',
    };
    if (groupId) body.groupId = parseInt(groupId, 10);

    const { conference } = await api('/conferences', { method: 'POST', body: JSON.stringify(body) });
    window.location.href = `/room.html?id=${conference.id}`;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Створити та увійти';
  }
});

async function loadPrograms() {
  const { programs } = await api('/programs');
  const sel = document.getElementById('program-select');
  programs.forEach(p => {
    sel.insertAdjacentHTML('beforeend', `<option value="${p.id}">${p.name}</option>`);
  });
}
