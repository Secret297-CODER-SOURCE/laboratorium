import {
  api, getUser, clearSession, requireAuthAsync, handleSessionError, initTheme,
} from '/auth.js';
import { icon } from '/icons.js';
import { initSiteHeader, setAppNavActive } from '/site-header.js';
import { showConfirm, showCopyDialog } from '/dialog.js';
import {
  renderOwnerTabs, renderDirectionsPanel, renderProgramsPanel,
  renderUsersPanelExtended, renderProxmoxPanel, bindOwnerPanelEvents,
} from '/admin-owner-panel.js';
import {
  renderAccessPanel, bindAccessPanelEvents, loadAccessAdminData,
} from '/admin-access-panel.js';
import {
  renderBillingPanel, bindBillingPanelEvents, loadBillingAdminData,
} from '/admin-billing-panel.js';
import {
  renderTeacherTabs, renderGroupsPanel, bindGroupsPanelEvents,
  renderTasksPanel, bindTasksPanelEvents,
} from '/admin-groups-panel.js';
import {
  renderSchedulePanel, bindSchedulePanelEvents, loadScheduleData,
} from '/admin-schedule-panel.js';
import {
  renderCtfPanel, bindCtfPanelEvents, loadCtfAdminData,
} from '/admin-ctf-panel.js';
import {
  renderQuizzesPanel, bindQuizzesPanelEvents, loadQuizzesAdminData,
} from '/admin-quiz-panel.js';
import {
  renderStatsPanel, bindStatsPanelEvents, loadStatsAdminData,
} from '/admin-stats-panel.js';
import {
  renderStoragePanel, bindStoragePanelEvents, loadStorageAdminData,
} from '/admin-storage-panel.js';
import {
  renderLabsPanel, bindLabsPanelEvents,
} from '/admin-labs-panel.js';
import {
  renderManualsPanel, bindManualsPanelEvents, loadManualsAdminData,
} from '/admin-manuals-panel.js';
import { initNumberInputs } from '/number-inputs.js';

if (!(await requireAuthAsync())) throw new Error('auth');
initTheme();
initNumberInputs();
initSiteHeader({
  showLogout: true,
  navMode: 'app',
});

const user = getUser();
const ADMIN_ROLES = ['teacher', 'owner', 'developer'];

if (!ADMIN_ROLES.includes(user?.role)) {
  window.location.href = '/portal.html';
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast--${type}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

function renderNav() {
  setAppNavActive(location.pathname);
}

const TITLES = {
  developer: 'Панель розробника',
  owner: 'Панель адміністратора',
  teacher: 'Панель викладача',
};

let ownerTab = new URLSearchParams(location.search).get('tab') || 'overview';
let teacherTab = new URLSearchParams(location.search).get('tab') || 'overview';
let teacherTasksData = { tasks: [], reviewQueue: [] };
let scheduleData = { lessons: [], absences: [], stats: {} };
let ctfAdminData = { challenges: [], programs: [] };
let quizzesAdminData = { quizzes: [] };
let statsAdminData = null;
let storageAdminData = { servers: [], assets: [] };
let labsAdminData = [];
let manualsAdminData = { manuals: [], directions: [] };
let adminLoadSeq = 0;

function isScheduleTab(role) {
  return (role === 'owner' && ownerTab === 'schedule') || (role === 'teacher' && teacherTab === 'schedule');
}

function showAdminLoading(message = 'Завантаження...') {
  const el = document.getElementById('admin-content');
  if (!el) return;
  const tabs = getUser()?.role === 'owner'
    ? renderOwnerTabs(ownerTab)
    : getUser()?.role === 'teacher'
      ? renderTeacherTabs(teacherTab)
      : '';
  el.innerHTML = `${tabs}<p class="empty-state sched-loading">${message}</p>`;
}

async function loadScheduleView(role) {
  const seq = ++adminLoadSeq;
  document.getElementById('admin-title').textContent = TITLES[role] || 'Панель керування';
  renderNav(role);
  showAdminLoading('Завантаження розкладу...');

  try {
    const gf = new URLSearchParams(location.search).get('groupId') || '';
    const groupsRes = await api(role === 'owner' ? '/admin/groups?all=1' : '/admin/groups');
    if (seq !== adminLoadSeq) return;
    const schedGroups = groupsRes.groups || [];
    window.__scheduleGroups = schedGroups;
    scheduleData = await loadScheduleData(schedGroups, gf);
    if (seq !== adminLoadSeq) return;

    const el = document.getElementById('admin-content');
    const tabs = role === 'owner' ? renderOwnerTabs('schedule') : renderTeacherTabs('schedule');
    el.innerHTML = tabs + renderSchedulePanel(schedGroups, scheduleData, gf);
    bindTabHandlers(role);
    bindSchedulePanelEvents(showToast, () => loadScheduleView(role));
  } catch (err) {
    if (seq !== adminLoadSeq) return;
    const el = document.getElementById('admin-content');
    const tabs = role === 'owner' ? renderOwnerTabs('schedule') : renderTeacherTabs('schedule');
    el.innerHTML = `${tabs}<p class="empty-state">${err.message}</p>`;
    bindTabHandlers(role);
  }
}

async function load() {
  const role = getUser()?.role;
  if (role && isScheduleTab(role)) {
    return loadScheduleView(role);
  }

  const seq = ++adminLoadSeq;
  const { stats, applications, users, conferences, students, recordings, groups,
    nodeVersion, uptime, memoryMB, recentUsers, db, directions, programs } = await api('/admin/overview');
  if (seq !== adminLoadSeq) return;

  window.__ownerDirections = directions;
  window.__ownerPrograms = programs;

  document.getElementById('admin-title').textContent = TITLES[role] || 'Панель керування';
  renderNav(role);

  const el = document.getElementById('admin-content');
  let html = '';
  let panelPrograms = [];

  if (role === 'teacher') {
    try {
      const res = await api('/programs');
      panelPrograms = res.programs || [];
    } catch { /* ignore */ }
    if (teacherTab === 'tasks') {
      try {
        teacherTasksData = await api('/admin/tasks');
      } catch { teacherTasksData = { tasks: [], reviewQueue: [] }; }
    }
    if (teacherTab === 'schedule') {
      try {
        const gf = new URLSearchParams(location.search).get('groupId') || '';
        scheduleData = await loadScheduleData(groups, gf);
      } catch { scheduleData = { lessons: [], absences: [], stats: {} }; }
    }
    if (teacherTab === 'quizzes') {
      try {
        quizzesAdminData = await loadQuizzesAdminData(groups);
      } catch { quizzesAdminData = { quizzes: [] }; }
    }
    if (teacherTab === 'stats') {
      try {
        statsAdminData = await loadStatsAdminData();
      } catch { statsAdminData = { summary: {}, leaderboard: [], tasks: [], quizzes: [] }; }
    }
    if (teacherTab === 'ctf') {
      try {
        ctfAdminData = await loadCtfAdminData();
      } catch { ctfAdminData = { challenges: [], programs: [] }; }
    }
  }

  if (role === 'owner' && ownerTab === 'ctf') {
    try {
      ctfAdminData = await loadCtfAdminData();
    } catch { ctfAdminData = { challenges: [], programs: [] }; }
  }

  if (role === 'owner' && ownerTab === 'storage') {
    try {
      storageAdminData = await loadStorageAdminData();
    } catch { storageAdminData = { servers: [], assets: [] }; }
  }

  if (role === 'owner' && ownerTab === 'labs') {
    try {
      ({ labs: labsAdminData } = await api('/admin/labs'));
    } catch { labsAdminData = []; }
  }

  if (role === 'owner' && ownerTab === 'manuals') {
    try {
      manualsAdminData = await loadManualsAdminData();
    } catch { manualsAdminData = { manuals: [], directions: [] }; }
  }

  if (role === 'owner' && ownerTab === 'schedule') {
    try {
      const { groups: allGroups } = await api('/admin/groups?all=1');
      const gf = new URLSearchParams(location.search).get('groupId') || '';
      scheduleData = await loadScheduleData(allGroups || groups, gf);
      window.__scheduleGroups = allGroups || groups;
    } catch { scheduleData = { lessons: [], absences: [], stats: {} }; }
  }

  if (role === 'teacher') {
    html = renderTeacherTabs(teacherTab);
    if (teacherTab === 'overview') {
      html += `
      <div class="admin-stats">
        <div class="admin-stat"><span class="admin-stat-val">${groups?.length || 0}</span><span class="admin-stat-label">Групи</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${students?.length || 0}</span><span class="admin-stat-label">Учні</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${conferences?.length || 0}</span><span class="admin-stat-label">Конференції</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${recordings?.length || 0}</span><span class="admin-stat-label">Записи</span></div>
      </div>
      <div class="admin-grid">
        <section class="admin-panel admin-panel--wide">
          <h2>${icon('users', 'ico ico--md')}Мої групи</h2>
          <div class="groups-grid groups-grid--compact">${(groups || []).map(g => `
            <div class="group-card group-card--compact" style="--group-color:${g.color || 'var(--accent)'}">
              <strong>${g.name}</strong>
              <span>${g.member_count || 0} учн.</span>
            </div>`).join('') || '<p class="empty-state">Створіть групи на вкладці «Групи»</p>'}
          </div>
        </section>
        <section class="admin-panel">
          <h2>${icon('calendar', 'ico ico--md')}Конференції</h2>
          <div class="admin-list">${renderConferences(conferences)}</div>
          <a href="/conferences.html" class="btn btn--outline btn--sm" style="margin-top:12px">${icon('plus', 'ico ico--sm')}Створити</a>
        </section>
        <section class="admin-panel admin-panel--wide">
          <h2>${icon('users', 'ico ico--md')}Учні в моїх групах</h2>
          <div class="admin-list">${renderStudents(students)}</div>
        </section>
        <section class="admin-panel admin-panel--wide">
          <h2>${icon('video', 'ico ico--md')}Записи</h2>
          <div class="admin-list">${renderRecordings(recordings)}</div>
        </section>
      </div>`;
    } else if (teacherTab === 'groups') {
      html += renderGroupsPanel(groups, panelPrograms);
    } else if (teacherTab === 'tasks') {
      html += renderTasksPanel(groups, teacherTasksData);
    } else if (teacherTab === 'schedule') {
      const gf = new URLSearchParams(location.search).get('groupId') || '';
      html += renderSchedulePanel(groups, scheduleData, gf);
    } else if (teacherTab === 'quizzes') {
      html += renderQuizzesPanel(groups, quizzesAdminData.quizzes);
    } else if (teacherTab === 'stats') {
      html += renderStatsPanel(statsAdminData);
    } else if (teacherTab === 'ctf') {
      html += renderCtfPanel(ctfAdminData.challenges, ctfAdminData.programs);
    }
  } else if (role === 'developer') {
    html = `
      <div class="admin-stats">
        <div class="admin-stat"><span class="admin-stat-val">${db?.users || 0}</span><span class="admin-stat-label">Користувачі</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${db?.programs || 0}</span><span class="admin-stat-label">Програми</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${db?.applications || 0}</span><span class="admin-stat-label">Заявки</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${memoryMB}MB</span><span class="admin-stat-label">Heap</span></div>
      </div>
      <div class="admin-grid">
        <section class="admin-panel">
          <h2>${icon('server', 'ico ico--md')}Система</h2>
          <div class="sys-info">
            <span><em>Node</em><strong>${nodeVersion}</strong></span>
            <span><em>Uptime</em><strong>${Math.floor(uptime / 60)} хв</strong></span>
            <span><em>Challenges</em><strong>${db?.challenges || 0}</strong></span>
            <span><em>Записи</em><strong>${typeof stats?.recordings === 'number' ? stats.recordings : 0}</strong></span>
          </div>
        </section>
        ${renderUsersPanel(users || recentUsers, role)}
        ${renderApplicationsPanel(applications)}
      </div>`;
  } else if (role === 'owner') {
    const pending = applications?.filter(a => a.status === 'pending').length || 0;
    html = renderOwnerTabs(ownerTab);
    if (ownerTab === 'overview') {
      html += `
      <div class="admin-stats">
        <div class="admin-stat"><span class="admin-stat-val">${stats?.db?.users || users?.length || 0}</span><span class="admin-stat-label">Користувачі</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${directions?.length || 0}</span><span class="admin-stat-label">Напрямки</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${programs?.length || 0}</span><span class="admin-stat-label">Програми</span></div>
        <div class="admin-stat"><span class="admin-stat-val">${pending}</span><span class="admin-stat-label">Нові заявки</span></div>
      </div>
      <div class="admin-grid">
        <section class="admin-panel">
          <h2>${icon('calendar', 'ico ico--md')}Конференції</h2>
          <div class="admin-list">${renderConferences(conferences)}</div>
        </section>
        <section class="admin-panel">
          <h2>${icon('video', 'ico ico--md')}Записи</h2>
          <div class="admin-list">${renderRecordings(recordings)}</div>
        </section>
        <section class="admin-panel admin-panel--wide">
          <h2>${icon('users', 'ico ico--md')}Учні</h2>
          <div class="admin-list">${renderStudents(students)}</div>
        </section>
      </div>`;
    } else if (ownerTab === 'directions') {
      html += renderDirectionsPanel(directions);
    } else if (ownerTab === 'programs') {
      html += renderProgramsPanel(programs, directions);
    } else if (ownerTab === 'manuals') {
      html += renderManualsPanel(manualsAdminData);
    } else if (ownerTab === 'ctf') {
      html += renderCtfPanel(ctfAdminData.challenges, ctfAdminData.programs);
    } else if (ownerTab === 'users') {
      let smtpSettings = { configured: false };
      try {
        ({ settings: smtpSettings } = await api('/admin/settings/smtp'));
      } catch { /* ignore */ }
      html += renderUsersPanelExtended(users, role, smtpSettings);
    } else if (ownerTab === 'billing') {
      try {
        const params = new URLSearchParams(location.search);
        const now = new Date();
        const billingYear = parseInt(params.get('billingYear'), 10) || now.getFullYear();
        const billingMonth = parseInt(params.get('billingMonth'), 10) || (now.getMonth() + 1);
        const billingData = await loadBillingAdminData(billingYear, billingMonth);
        html += renderBillingPanel(billingData);
      } catch (err) {
        html += `<p class="empty-state">${err.message}</p>`;
      }
    } else if (ownerTab === 'access') {
      try {
        const accessData = await loadAccessAdminData();
        html += renderAccessPanel(accessData);
      } catch (err) {
        html += `<p class="empty-state">${err.message}</p>`;
      }
    } else if (ownerTab === 'applications') {
      html += renderApplicationsPanel(applications);
    } else if (ownerTab === 'proxmox') {
      try {
        const [{ settings }, { settings: labPublic }, labsRes] = await Promise.all([
          api('/admin/settings/proxmox'),
          api('/admin/settings/lab-public'),
          api('/admin/labs').catch(() => ({ labs: [] })),
        ]);
        labsAdminData = labsRes.labs || [];
        html += renderProxmoxPanel(settings, labPublic, labsAdminData);
      } catch (err) {
        html += `<p class="empty-state">${err.message}</p>`;
      }
    } else if (ownerTab === 'storage') {
      html += renderStoragePanel(storageAdminData);
    } else if (ownerTab === 'labs') {
      html += renderLabsPanel(labsAdminData);
    } else if (ownerTab === 'schedule') {
      const schedGroups = window.__scheduleGroups || groups || [];
      const gf = new URLSearchParams(location.search).get('groupId') || '';
      html += renderSchedulePanel(schedGroups, scheduleData, gf);
    }
  }

  el.innerHTML = html;
  bindTabHandlers(role);
  bindEvents(role, panelPrograms, groups);
}

function bindTabHandlers(role) {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      if (role === 'owner') ownerTab = t;
      if (role === 'teacher') teacherTab = t;
      const url = new URL(location.href);
      url.searchParams.set('tab', t);
      if (t !== 'schedule') url.searchParams.delete('groupId');
      history.replaceState(null, '', url);
      load();
    });
  });
}

function renderConferences(list) {
  if (!list?.length) return '<p class="empty-state">Немає конференцій</p>';
  return list.map(c => `
    <div class="admin-list-item">
      <div>
        <strong>${c.title}</strong>
        <div style="font-size:0.75rem;color:var(--text-muted)">${new Date(c.scheduled_at).toLocaleString('uk-UA')}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="status-pill ${c.status}">${c.status}</span>
        <a href="/room.html?id=${c.id}" class="btn btn--outline btn--sm">Увійти</a>
      </div>
    </div>`).join('');
}

function renderStudents(list) {
  if (!list?.length) return '<p class="empty-state">Немає учнів</p>';
  return list.map(s => `
    <div class="admin-list-item">
      <div>
        <strong>@${s.handle}</strong> · ${s.name}
        <div style="font-size:0.75rem;color:var(--text-muted)">${s.email || ''}</div>
      </div>
      <span style="color:var(--text-muted);font-size:0.75rem">${s.group_names || s.program_name || ''} · ${s.bounty_points || 0} pts</span>
    </div>`).join('');
}

function renderRecordings(list) {
  if (!list?.length) return '<p class="empty-state">Немає записів</p>';
  return list.map(r => `
    <div class="admin-list-item">
      <span>${r.title}</span>
      <a href="/recordings.html?id=${r.id}" class="btn btn--ghost btn--sm">Переглянути</a>
    </div>`).join('');
}

function renderUsersPanel(users, role) {
  if (!users?.length) return '';
  const roles = role === 'developer'
    ? ['student', 'teacher', 'owner', 'developer']
    : role === 'owner'
      ? ['student', 'teacher', 'owner']
      : ['student', 'teacher'];

  return `<section class="admin-panel admin-panel--wide">
    <h2>${icon('users', 'ico ico--md')}Користувачі</h2>
    <table class="admin-table">
      <thead><tr><th>Handle</th><th>Ім'я</th><th>Email</th><th>Роль</th></tr></thead>
      <tbody>${users.map(u => `
        <tr>
          <td>@${u.handle}</td>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td>
            <select class="role-select" data-user-id="${u.id}" data-current="${u.role}">
              ${roles.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
            </select>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>`;
}

function renderApplicationsPanel(apps) {
  if (!apps?.length) {
    return `<section class="admin-panel"><h2>${icon('notes', 'ico ico--md')}Заявки</h2><p class="empty-state">Немає нових заявок</p></section>`;
  }
  return `<section class="admin-panel admin-panel--wide">
    <h2>${icon('notes', 'ico ico--md')}Заявки</h2>
    <table class="admin-table">
      <thead><tr><th>Ім'я</th><th>Email</th><th>Програма</th><th>Статус</th><th></th></tr></thead>
      <tbody>${apps.map(a => `
        <tr>
          <td>${a.name}</td>
          <td>${a.email}</td>
          <td>${a.program}</td>
          <td><span class="status-pill ${a.status}">${a.status}</span></td>
          <td>${a.status === 'pending' ? `
            <button class="btn btn--ghost btn--sm app-approve" data-id="${a.id}">${icon('check', 'ico ico--sm')}</button>
            <button class="btn btn--ghost btn--sm app-reject" data-id="${a.id}">${icon('trash', 'ico ico--sm')}</button>
          ` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>`;
}

function bindEvents(role, panelPrograms = [], teacherGroups = []) {
  if (role === 'owner') {
    bindOwnerPanelEvents(showToast, load);
  }
  if (role === 'owner' && ownerTab === 'access') {
    bindAccessPanelEvents(showToast, load);
  }
  if (role === 'owner' && ownerTab === 'billing') {
    bindBillingPanelEvents(showToast, load);
  }
  if (role === 'teacher' && teacherTab === 'groups') {
    bindGroupsPanelEvents(showToast, load, panelPrograms);
  }
  if (role === 'teacher' && teacherTab === 'tasks') {
    bindTasksPanelEvents(showToast, load);
  }
  if (role === 'teacher' && teacherTab === 'quizzes') {
    bindQuizzesPanelEvents(showToast, load);
  }
  if (role === 'teacher' && teacherTab === 'stats') {
    bindStatsPanelEvents(showToast);
  }
  if (role === 'teacher' && teacherTab === 'ctf') {
    bindCtfPanelEvents(ctfAdminData.challenges, showToast, load);
  }
  if (role === 'owner' && ownerTab === 'ctf') {
    bindCtfPanelEvents(ctfAdminData.challenges, showToast, load);
  }
  if (role === 'owner' && ownerTab === 'storage') {
    bindStoragePanelEvents(showToast, load);
  }
  if (role === 'owner' && (ownerTab === 'labs' || ownerTab === 'proxmox')) {
    bindLabsPanelEvents(labsAdminData, showToast, load);
  }
  if (role === 'owner' && ownerTab === 'manuals') {
    bindManualsPanelEvents(showToast, load);
  }

  document.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/admin/users/${sel.dataset.userId}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ role: sel.value }),
        });
        showToast('Роль оновлено');
      } catch (err) {
        showToast(err.message, 'error');
        sel.value = sel.dataset.current;
      }
    });
  });

  document.querySelectorAll('.app-approve').forEach(btn => {
    btn.addEventListener('click', () => updateApp(btn.dataset.id, 'approved'));
  });
  document.querySelectorAll('.app-reject').forEach(btn => {
    btn.addEventListener('click', () => updateApp(btn.dataset.id, 'rejected'));
  });
}

async function updateApp(id, status) {
  let createAccount = false;
  if (status === 'approved') {
    if (!(await showConfirm('Схвалити заявку і створити акаунт з паролем на email?'))) return;
    createAccount = true;
  } else if (status === 'rejected' && !(await showConfirm('Відхилити заявку?', { danger: true }))) {
    return;
  }
  try {
    const res = await api(`/admin/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status, createAccount }) });
    if (res.account) {
      if (res.account.emailSent) {
        showToast('Заявку схвалено, акаунт створено, пароль надіслано на email');
      } else {
        await showCopyDialog(
          `Email НЕ надіслано (${res.account.mailReason && res.account.mailReason !== 'no-smtp' ? res.account.mailReason : 'SMTP не налаштовано — збережіть хост на вкладці «Користувачі»'}). Скопіюйте пароль і передайте учню (${res.account.user.email}) вручну:`,
          res.account.password,
          { title: 'Пароль учня' },
        );
      }
    } else {
      showToast('Заявку оновлено');
    }
    load();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

load().catch(handleSessionError);
