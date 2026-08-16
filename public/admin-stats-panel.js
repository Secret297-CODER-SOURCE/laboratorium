import { api } from '/auth.js';
import { icon } from '/icons.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function statusLabel(status) {
  const map = {
    available: 'доступна',
    taken: 'в роботі',
    review: 'на перевірці',
    completed: 'завершено',
  };
  return map[status] || status;
}

export function renderStatsPanel(data = {}) {
  const { summary = {}, leaderboard = [], tasks = [], quizzes = [] } = data;

  return `<section class="admin-panel admin-panel--wide stats-panel">
    <div class="admin-panel-head">
      <h2>${icon('chart', 'ico ico--md')}Статистика виконання</h2>
    </div>

    <div class="admin-stats stats-summary">
      <div class="admin-stat"><span class="admin-stat-val">${summary.students || 0}</span><span class="admin-stat-label">Учнів</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${summary.tasks_completed || 0}</span><span class="admin-stat-label">Задач здано</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${summary.quizzes_passed || 0}</span><span class="admin-stat-label">Тестів пройдено</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${summary.avg_duration_label || '—'}</span><span class="admin-stat-label">Сер. час</span></div>
    </div>

    <div class="stats-grid">
      <section class="admin-panel admin-panel--wide">
        <h3>Рейтинг учнів</h3>
        <div class="stats-table-wrap">
          <table class="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Учень</th>
                <th>Задачі</th>
                <th>Тести</th>
                <th>CTF</th>
                <th>Всього</th>
                <th>Сер. час</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${leaderboard.length ? leaderboard.map(s => `
                <tr>
                  <td>${s.rank}</td>
                  <td><strong>@${esc(s.handle)}</strong><br><span class="stats-muted">${esc(s.name)}</span></td>
                  <td>${s.tasks_completed}</td>
                  <td>${s.quizzes_passed}</td>
                  <td>${s.challenges_completed}</td>
                  <td><strong>${s.total_completions}</strong></td>
                  <td>${esc(s.avg_duration_label || '—')}</td>
                  <td><button type="button" class="btn btn--ghost btn--sm stats-student-btn" data-id="${s.user_id}">Деталі</button></td>
                </tr>`).join('') : '<tr><td colspan="8" class="empty-state">Немає даних</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-panel">
        <h3>Задачі груп</h3>
        <div class="stats-mini-list">
          ${tasks.length ? tasks.map(t => `
            <button type="button" class="stats-mini-item stats-task-btn" data-id="${t.id}">
              <strong>${esc(t.title)}</strong>
              <span class="stats-muted">${esc(t.group_name)} · ${t.completed_count}/${t.total_assignments} · ${t.completion_rate}%</span>
              <span class="stats-muted">сер. ${esc(t.avg_duration_label || '—')}${t.time_limit_minutes ? ` · <span class="ico-inline">${icon('clock', 'ico ico--sm')}${t.time_limit_minutes} хв</span>` : ''}</span>
            </button>`).join('') : '<p class="empty-state">Задач ще немає</p>'}
        </div>
      </section>

      <section class="admin-panel">
        <h3>Тести</h3>
        <div class="stats-mini-list">
          ${quizzes.length ? quizzes.map(q => `
            <button type="button" class="stats-mini-item stats-quiz-btn" data-id="${q.id}">
              <strong>${esc(q.title)}</strong>
              <span class="stats-muted">${esc(q.group_name)} · ${q.passed_count}/${q.attempts_count} · ${q.pass_rate}%</span>
              <span class="stats-muted">сер. ${esc(q.avg_duration_label || '—')}${q.avg_score_percent != null ? ` · ${q.avg_score_percent}%` : ''}</span>
            </button>`).join('') : '<p class="empty-state">Тестів ще немає</p>'}
        </div>
      </section>
    </div>
  </section>

  <div id="stats-detail-modal" class="group-modal" hidden>
    <div class="group-modal-inner group-modal-inner--wide">
      <button type="button" class="group-modal-close" id="stats-detail-close">×</button>
      <div id="stats-detail-body"></div>
    </div>
  </div>`;
}

function renderStudentDetail(data) {
  const { student, summary, tasks, quizzes, challenges } = data;
  return `
    <h3>@${esc(student.handle)} — ${esc(student.name)}</h3>
    <div class="stats-detail-summary">
      <span>Задачі: <strong>${summary.tasks_completed}</strong></span>
      <span>Тести: <strong>${summary.quizzes_passed}</strong></span>
      <span>CTF: <strong>${summary.challenges_completed}</strong></span>
      <span>Всього: <strong>${summary.total_completions}</strong></span>
    </div>
    <h4>Задачі</h4>
    ${tasks.length ? `<table class="stats-table stats-table--compact"><thead><tr><th>Задача</th><th>Статус</th><th>Час роботи</th><th>Загалом</th></tr></thead><tbody>
      ${tasks.map(t => `<tr><td>${esc(t.title)}<br><span class="stats-muted">${esc(t.group_name)}</span></td><td>${statusLabel(t.status)}</td><td>${esc(t.work_duration_label || '—')}</td><td>${esc(t.duration_label || '—')}</td></tr>`).join('')}
    </tbody></table>` : '<p class="empty-state">Немає задач</p>'}
    <h4>Тести</h4>
    ${quizzes.length ? `<table class="stats-table stats-table--compact"><thead><tr><th>Тест</th><th>Бал</th><th>Час</th><th>Результат</th></tr></thead><tbody>
      ${quizzes.map(q => `<tr><td>${esc(q.title)}</td><td>${q.score_percent}%</td><td>${esc(q.duration_label || '—')}</td><td>${icon(q.passed ? 'check' : 'x', `ico ico--sm ${q.passed ? 'ico--ok' : 'ico--err'}`)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="empty-state">Немає тестів</p>'}
    <h4>CTF / Challenges</h4>
    ${challenges.length ? `<table class="stats-table stats-table--compact"><thead><tr><th>Завдання</th><th>Складність</th><th>Час</th></tr></thead><tbody>
      ${challenges.map(c => `<tr><td>${esc(c.title)}</td><td>${esc(c.difficulty)}</td><td>${esc(c.duration_label || '—')}</td></tr>`).join('')}
    </tbody></table>` : '<p class="empty-state">Немає CTF</p>'}
  `;
}

function renderTaskDetail(data) {
  const { task, summary, assignments } = data;
  return `
    <h3>${esc(task.title)}</h3>
    <p class="stats-muted">${esc(task.group_name)} · завершено ${summary.completed}/${summary.total}${task.time_limit_minutes ? ` · ліміт ${task.time_limit_minutes} хв` : ''}</p>
    <div class="stats-detail-summary">
      <span>На перевірці: <strong>${summary.in_review}</strong></span>
      <span>В роботі: <strong>${summary.in_progress}</strong></span>
      <span>Сер. час: <strong>${esc(summary.avg_duration_label || '—')}</strong></span>
    </div>
    <table class="stats-table stats-table--compact"><thead><tr><th>Учень</th><th>Статус</th><th>Взято</th><th>Здано</th><th>Час роботи</th><th>Загалом</th></tr></thead><tbody>
      ${assignments.map(a => `<tr>
        <td>@${esc(a.student_handle)}</td>
        <td>${statusLabel(a.status)}</td>
        <td>${esc(a.taken_at || '—')}</td>
        <td>${esc(a.submitted_at || '—')}</td>
        <td>${esc(a.work_duration_label || '—')}</td>
        <td>${esc(a.duration_label || '—')}</td>
      </tr>`).join('')}
    </tbody></table>
  `;
}

function renderQuizDetail(data) {
  const { quiz, summary, attempts } = data;
  return `
    <h3>${esc(quiz.title)}</h3>
    <p class="stats-muted">${esc(quiz.group_name || '')} · прохід ${quiz.pass_percent}%${quiz.time_limit_minutes ? ` · ліміт ${quiz.time_limit_minutes} хв` : ''}</p>
    <div class="stats-detail-summary">
      <span>Спроб: <strong>${summary.attempts}</strong></span>
      <span>Пройдено: <strong>${summary.passed}</strong> (${summary.pass_rate}%)</span>
      <span>Сер. бал: <strong>${summary.avg_score_percent ?? '—'}%</strong></span>
      <span>Сер. час: <strong>${esc(summary.avg_duration_label || '—')}</strong></span>
    </div>
    <table class="stats-table stats-table--compact"><thead><tr><th>Учень</th><th>Бал</th><th>Час</th><th>Результат</th></tr></thead><tbody>
      ${attempts.length ? attempts.map(a => `<tr>
        <td>@${esc(a.student_handle)}</td>
        <td>${a.score_percent}%</td>
        <td>${esc(a.duration_label || '—')}</td>
        <td>${icon(a.passed ? 'check' : 'x', `ico ico--sm ${a.passed ? 'ico--ok' : 'ico--err'}`)}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="empty-state">Ще немає спроб</td></tr>'}
    </tbody></table>
  `;
}

async function openStatsModal(html) {
  const modal = document.getElementById('stats-detail-modal');
  const body = document.getElementById('stats-detail-body');
  if (!modal || !body) return;
  body.innerHTML = html;
  modal.hidden = false;
}

export function bindStatsPanelEvents(showToast) {
  document.getElementById('stats-detail-close')?.addEventListener('click', () => {
    const modal = document.getElementById('stats-detail-modal');
    if (modal) modal.hidden = true;
  });
  document.getElementById('stats-detail-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'stats-detail-modal') e.target.hidden = true;
  });

  document.querySelectorAll('.stats-student-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const data = await api(`/admin/stats/students/${btn.dataset.id}`);
        await openStatsModal(renderStudentDetail(data));
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.stats-task-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const data = await api(`/admin/stats/tasks/${btn.dataset.id}`);
        await openStatsModal(renderTaskDetail(data));
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.stats-quiz-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const data = await api(`/admin/stats/quizzes/${btn.dataset.id}`);
        await openStatsModal(renderQuizDetail(data));
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

export async function loadStatsAdminData() {
  return api('/admin/stats');
}
