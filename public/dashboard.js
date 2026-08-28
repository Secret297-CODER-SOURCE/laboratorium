import {
  api, getToken, getUser, setSession, clearSession, requireAuthAsync, handleSessionError,
  initTheme,
} from '/auth.js';
import { icon, initNavIcons } from '/icons.js';
import { initSiteHeader, refreshAppNav } from '/site-header.js';
import { loadTabAccess, dashTabAllowed, firstAllowedDashTab, setAllowedTabs } from '/tab-access.js';
import { initI18n, t, getLocale } from '/i18n.js';

function dateLocale() {
  return { uk: 'uk-UA', en: 'en-US', ru: 'ru-RU' }[getLocale()] || 'uk-UA';
}

function timerHtml(left) {
  const label = left <= 0 ? t('Час вийшов') : formatTimerRemaining(left);
  return `${icon('clock', 'ico ico--sm')} ${label}`;
}

function setTimerElement(el, left) {
  el.innerHTML = timerHtml(left);
}

function statusMark(ok) {
  return icon(ok ? 'check' : 'x', `ico ico--sm ${ok ? 'ico--ok' : 'ico--err'}`);
}

if (!(await requireAuthAsync())) throw new Error('auth');

initTheme();
initI18n();
initSiteHeader({ showLogout: true, navMode: 'app' });
initNavIcons();

let dashboardData = null;
let activeDashTab = new URLSearchParams(location.search).get('tab') || 'home';

const ARTICLE_STATUS_LABELS = {
  draft: 'Чернетка',
  submitted: 'Надіслано',
  published: 'Опубліковано',
};

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast--${type}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

let taskTimerIntervals = [];
let quizTimerInterval = null;

function clearTaskTimers() {
  taskTimerIntervals.forEach(clearInterval);
  taskTimerIntervals = [];
}

function formatDurationLabel(seconds) {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return t('{s} с', { s: seconds });
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? t('{m} хв {s} с', { m, s }) : t('{m} хв', { m });
}

function formatTimerRemaining(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseTaskDate(str) {
  if (!str) return null;
  const d = new Date(String(str).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function initTaskTimers(tasks) {
  clearTaskTimers();
  tasks.forEach(t => {
    if (t.status !== 'taken' || !t.time_limit_minutes || !t.taken_at) return;
    const el = document.getElementById(`task-timer-${t.id}`);
    if (!el) return;
    const start = parseTaskDate(t.taken_at);
    if (!start) return;
    const deadline = start.getTime() + t.time_limit_minutes * 60000;
    const tick = () => {
      const left = deadline - Date.now();
      setTimerElement(el, left);
      el.classList.toggle('task-timer--expired', left <= 0);
    };
    tick();
    taskTimerIntervals.push(setInterval(tick, 1000));
  });
}

function stopQuizTimer() {
  if (quizTimerInterval) {
    clearInterval(quizTimerInterval);
    quizTimerInterval = null;
  }
  const el = document.getElementById('quiz-timer');
  if (el) el.hidden = true;
}

function startQuizTimer(startedAt, limitMinutes, onExpire) {
  stopQuizTimer();
  if (!limitMinutes || !startedAt) return;
  const el = document.getElementById('quiz-timer');
  if (!el) return;
  const start = parseTaskDate(startedAt);
  if (!start) return;
  el.hidden = false;
  const deadline = start.getTime() + limitMinutes * 60000;
  const tick = () => {
    const left = deadline - Date.now();
    el.innerHTML = timerHtml(left);
    el.classList.toggle('quiz-timer--warn', left > 0 && left < 60000);
    el.classList.toggle('quiz-timer--expired', left <= 0);
    if (left <= 0) {
      stopQuizTimer();
      onExpire?.();
    }
  };
  tick();
  quizTimerInterval = setInterval(tick, 1000);
}

let ctfTimerIntervals = [];
let ctfAllChallenges = [];
let ctfFiltersBound = false;
let ctfActivityInterval = null;

const CTF_CATEGORY_LABELS = {
  web: 'Web', network: 'Network / Pwn', crypto: 'Crypto',
  forensics: 'Forensics', reverse: 'Reverse', osint: 'OSINT', misc: 'Misc',
};

function clearCtfTimers() {
  ctfTimerIntervals.forEach(clearInterval);
  ctfTimerIntervals = [];
}

function initCtfTimers(challenges) {
  clearCtfTimers();
  challenges.forEach(c => {
    if (c.completed || !c.time_limit_minutes || !c.started_at) return;
    const el = document.getElementById(`ctf-timer-${c.id}`);
    if (!el) return;
    const start = parseTaskDate(c.started_at);
    if (!start) return;
    const deadline = start.getTime() + c.time_limit_minutes * 60000;
    const tick = () => {
      const left = deadline - Date.now();
      setTimerElement(el, left);
      el.classList.toggle('task-timer--expired', left <= 0);
    };
    tick();
    ctfTimerIntervals.push(setInterval(tick, 1000));
  });
}

const TASK_COLUMNS = [
  { status: 'available', label: 'Задача' },
  { status: 'taken', label: 'Взяв задачу' },
  { status: 'review', label: 'На перевірку' },
  { status: 'completed', label: 'Завершено' },
];

function renderDashboard(data) {
  dashboardData = data;
  const {
    user, rank, tier, nextTier, enrollments, bountyLog, challenges, tasks, stats,
    canWriteArticles, articles,
  } = data;

  document.getElementById('avatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-handle').textContent = `@${user.handle}`;
  document.getElementById('user-tier').textContent = user.tier;
  document.getElementById('stat-points').textContent = user.bounty_points.toLocaleString(dateLocale());
  document.getElementById('stat-rank').textContent = `#${rank}`;
  document.getElementById('stat-challenges').textContent = `${stats.challenges_completed}/${stats.challenges_total}`;
  document.getElementById('stat-programs').textContent = stats.programs_count;

  document.getElementById('tier-current').textContent = tier.name;
  if (nextTier) {
    const remaining = nextTier.min - user.bounty_points;
    document.getElementById('tier-next-label').textContent = t('до {tier}: {remaining} pts', { tier: nextTier.name, remaining });
    const range = nextTier.min - tier.min;
    const progress = ((user.bounty_points - tier.min) / range) * 100;
    document.getElementById('tier-progress').style.width = `${Math.min(100, progress)}%`;
  } else {
    document.getElementById('tier-next-label').textContent = t('максимальний ранг');
    document.getElementById('tier-progress').style.width = '100%';
  }

  document.getElementById('profile-name').value = user.name;
  document.getElementById('profile-handle').value = user.handle;
  document.getElementById('profile-email').value = user.email;

  renderEnrollments(enrollments);
  renderGroupContent(data.groupContent || []);
  loadSchedule();
  renderChallenges(challenges);
  renderQuizzes(data.quizzes || []);
  renderTasks(tasks || [], stats);
  renderBountyLog(bountyLog);
  setupDashTabs(canWriteArticles);
  if (canWriteArticles) {
    renderArticles(articles || []);
  }
  if (activeDashTab === 'ctf') loadCtfPanel();
  if (activeDashTab === 'tests') loadQuizzesPanel();
  if (activeDashTab === 'lab') loadLabPanel();
}

const ALL_TABS = ['home', 'ctf', 'tests', 'lab', 'article'];

function setupDashTabs(canWriteArticles) {
  const tabsEl = document.getElementById('dash-tabs');
  const articleBtn = document.getElementById('tab-article-btn');
  const articleAllowed = canWriteArticles && dashTabAllowed('article');

  if (!ALL_TABS.includes(activeDashTab)) activeDashTab = 'home';
  if (!dashTabAllowed(activeDashTab)) activeDashTab = firstAllowedDashTab('home');
  if (activeDashTab === 'article' && !articleAllowed) activeDashTab = firstAllowedDashTab('home');

  tabsEl.hidden = false;
  tabsEl.querySelectorAll('.dash-tab').forEach(tab => {
    const id = tab.dataset.tab;
    const allowed = dashTabAllowed(id);
    if (id === 'article') {
      tab.hidden = !articleAllowed;
    } else {
      tab.hidden = !allowed;
    }
    tab.classList.toggle('active', id === activeDashTab && !tab.hidden);
  });

  if (articleBtn) articleBtn.hidden = !articleAllowed;

  document.getElementById('dash-panel-home').hidden = activeDashTab !== 'home';
  document.getElementById('dash-panel-ctf').hidden = activeDashTab !== 'ctf';
  document.getElementById('dash-panel-tests').hidden = activeDashTab !== 'tests';
  document.getElementById('dash-panel-lab').hidden = activeDashTab !== 'lab';
  document.getElementById('dash-panel-article').hidden = activeDashTab !== 'article';
}

if (!window.__dashTabsBound) {
  window.__dashTabsBound = true;
  document.getElementById('dash-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.dash-tab');
    if (!tab) return;
    activeDashTab = tab.dataset.tab;
    const url = new URL(location.href);
    if (activeDashTab === 'home') url.searchParams.delete('tab');
    else url.searchParams.set('tab', activeDashTab);
    history.replaceState(null, '', url);
    setupDashTabs(dashboardData?.canWriteArticles);
    stopCtfActivityPolling();
    if (activeDashTab === 'ctf') loadCtfPanel();
    if (activeDashTab === 'tests') loadQuizzesPanel();
    if (activeDashTab === 'lab') loadLabPanel();
  });
}

function renderArticles(articles) {
  const el = document.getElementById('articles-list');
  if (!el) return;

  if (!articles.length) {
    el.innerHTML = `<p class="empty-state">${t('Поки немає статей. Напишіть першу!')}</p>`;
    return;
  }

  el.innerHTML = articles.map(a => `
    <article class="article-item" data-id="${a.id}">
      <div>
        <h4>${escapeHtml(a.title)}</h4>
        <div class="article-item-meta">
          ${t(ARTICLE_STATUS_LABELS[a.status] || a.status)}
          ${a.group_name ? ` · ${escapeHtml(a.group_name)}` : ''}
          · ${new Date(a.updated_at + 'Z').toLocaleDateString(dateLocale())}
        </div>
      </div>
      <div class="article-item-actions">
        <span class="article-status ${a.status}">${t(ARTICLE_STATUS_LABELS[a.status] || a.status)}</span>
        ${a.status === 'draft' ? `
          <button type="button" class="btn btn--ghost btn--sm article-edit-btn" data-id="${a.id}">${t('Редагувати')}</button>
          <button type="button" class="btn btn--outline btn--sm article-submit-btn" data-id="${a.id}">${t('Надіслати')}</button>
        ` : ''}
      </div>
    </article>
  `).join('');

  el.querySelectorAll('.article-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const article = articles.find(a => String(a.id) === btn.dataset.id);
      if (!article) return;
      document.getElementById('article-id').value = article.id;
      document.getElementById('article-title').value = article.title;
      document.getElementById('article-content').value = article.content;
      activeDashTab = 'article';
      setupDashTabs(dashboardData?.canWriteArticles);
      document.getElementById('article-title').focus();
    });
  });

  el.querySelectorAll('.article-submit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/articles/${btn.dataset.id}/submit`, { method: 'POST' });
        await loadDashboard();
        showToast(t('Статтю надіслано викладачу'));
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function resetArticleForm() {
  document.getElementById('article-id').value = '';
  document.getElementById('article-title').value = '';
  document.getElementById('article-content').value = '';
}

function formatDue(dueAt) {
  if (!dueAt) return '';
  const d = new Date(dueAt.includes('T') ? dueAt : `${dueAt}T00:00:00`);
  return d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}

function renderTasks(tasks, stats) {
  const statsEl = document.getElementById('task-stats');
  if (statsEl && stats) {
    const counts = {
      available: stats.tasks_available ?? 0,
      taken: stats.tasks_in_progress ?? 0,
      review: stats.tasks_review ?? 0,
      completed: stats.tasks_completed ?? 0,
    };
    statsEl.innerHTML = TASK_COLUMNS.map(col => `
      <span class="task-stat-pill">${t(col.label)}: ${counts[col.status]}</span>
    `).join('');
  }

  const board = document.getElementById('tasks-kanban');
  if (!board) return;

  if (!tasks.length) {
    board.innerHTML = `<p class="empty-state">${t("Поки немає задач від викладача. Коли вас додадуть до групи — задачі з'являться тут.")}</p>`;
    return;
  }

  board.innerHTML = TASK_COLUMNS.map(col => {
    const items = tasks.filter(task => task.status === col.status);
    return `
      <div class="tasks-col tasks-col--${col.status}">
        <div class="tasks-col-head">
          <span>${t(col.label)}</span>
          <span class="tasks-col-count">${items.length}</span>
        </div>
        ${items.length ? items.map(task => renderTaskCard(task)).join('') : `<div class="tasks-col-empty">${t('Порожньо')}</div>`}
      </div>`;
  }).join('');

  initTaskTimers(tasks);

  board.querySelectorAll('.task-take-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api(`/tasks/${btn.dataset.id}/take`, { method: 'POST' });
        await loadDashboard();
        showToast(t('Задачу взято в роботу'));
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  board.querySelectorAll('.task-files-input').forEach(input => {
    input.addEventListener('change', () => {
      const namesEl = document.getElementById(`task-file-names-${input.dataset.id}`);
      if (namesEl) namesEl.textContent = input.files.length ? [...input.files].map(f => f.name).join(', ') : '';
    });
  });

  board.querySelectorAll('.task-submit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const note = board.querySelector(`#task-note-${btn.dataset.id}`)?.value || '';
      const files = board.querySelector(`#task-files-${btn.dataset.id}`)?.files || [];
      if (!note.trim() && !files.length) {
        showToast(t('Додайте коментар, файл або фото'), 'error');
        return;
      }
      btn.disabled = true;
      try {
        const fd = new FormData();
        fd.append('note', note);
        for (const file of files) fd.append('files', file);
        const res = await fetch(`/api/tasks/${btn.dataset.id}/submit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t('Помилка надсилання'));
        await loadDashboard();
        showToast(t('Задачу надіслано на перевірку'));
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function renderTaskCard(task) {
  const due = task.due_at ? `<div class="task-card-meta">${t('Дедлайн: {date}', { date: formatDue(task.due_at) })}</div>` : '';
  const bounty = task.bounty_reward ? `<div class="task-card-meta">+${task.bounty_reward} bounty</div>` : '';
  const group = task.group_name ? `<div class="task-card-meta">${task.group_name}</div>` : '';
  const limit = task.time_limit_minutes
    ? `<div class="task-card-meta">${t('Ліміт: {min} хв', { min: task.time_limit_minutes })}</div>`
    : '';
  const timer = (task.status === 'taken' && task.time_limit_minutes)
    ? `<div class="task-timer ico-inline" id="task-timer-${task.id}">${icon('clock', 'ico ico--sm')} —</div>`
    : '';
  const duration = (task.status === 'completed' && task.duration_seconds != null)
    ? `<div class="task-card-meta">${t('Час виконання: {time}', { time: formatDurationLabel(task.duration_seconds) })}</div>`
    : '';

  const filesList = (files) => (files || []).length ? `
    <div class="task-submission-files">
      ${files.map(f => `
        <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" class="task-submission-file" title="${escapeHtml(f.original_name)}">
          ${icon(f.mime_type?.startsWith('image/') ? 'image' : 'notes', 'ico ico--xs')}${escapeHtml(f.original_name)}
        </a>`).join('')}
    </div>` : '';

  let actions = '';
  if (task.status === 'available') {
    actions = `<button class="btn btn--primary btn--sm task-take-btn" data-id="${task.id}">${t('Взяти задачу')}</button>`;
  } else if (task.status === 'taken') {
    actions = `
      <textarea class="task-note-input" id="task-note-${task.id}" placeholder="${t("Коментар до здачі (необов'язково, якщо додаєте файл)")}"></textarea>
      <div class="task-file-row">
        <label class="btn btn--ghost btn--sm" for="task-files-${task.id}">${icon('upload', 'ico ico--sm')}${t('Файл / фото / архів')}</label>
        <input type="file" id="task-files-${task.id}" data-id="${task.id}" class="task-files-input" multiple hidden
          accept="image/*,.zip,.rar,.7z,.tar,.gz,.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx">
        <span class="task-file-names" id="task-file-names-${task.id}"></span>
      </div>
      <button type="button" class="btn btn--outline btn--sm task-submit-btn" data-id="${task.id}">${t('На перевірку')}</button>`;
  } else if (task.status === 'review') {
    const work = task.work_duration_seconds != null
      ? ` · ${formatDurationLabel(task.work_duration_seconds)}`
      : '';
    actions = `<span class="task-status-done">${t('Очікує перевірки викладачем')}${work}</span>${filesList(task.submission_files)}`;
  } else if (task.status === 'completed') {
    actions = `<span class="task-status-done ico-inline">${icon('check', 'ico ico--sm')}${t('Завершено')}${task.completed_at ? ` · ${formatDue(task.completed_at)}` : ''}</span>${filesList(task.submission_files)}`;
  }

  return `
    <article class="task-card" style="--group-color:${task.group_color || 'var(--accent)'}">
      <h4>${task.title}</h4>
      ${task.description ? `<p>${task.description}</p>` : ''}
      ${group}${bounty}${due}${limit}${timer}${duration}
      <div class="task-card-actions">${actions}</div>
    </article>`;
}

function renderEnrollments(enrollments) {
  const el = document.getElementById('enrollments-list');
  if (!enrollments.length) {
    el.innerHTML = `<p class="empty-state">${t('Ви ще не записані на програми. Натисніть «+ Записатися».')}</p>`;
    return;
  }

  el.innerHTML = enrollments.map(e => `
    <article class="enrollment-card" data-id="${e.id}">
      <div class="enrollment-top">
        <span class="program-level">${e.level}</span>
        <span class="enrollment-status ${e.status}">${e.status === 'completed' ? t('завершено') : t('активна')}</span>
      </div>
      <h3>${e.program_name}</h3>
      <div class="progress-wrap">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${e.progress}%"></div>
        </div>
        <span class="progress-pct">${e.progress}%</span>
      </div>
      <div class="enrollment-actions">
        <button class="btn btn--ghost btn--sm progress-btn" data-id="${e.id}" data-progress="${Math.min(100, e.progress + 10)}">
          ${t('+10% прогрес')}
        </button>
      </div>
    </article>
  `).join('');

  el.querySelectorAll('.progress-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/enrollments/${btn.dataset.id}/progress`, {
          method: 'PATCH',
          body: JSON.stringify({ progress: btn.dataset.progress }),
        });
        await loadDashboard();
        showToast(t('Прогрес оновлено'));
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function renderGroupContent(groups) {
  const panel = document.getElementById('group-content-panel');
  const el = document.getElementById('group-content-list');
  if (!panel || !el) return;

  const withContent = groups.filter(g => g.has_content);
  if (!withContent.length) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  el.innerHTML = withContent.map(g => `
    <a href="/content.html?type=group&id=${g.id}" class="group-content-card" style="--group-color:${g.color || 'var(--accent)'}">
      <span class="group-content-name">${escapeHtml(g.name)}</span>
      <span class="group-content-arrow">${icon('chevron-right', 'ico ico--sm')}</span>
    </a>`).join('');
}

function renderChallenges(challenges) {
  const el = document.getElementById('challenges-list');
  el.innerHTML = challenges.map(c => {
    const timed = c.time_limit_minutes ? `<span class="ico-inline">${icon('clock', 'ico ico--sm')}${t('{min} хв', { min: c.time_limit_minutes })}</span>` : '';
    let action = '';
    if (c.completed) {
      action = `<span class="challenge-done ico-inline">${icon('check', 'ico ico--sm')}${t('виконано')}</span>`;
    } else if (c.ctf_enabled) {
      action = `<a href="/dashboard.html?tab=ctf" class="btn btn--outline btn--sm ico-inline">${icon('chevron-right', 'ico ico--sm')}${t('Відкрити CTF')}</a>`;
    } else if (c.time_limit_minutes && !c.started_at) {
      action = `<button class="btn btn--outline btn--sm challenge-start-btn" data-id="${c.id}">${t('Почати')}</button>`;
    } else {
      action = `<button class="btn btn--primary btn--sm complete-btn" data-id="${c.id}">${t('Здати')}</button>`;
    }
    return `
    <article class="challenge-card ${c.completed ? 'completed' : ''}" data-id="${c.id}">
      <div class="challenge-top">
        <span class="difficulty difficulty--${c.difficulty}">${c.difficulty}</span>
        <span class="challenge-reward">+${c.bounty_reward} pts</span>
      </div>
      <h3>${escapeHtml(c.title)}</h3>
      <p>${escapeHtml(c.description)}</p>
      ${c.program_name ? `<span class="challenge-program">${escapeHtml(c.program_name)}</span>` : ''}
      ${timed}
      ${action}
    </article>`;
  }).join('');

  el.querySelectorAll('.challenge-start-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api(`/challenges/${btn.dataset.id}/start`, { method: 'POST' });
        await loadDashboard();
        showToast(t('Таймер запущено'));
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  el.querySelectorAll('.complete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await api(`/challenges/${btn.dataset.id}/complete`, { method: 'POST' });
        setSession(localStorage.getItem('lab_token'), res.user);
        await loadDashboard();
        showToast(res.message);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

let activeQuizId = null;

function renderQuizzes(quizzes) {
  const tag = document.getElementById('quiz-stats-tag');
  const passed = quizzes.filter(q => q.attempt?.passed).length;
  if (tag) tag.textContent = t('{passed}/{total} пройдено', { passed, total: quizzes.length });
}

async function loadQuizzesPanel() {
  const el = document.getElementById('quiz-list');
  if (!el) return;
  try {
    const { quizzes } = await api('/quizzes');
    renderQuizzes(quizzes || []);
    if (!quizzes?.length) {
      el.innerHTML = `<p class="empty-state">${t('Немає доступних тестів. Викладач додасть їх для вашої групи.')}</p>`;
      return;
    }
    el.innerHTML = quizzes.map(q => {
      const done = q.attempt?.submitted_at;
      const passed = q.attempt?.passed;
      return `
        <article class="quiz-card ${passed ? 'quiz-card--passed' : done ? 'quiz-card--failed' : ''}">
          <div>
            <h3>${escapeHtml(q.title)}</h3>
            <p>${escapeHtml(q.description || '')}</p>
            <div class="quiz-card-meta">
              ${q.group_name ? `<span>${escapeHtml(q.group_name)}</span>` : ''}
              <span>${t('{n} пит.', { n: q.question_count })}</span>
              <span>${t('прохід {pct}%', { pct: q.pass_percent })}</span>
              <span>+${q.bounty_reward} pts</span>
              ${q.time_limit_minutes ? `<span class="ico-inline">${icon('clock', 'ico ico--sm')}${t('{min} хв', { min: q.time_limit_minutes })}</span>` : ''}
            </div>
            ${done ? `<div class="quiz-result ${passed ? 'quiz-result--ok' : ''}">${t('Результат: {pct}%', { pct: q.attempt.score_percent })} <span class="ico-inline">${statusMark(passed)}</span>${q.attempt.duration_seconds != null ? ` · ${formatDurationLabel(q.attempt.duration_seconds)}` : ''}</div>` : ''}
          </div>
          ${!done ? `<button type="button" class="btn btn--primary btn--sm quiz-start" data-id="${q.id}">${t('Почати')}</button>` : `<span class="status-pill running">${t('здано')}</span>`}
        </article>`;
    }).join('');

    el.querySelectorAll('.quiz-start').forEach(btn => {
      btn.addEventListener('click', () => openQuizModal(parseInt(btn.dataset.id, 10)));
    });
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

async function openQuizModal(quizId) {
  activeQuizId = quizId;
  try {
    const [{ quiz }, startRes] = await Promise.all([
      api(`/quizzes/${quizId}`),
      api(`/quizzes/${quizId}/start`, { method: 'POST' }),
    ]);
    document.getElementById('quiz-modal-title').textContent = quiz.title;
    document.getElementById('quiz-modal-meta').textContent =
      `${quiz.group_name || ''} · ${t('{n} питань · прохідний бал {pct}%', { n: quiz.questions.length, pct: quiz.pass_percent })}`;
    const form = document.getElementById('quiz-form');
    form.innerHTML = quiz.questions.map((q, i) => `
      <fieldset class="quiz-q">
        <legend>${i + 1}. ${escapeHtml(q.question_text)}</legend>
        ${q.options.map(o => `
          <label class="quiz-opt-label">
            <input type="radio" name="q-${q.id}" value="${escapeHtml(o.id)}" required>
            <span>${escapeHtml(o.text)}</span>
          </label>`).join('')}
      </fieldset>`).join('');
    document.getElementById('quiz-modal').hidden = false;
    startQuizTimer(startRes.started_at, quiz.time_limit_minutes, () => {
      showToast(t('Час тесту вийшов — відповіді надіслано'), 'error');
      document.getElementById('quiz-form')?.requestSubmit();
    });
  } catch (err) { showToast(err.message, 'error'); }
}

document.getElementById('quiz-cancel')?.addEventListener('click', () => {
  document.getElementById('quiz-modal').hidden = true;
  stopQuizTimer();
  activeQuizId = null;
});

document.getElementById('quiz-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeQuizId) return;
  const answers = {};
  e.target.querySelectorAll('fieldset.quiz-q').forEach(field => {
    const checked = field.querySelector('input[type="radio"]:checked');
    if (!checked) return;
    const qId = field.querySelector('input[type="radio"]').name.replace('q-', '');
    answers[qId] = [checked.value];
  });
  try {
    const res = await api(`/quizzes/${activeQuizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
    document.getElementById('quiz-modal').hidden = true;
    stopQuizTimer();
    activeQuizId = null;
    if (res.user) setSession(localStorage.getItem('lab_token'), res.user);
    showToast(res.message, res.passed ? 'success' : 'error');
    await loadDashboard();
    if (activeDashTab === 'tests') loadQuizzesPanel();
  } catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('quiz-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'quiz-modal') e.target.hidden = true;
});

function renderBountyLog(log) {
  const el = document.getElementById('bounty-log');
  if (!log.length) {
    el.innerHTML = `<p class="empty-state">${t('Поки немає нарахувань')}</p>`;
    return;
  }

  el.innerHTML = log.map(entry => `
    <div class="bounty-entry">
      <div class="bounty-entry-info">
        <span class="bounty-reason">${entry.reason}</span>
        <span class="bounty-date">${new Date(entry.created_at + 'Z').toLocaleString(dateLocale())}</span>
      </div>
      <span class="bounty-amount ${entry.amount >= 0 ? 'positive' : 'negative'}">
        ${entry.amount >= 0 ? '+' : ''}${entry.amount}
      </span>
    </div>
  `).join('');
}

async function loadPrograms() {
  const { programs } = await api('/programs');
  const select = document.getElementById('program-select');
  const enrolled = new Set((dashboardData?.enrollments || []).map(e => e.program_id));

  select.innerHTML = `<option value="">${t('Оберіть програму')}</option>` +
    programs
      .filter(p => !enrolled.has(p.id))
      .map(p => `<option value="${p.id}">${p.name} (${p.level})</option>`)
      .join('');
}

async function loadDashboard() {
  await loadTabAccess();
  refreshAppNav();
  const data = await api('/dashboard');
  setAllowedTabs(data.tabAccess);
  renderDashboard(data);
  await loadPrograms();
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  clearSession();
  window.location.href = '/';
});

document.getElementById('enroll-toggle').addEventListener('click', () => {
  const form = document.getElementById('enroll-form');
  form.hidden = !form.hidden;
});

document.getElementById('enroll-btn').addEventListener('click', async () => {
  const programId = document.getElementById('program-select').value;
  if (!programId) return showToast(t('Оберіть програму'), 'error');

  try {
    const res = await api('/enroll', {
      method: 'POST',
      body: JSON.stringify({ programId: parseInt(programId, 10) }),
    });
    document.getElementById('enroll-form').hidden = true;
    await loadDashboard();
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api('/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        name: fd.get('name'),
        handle: fd.get('handle'),
      }),
    });
    setSession(localStorage.getItem('lab_token'), res.user);
    renderDashboard({ ...dashboardData, user: res.user });
    showToast(t('Профіль оновлено'));
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('article-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('article-id').value;
  const title = document.getElementById('article-title').value;
  const content = document.getElementById('article-content').value;
  const payload = { title, content };

  try {
    if (id) {
      await api(`/articles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      showToast(t('Чернетку оновлено'));
    } else {
      const res = await api('/articles', { method: 'POST', body: JSON.stringify(payload) });
      document.getElementById('article-id').value = res.article.id;
      showToast(res.message);
    }
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('article-new-btn')?.addEventListener('click', () => {
  resetArticleForm();
  document.getElementById('article-title').focus();
});

loadDashboard().catch(handleSessionError);

// Upcoming conferences
async function loadUpcoming() {
  try {
    const { conferences } = await api('/conferences/upcoming');
    const el = document.getElementById('upcoming-conferences');
    if (!conferences.length) {
      el.innerHTML = `<p class="empty-state">${t('Немає запланованих конференцій')}</p>`;
      return;
    }
    el.innerHTML = conferences.map(c => {
      const d = new Date(c.scheduled_at);
      const month = new Intl.DateTimeFormat(dateLocale(), { month: 'short' }).format(d);
      const time = `${String(d.getDate()).padStart(2, '0')} ${month} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const isLive = c.status === 'live';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px">
          <div>
            <div style="font-weight:500;margin-bottom:4px">${c.title}</div>
            <div style="font-size:0.8rem;color:var(--text-muted)" class="meta-icon">${icon('clock', 'ico ico--sm')}${time} · ${t('{min} хв', { min: c.duration_minutes })} · ${icon('user', 'ico ico--sm')}@${c.host_handle}</div>
          </div>
          <a href="/room.html?id=${c.id}" class="btn ${isLive ? 'btn--primary' : 'btn--outline'} btn--sm">${isLive ? `<span class="live-dot">${icon('live', 'ico ico--sm')} LIVE</span>` : t('Увійти')}</a>
        </div>`;
    }).join('');
  } catch { /* ignore */ }
}
loadUpcoming();

let absenceLessonId = null;

function fmtScheduleDate(iso) {
  const d = new Date(iso.includes('Z') ? iso : `${iso}Z`);
  return d.toLocaleString(dateLocale(), {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

async function loadSchedule() {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  el.innerHTML = `<p class="empty-state">${t('Завантаження...')}</p>`;
  try {
    const { lessons } = await api('/schedule');
    const upcoming = (lessons || []).filter(l => {
      const end = new Date(l.lesson_at);
      end.setMinutes(end.getMinutes() + (l.duration_minutes || 90));
      return end > new Date();
    });

    if (!upcoming.length) {
      el.innerHTML = `<p class="empty-state">${t('Немає запланованих занять у ваших групах')}</p>`;
      return;
    }

    el.innerHTML = upcoming.map(l => {
      const reported = !!l.my_absence;
      return `
        <article class="sched-dash-item" style="--group-color:${l.group_color || 'var(--accent)'}">
          <div>
            <strong>${escapeHtml(l.title)}</strong>
            <div class="sched-dash-meta">${fmtScheduleDate(l.lesson_at)} · ${escapeHtml(l.group_name)} · ${t('{min} хв', { min: l.duration_minutes })}</div>
            ${l.topic ? `<div class="sched-dash-topic">${escapeHtml(l.topic)}</div>` : ''}
            ${reported ? `<div class="sched-dash-reported">${t('Ви повідомили про відсутність: «{reason}»', { reason: escapeHtml(l.my_absence.reason) })}</div>` : ''}
          </div>
          ${!reported ? `<button type="button" class="btn btn--outline btn--sm sched-absence-btn" data-id="${l.id}" data-title="${escapeHtml(l.title)}">${t('Не зможу бути')}</button>` : `<span class="status-pill stopped">${t('відсутність')}</span>`}
        </article>`;
    }).join('');

    el.querySelectorAll('.sched-absence-btn').forEach(btn => {
      btn.addEventListener('click', () => openAbsenceModal(btn.dataset.id, btn.dataset.title));
    });
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function openAbsenceModal(lessonId, title) {
  absenceLessonId = parseInt(lessonId, 10);
  document.getElementById('absence-lesson-title').textContent = title;
  document.getElementById('absence-reason').value = '';
  document.getElementById('absence-modal').hidden = false;
}

document.getElementById('absence-cancel')?.addEventListener('click', () => {
  document.getElementById('absence-modal').hidden = true;
  absenceLessonId = null;
});

document.getElementById('absence-submit')?.addEventListener('click', async () => {
  const reason = document.getElementById('absence-reason').value;
  if (!absenceLessonId) return;
  try {
    const res = await api(`/schedule/lessons/${absenceLessonId}/absence`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    document.getElementById('absence-modal').hidden = true;
    showToast(res.message || t('Відсутність зафіксовано'));
    loadSchedule();
  } catch (err) { showToast(err.message, 'error'); }
});

document.getElementById('absence-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'absence-modal') e.target.hidden = true;
});

function stopCtfActivityPolling() {
  if (ctfActivityInterval) clearInterval(ctfActivityInterval);
  ctfActivityInterval = null;
}

async function loadCtfActivity() {
  const el = document.getElementById('ctf-activity-feed');
  if (!el) return;
  try {
    const { activity } = await api('/lab/ctf/activity?limit=12');
    if (!activity?.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="ctf-activity-title ico-inline">${icon('zap', 'ico ico--sm')}${t('Останні події')}</div>` +
      activity.map(a => `<div class="ctf-activity-item ctf-activity-item--${a.type}">${escapeHtml(a.message)}</div>`).join('');
  } catch { /* тиха відмова — стрічка не критична */ }
}

function renderCtfStageChain(c) {
  return c.stages.map((s, i) => {
    if (s.completed) {
      return `<div class="ctf-stage-item ctf-stage-item--done">
        <span class="ctf-stage-num">${icon('check', 'ico ico--sm')}</span>
        <div class="ctf-stage-body">
          <strong>${escapeHtml(s.title)}</strong>
          <span class="ctf-stage-pts">+${s.points_awarded ?? s.points} pts</span>
        </div>
      </div>`;
    }
    if (!s.unlocked) {
      return `<div class="ctf-stage-item ctf-stage-item--locked">
        <span class="ctf-stage-num">${icon('lock', 'ico ico--sm')}</span>
        <div class="ctf-stage-body">
          <strong>${escapeHtml(s.title)}</strong>
          <span class="ctf-stage-locked-note">${t('Розблокується після попередньої стадії')}</span>
        </div>
      </div>`;
    }
    return `<div class="ctf-stage-item ctf-stage-item--active" data-challenge-id="${c.id}" data-stage-id="${s.id}">
      <span class="ctf-stage-num">${i + 1}</span>
      <div class="ctf-stage-body">
        <strong>${escapeHtml(s.title)}</strong>
        <span class="ctf-stage-pts">${s.points} pts${s.hint_available ? ` · ${t('підказка -{cost}', { cost: s.hint_cost })}` : ''}</span>
        ${s.description ? `<p class="ctf-stage-desc">${escapeHtml(s.description)}</p>` : ''}
        ${s.hint_unlocked && s.hint_text ? `<p class="ctf-stage-hint-text ico-inline">${icon('lightbulb', 'ico ico--sm')}${escapeHtml(s.hint_text)}</p>` : ''}
        <div class="ctf-stage-actions">
          <input type="text" class="ctf-flag-input ctf-stage-flag-input" placeholder="lab{...}">
          <button type="button" class="btn btn--primary btn--sm ctf-stage-submit-btn">${t('Здати flag')}</button>
          ${s.hint_available && !s.hint_unlocked ? `<button type="button" class="btn btn--ghost btn--sm ctf-stage-hint-btn">${icon('lightbulb', 'ico ico--sm')}${t('Підказка (-{cost})', { cost: s.hint_cost })}</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function applyCtfFilters() {
  const query = document.getElementById('ctf-filter-search')?.value.trim().toLowerCase() || '';
  const cat = document.getElementById('ctf-filter-category')?.value || '';
  const diff = document.getElementById('ctf-filter-difficulty')?.value || '';
  const status = document.getElementById('ctf-filter-status')?.value || '';
  return ctfAllChallenges.filter(c => {
    if (query && !`${c.title} ${c.description || ''}`.toLowerCase().includes(query)) return false;
    if (cat && (c.category || 'misc') !== cat) return false;
    if (diff && c.difficulty !== diff) return false;
    if (status === 'open' && c.completed) return false;
    if (status === 'completed' && !c.completed) return false;
    return true;
  });
}

function bindCtfFiltersOnce() {
  if (ctfFiltersBound) return;
  ctfFiltersBound = true;
  document.getElementById('ctf-filter-search')?.addEventListener('input', renderCtfList);
  ['ctf-filter-category', 'ctf-filter-difficulty', 'ctf-filter-status'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderCtfList);
  });
}

function renderCtfList() {
  const el = document.getElementById('ctf-list');
  if (!el) return;
  const filtered = applyCtfFilters();

  if (!ctfAllChallenges.length) {
    el.innerHTML = `<p class="empty-state">${t('CTF завдань поки немає')}</p>`;
    return;
  }
  if (!filtered.length) {
    el.innerHTML = `<p class="empty-state">${t('Нічого не знайдено за цими фільтрами')}</p>`;
    return;
  }

  el.innerHTML = filtered.map(c => {
    const solvedCount = c.stages.filter(s => s.completed).length;
    const earnedPts = c.stages.reduce((sum, s) => sum + (s.points_awarded || 0), 0);
    const progressPct = c.stages.length ? Math.round((solvedCount / c.stages.length) * 100) : 0;

    return `
      <article class="ctf-card ${c.completed ? 'completed' : ''}" data-id="${c.id}">
        <div class="ctf-card-top">
          <span class="difficulty difficulty--${c.difficulty}">${c.difficulty}</span>
          <span class="ctf-category-badge">${escapeHtml(CTF_CATEGORY_LABELS[c.category] || c.category || 'misc')}</span>
          <span class="challenge-reward">+${c.bounty_reward} pts</span>
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.description || '')}</p>
        ${c.time_limit_minutes ? `<div class="task-card-meta">${t('Ліміт: {min} хв', { min: c.time_limit_minutes })}</div>` : ''}
        ${c.time_limit_minutes && c.started_at && !c.completed ? `<div class="task-timer ctf-timer ico-inline" id="ctf-timer-${c.id}">${icon('clock', 'ico ico--sm')} —</div>` : ''}
        ${c.docker_image ? (
          c.deployment?.status === 'running' && ctfInfra.mockMode
            ? `<div class="ctf-demo-banner">
                <strong>${t('Demo стенд')}</strong>
                <p>${t('Інтерактивна симуляція завдання — відкрийте стенд, знайдіть flag і здайте його нижче.')}</p>
                <a href="${escapeHtml(c.deployment.target_url)}" target="_blank" rel="noopener" class="btn btn--primary btn--sm ico-inline">${icon('play', 'ico ico--sm')}${t('Відкрити demo-стенд')}</a>
              </div>`
            : (c.deployment?.target_url
              ? `<div class="ctf-target"><a href="${escapeHtml(c.deployment.target_url)}" target="_blank" rel="noopener">${escapeHtml(c.deployment.target_url)}</a>${c.deployment.access_mode === 'secure_tunnel' ? `<span class="ctf-target-host ico-inline">${icon('lock', 'ico ico--sm')}${t('HTTPS тунель')}</span>` : (c.deployment.public_host ? `<span class="ctf-target-host">${escapeHtml(c.deployment.public_host)}</span>` : '')}</div>
                 ${(c.deployment.network_targets || []).map(target => `
                   <div class="lab-access-box">
                     <span class="lab-vm-label">${escapeHtml(target.label)}</span>
                     <code class="lab-ssh-cmd">${escapeHtml(target.hint)}</code>
                   </div>`).join('')}
                 ${c.deployment.ssh_command ? `
                   <div class="lab-access-box">
                     <span class="lab-vm-label">SSH</span>
                     <code class="lab-ssh-cmd">${escapeHtml(c.deployment.ssh_command)}</code>
                   </div>` : ''}
                 ${c.deployment.ssh_password ? `
                   <div class="lab-access-box">
                     <span class="lab-vm-label">${t('Пароль')}</span>
                     <code class="lab-ssh-cmd">${escapeHtml(c.deployment.ssh_password)}</code>
                   </div>` : ''}`
              : `<div class="ctf-actions">
                  ${!c.deployment || c.deployment.status !== 'running'
                    ? `<button type="button" class="btn btn--outline btn--sm ctf-start-btn" data-id="${c.id}">${t('Запустити стенд')}</button>`
                    : `<button type="button" class="btn btn--ghost btn--sm ctf-stop-btn" data-id="${c.id}">${t('Зупинити')}</button>`}
                </div>`)
        ) : ''}
        <div class="ctf-progress-bar"><div class="ctf-progress-fill" style="width:${progressPct}%"></div></div>
        <div class="ctf-progress-label">${t('{solved}/{total} стадій', { solved: solvedCount, total: c.stages.length })} · ${earnedPts}/${c.bounty_reward} pts</div>
        <div class="ctf-stage-chain">
          ${c.completed
            ? `<div class="ctf-stage-item ctf-stage-item--done"><span class="ctf-stage-num">${icon('check', 'ico ico--sm')}</span><div class="ctf-stage-body"><strong>${t('Усі стадії пройдено 🎉')}</strong></div></div>`
            : renderCtfStageChain(c)}
        </div>
      </article>`;
  }).join('');

  initCtfTimers(filtered);

  el.querySelectorAll('.ctf-start-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api(`/lab/ctf/${btn.dataset.id}/start`, { method: 'POST' });
        showToast(t('CTF стенд запущено'));
        loadCtfPanel();
      } catch (err) { showToast(err.message, 'error'); btn.disabled = false; }
    });
  });
  el.querySelectorAll('.ctf-stop-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/lab/ctf/${btn.dataset.id}/stop`, { method: 'POST' });
        showToast(t('CTF зупинено'));
        loadCtfPanel();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
  el.querySelectorAll('.ctf-stage-item--active').forEach(item => {
    const challengeId = item.dataset.challengeId;
    const stageId = item.dataset.stageId;
    item.querySelector('.ctf-stage-submit-btn')?.addEventListener('click', async () => {
      const flag = item.querySelector('.ctf-stage-flag-input')?.value;
      try {
        const res = await api(`/lab/ctf/${challengeId}/flag`, {
          method: 'POST',
          body: JSON.stringify({ stageId, flag }),
        });
        setSession(localStorage.getItem('lab_token'), res.user);
        showToast(res.message);
        await loadDashboard();
        loadCtfPanel();
      } catch (err) { showToast(err.message, 'error'); }
    });
    item.querySelector('.ctf-stage-hint-btn')?.addEventListener('click', async () => {
      if (!confirm(t('Підказка спише частину балів за цю стадію. Відкрити?'))) return;
      try {
        await api(`/lab/ctf/${challengeId}/hint/${stageId}`, { method: 'POST' });
        showToast(t('Підказку відкрито'));
        loadCtfPanel();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

let ctfInfra = { mockMode: true };

async function loadCtfPanel() {
  const el = document.getElementById('ctf-list');
  const tag = document.getElementById('ctf-infra-tag');
  try {
    const { challenges, infra } = await api('/lab/ctf');
    ctfInfra = infra;
    tag.textContent = infra.mockMode ? 'demo режим' : 'live';
    ctfAllChallenges = challenges;
    bindCtfFiltersOnce();
    renderCtfList();
    startCtfActivityPolling();
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function startCtfActivityPolling() {
  stopCtfActivityPolling();
  loadCtfActivity();
  ctfActivityInterval = setInterval(loadCtfActivity, 20000);
}

function vmStatusLabel(s) {
  const map = {
    none: 'немає',
    pending: 'очікує налаштування',
    provisioning: 'створення...',
    running: 'працює',
    stopped: 'зупинено',
    error: 'помилка',
  };
  return t(map[s] || s);
}

let labPollTimer = null;

async function loadLabPanel() {
  const content = document.getElementById('lab-vm-content');
  const tag = document.getElementById('lab-vm-tag');
  try {
    const { vm, dockerDeployments, infra } = await api('/lab');
    tag.textContent = infra.proxmoxConfigured ? 'Proxmox' : 'demo';

    const showStart = vm.status === 'stopped' && !!vm.proxmox_vmid;
    const showStop = vm.status === 'running' && !!vm.proxmox_vmid;
    const showReset = ['running', 'stopped', 'error'].includes(vm.status);

    content.innerHTML = `
      <div class="lab-vm-grid">
        <div class="lab-vm-stat"><span class="lab-vm-label">${t('Статус')}</span><span class="lab-vm-val">${vmStatusLabel(vm.status)}</span></div>
        <div class="lab-vm-stat"><span class="lab-vm-label">Hostname</span><span class="lab-vm-val">${escapeHtml(vm.hostname || '—')}</span></div>
        <div class="lab-vm-stat"><span class="lab-vm-label">${t('Доступ')}</span><span class="lab-vm-val">${vm.http_url ? `<a href="${escapeHtml(vm.http_url)}" target="_blank" rel="noopener">${escapeHtml(vm.secure_url ? t('Відкрити (HTTPS тунель)') : vm.public_host || vm.http_url)}</a>` : '—'}</span></div>
        ${vm.public_host && vm.secure_url ? `<div class="lab-vm-stat"><span class="lab-vm-label">sslip ${t('шлюз')}</span><span class="lab-vm-val">${escapeHtml(vm.public_host)}</span></div>` : ''}
        <div class="lab-vm-stat"><span class="lab-vm-label">IP</span><span class="lab-vm-val">${escapeHtml(vm.ip || '—')}</span></div>
        <div class="lab-vm-stat"><span class="lab-vm-label">VMID</span><span class="lab-vm-val">${vm.proxmox_vmid || '—'}</span></div>
      </div>
      ${vm.ssh_command && vm.public_host ? `<div class="lab-access-box"><span class="lab-vm-label">SSH</span><code class="lab-ssh-cmd">${escapeHtml(vm.ssh_command)}</code></div>` : ''}
      ${infra.publicAccess?.useSecureTunnel ? `<p class="lab-hint lab-hint--secure ico-inline">${icon('lock', 'ico ico--sm ico--ok')}<span>${t('Доступ через захищений HTTPS-тунель sslip.io — токен у URL, порти Docker/VM не відкриті в інтернет')}</span></p>` : (infra.publicAccess?.useSslip ? `<p class="lab-hint ico-inline">${icon('globe', 'ico ico--sm')}<span>${t('Доступ через sslip.io')}</span></p>` : '')}
      ${vm.error_message ? `<p class="form-error ico-inline" style="display:flex;align-items:flex-start;gap:8px">${icon('warning', 'ico ico--sm ico--err')}<span>${escapeHtml(vm.error_message)}</span></p>` : ''}
      ${vm.status === 'pending' ? `<p class="lab-status-note ico-inline">${icon('server', 'ico ico--sm')}<span>${t('Машина буде створена автоматично після налаштування Proxmox адміністратором')}</span></p>` : ''}
      ${vm.status === 'provisioning' ? `<p class="lab-status-note ico-inline">${icon('loader', 'ico ico--sm ico--spin')}<span>${t('Створюємо вашу машину, зачекайте...')}</span></p>` : ''}
      <div class="lab-vm-actions">
        ${showStart ? `<button type="button" class="btn btn--outline btn--sm" id="lab-start">${t('Запустити')}</button>` : ''}
        ${showStop ? `<button type="button" class="btn btn--outline btn--sm" id="lab-stop">${t('Зупинити')}</button>` : ''}
        ${showReset ? `<button type="button" class="btn btn--ghost btn--sm" id="lab-reset">${t('Пересоздати')}</button>` : ''}
      </div>`;

    document.getElementById('lab-start')?.addEventListener('click', () => labAction('start'));
    document.getElementById('lab-stop')?.addEventListener('click', () => labAction('stop'));
    document.getElementById('lab-reset')?.addEventListener('click', () => {
      if (confirm(t('Пересоздати машину? Усі дані на VM будуть втрачені.'))) labAction('reset');
    });

    if (vm.status === 'provisioning') {
      clearTimeout(labPollTimer);
      labPollTimer = setTimeout(loadLabPanel, 5000);
    } else {
      clearTimeout(labPollTimer);
    }

    renderDockerList(dockerDeployments || []);
  } catch (err) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

async function labAction(action) {
  const paths = { start: '/vm/start', stop: '/vm/stop', reset: '/vm/reset' };
  try {
    const res = await api(`/lab${paths[action]}`, { method: 'POST' });
    showToast(res.message);
    loadLabPanel();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderDockerList(deployments) {
  const el = document.getElementById('docker-list');
  if (!el) return;
  if (!deployments.length) {
    el.innerHTML = `<p class="empty-state">${t('Ще немає Docker-деплоїв')}</p>`;
    return;
  }
  el.innerHTML = deployments.map(d => `
    <div class="docker-item">
      <div>
        <strong>${escapeHtml(d.name)}</strong>
        <div class="docker-item-meta">${escapeHtml(d.image)} · ${d.status}</div>
        ${d.target_url ? `<a href="${escapeHtml(d.target_url)}" target="_blank" rel="noopener">${escapeHtml(d.target_url)}</a>` : ''}
      </div>
      ${d.status === 'running' ? `<button type="button" class="btn btn--ghost btn--sm docker-stop" data-id="${d.id}">${t('Зупинити')}</button>` : ''}
    </div>`).join('');

  el.querySelectorAll('.docker-stop').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/lab/docker/${btn.dataset.id}/stop`, { method: 'POST' });
        showToast(t('Контейнер зупинено'));
        loadLabPanel();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

if (!window.__labSubtabsBound) {
  window.__labSubtabsBound = true;
  document.querySelector('.lab-subtabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.lab-subtab');
    if (!tab) return;
    document.querySelectorAll('.lab-subtab').forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('lab-panel-vm').hidden = tab.dataset.lab !== 'vm';
    document.getElementById('lab-panel-docker').hidden = tab.dataset.lab !== 'docker';
  });
}

document.getElementById('docker-deploy-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const image = document.getElementById('docker-image').value;
  const name = document.getElementById('docker-name').value;
  try {
    await api('/lab/docker/deploy', { method: 'POST', body: JSON.stringify({ image, name }) });
    showToast(t('Docker контейнер розгорнуто'));
    document.getElementById('docker-image').value = '';
    document.getElementById('docker-name').value = '';
    activeDashTab = 'lab';
    setupDashTabs(dashboardData?.canWriteArticles);
    loadLabPanel();
    document.querySelectorAll('.lab-subtab').forEach(t => t.classList.toggle('active', t.dataset.lab === 'docker'));
    document.getElementById('lab-panel-vm').hidden = true;
    document.getElementById('lab-panel-docker').hidden = false;
  } catch (err) { showToast(err.message, 'error'); }
});

window.addEventListener('localechange', () => loadDashboard());
