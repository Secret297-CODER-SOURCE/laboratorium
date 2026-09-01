import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm } from '/dialog.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmtLessonDate(iso) {
  const d = new Date(iso.includes('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('uk-UA', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function renderBarChart(weekly) {
  if (!weekly?.length) return '<p class="empty-state">Немає даних за період</p>';
  const max = Math.max(...weekly.map(w => Math.max(w.lessons, w.absences)), 1);
  return `<div class="sched-chart">
    ${weekly.map(w => `
      <div class="sched-chart-col">
        <div class="sched-chart-bars">
          <div class="sched-bar sched-bar--lessons" style="height:${(w.lessons / max) * 100}%" title="Заняття: ${w.lessons}"></div>
          <div class="sched-bar sched-bar--absent" style="height:${(w.absences / max) * 100}%" title="Відсутності: ${w.absences}"></div>
        </div>
        <span class="sched-chart-label">${esc(w.week?.replace(/^\d{4}-/, '') || '')}</span>
      </div>`).join('')}
  </div>
  <div class="sched-chart-legend">
    <span><i class="sched-dot sched-dot--lessons"></i>Заняття</span>
    <span><i class="sched-dot sched-dot--absent"></i>Відсутності</span>
  </div>`;
}

function renderStudentBars(byStudent) {
  if (!byStudent?.length) return '<p class="empty-state">Немає учнів у групі</p>';
  return `<div class="sched-student-bars">
    ${byStudent.map(s => `
      <div class="sched-student-row">
        <span class="sched-student-name">@${esc(s.handle)}</span>
        <div class="sched-student-track">
          <div class="sched-student-fill" style="width:${s.attendance_pct}%"></div>
        </div>
        <span class="sched-student-pct">${s.attendance_pct}%</span>
        <span class="sched-student-abs">${s.absences} відс.</span>
      </div>`).join('')}
  </div>`;
}

export function renderSchedulePanel(groups, scheduleData = {}, groupFilter = '') {
  const { lessons = [], absences = [], stats = {} } = scheduleData;
  const groupOpts = (groups || []).map(g =>
    `<option value="${g.id}"${String(g.id) === String(groupFilter) ? ' selected' : ''}>${esc(g.name)}</option>`).join('');

  const now = new Date();
  const defaultDt = new Date(now.getTime() + 86400000);
  defaultDt.setMinutes(0, 0, 0);
  const defaultLocal = new Date(defaultDt.getTime() - defaultDt.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('calendar', 'ico ico--md')}Розклад занять</h2>
      <select class="admin-inp" id="sched-group-filter" style="width:auto;min-width:160px">
        <option value=""${!groupFilter ? ' selected' : ''}>Усі групи</option>${groupOpts}
      </select>
    </div>

    <div class="sched-grid">
      <div class="sched-form-card">
        <h3>Додати заняття</h3>
        <div class="sched-form">
          <select class="admin-inp" id="sched-new-group" required>
            <option value="">Група</option>${groupOpts}
          </select>
          <input class="admin-inp" id="sched-new-title" placeholder="Назва заняття" required>
          <input class="admin-inp" id="sched-new-at" type="datetime-local" value="${defaultLocal}" required>
          <input class="admin-inp" id="sched-new-duration" type="number" min="30" step="15" value="90" placeholder="Хвилин">
          <input class="admin-inp" id="sched-new-topic" placeholder="Тема (необов'язково)">
          <input class="admin-inp" id="sched-new-location" placeholder="Аудиторія / посилання">
          <button type="button" class="btn btn--primary btn--sm" id="sched-add-btn">${icon('plus', 'ico ico--sm')}Додати</button>
        </div>
      </div>

      <div class="sched-chart-card">
        <h3>Графік по тижнях</h3>
        <div id="sched-weekly-chart">${renderBarChart(stats.weekly)}</div>
      </div>

      <div class="sched-chart-card sched-chart-card--wide">
        <h3>Відвідуваність учнів</h3>
        <div id="sched-student-chart">${renderStudentBars(stats.byStudent)}</div>
      </div>
    </div>

    <div class="sched-two-col">
      <div>
        <h3>Заняття <span class="sched-badge">${lessons.length}</span></h3>
        <div class="sched-lesson-list" id="sched-lesson-list">
          ${lessons.length ? lessons.map(l => `
            <article class="sched-lesson-item" data-id="${l.id}">
              <div>
                <strong>${esc(l.title)}</strong>
                <div class="sched-lesson-meta">${fmtLessonDate(l.lesson_at)} · ${esc(l.group_name)} · ${l.duration_minutes} хв</div>
                ${l.topic ? `<div class="sched-lesson-topic">${esc(l.topic)}</div>` : ''}
              </div>
              <div class="sched-lesson-side">
                ${l.absence_count ? `<span class="sched-abs-badge">${l.absence_count} відс.</span>` : ''}
                <button type="button" class="btn btn--ghost btn--sm sched-del" data-id="${l.id}">${icon('trash', 'ico ico--sm')}</button>
              </div>
            </article>`).join('') : '<p class="empty-state">Розклад порожній</p>'}
        </div>
      </div>
      <div>
        <h3>Відсутності <span class="sched-badge sched-badge--warn">${stats.pending_absences || 0} нових</span></h3>
        <div class="sched-absence-list" id="sched-absence-list">
          ${absences.length ? absences.map(a => `
            <article class="sched-absence-item ${a.status}">
              <div>
                <strong>@${esc(a.student_handle)}</strong> · ${esc(a.group_name)}
                <div class="sched-lesson-meta">${esc(a.lesson_title)} · ${fmtLessonDate(a.lesson_at)}</div>
                <blockquote class="sched-reason">${esc(a.reason)}</blockquote>
              </div>
              ${a.status === 'reported' ? `<button type="button" class="btn btn--outline btn--sm sched-ack" data-id="${a.id}">Переглянуто</button>` : '<span class="status-pill running">переглянуто</span>'}
            </article>`).join('') : '<p class="empty-state">Відсутностей немає</p>'}
        </div>
      </div>
    </div>
  </section>`;
}

export async function loadScheduleData(groups, groupFilter = '') {
  const qs = groupFilter ? `?groupId=${groupFilter}` : '';
  const [lessonsRes, absencesRes, statsRes] = await Promise.allSettled([
    api(`/admin/schedule/lessons${qs}`),
    api(`/admin/schedule/absences${qs}`),
    api(`/admin/schedule/stats${qs}`),
  ]);

  const pick = (res, fallback) => (res.status === 'fulfilled' ? res.value : fallback);

  return {
    lessons: pick(lessonsRes, {}).lessons || [],
    absences: pick(absencesRes, {}).absences || [],
    stats: pick(statsRes, { weekly: [], byStudent: [], pending_absences: 0 }),
  };
}

let scheduleEventsBound = false;

export function bindSchedulePanelEvents(showToast, reload) {
  if (scheduleEventsBound) return;
  scheduleEventsBound = true;

  document.addEventListener('change', (e) => {
    if (e.target?.id !== 'sched-group-filter') return;
    const url = new URL(location.href);
    if (e.target.value) url.searchParams.set('groupId', e.target.value);
    else url.searchParams.delete('groupId');
    history.replaceState(null, '', url);
    reload();
  });

  document.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('#sched-add-btn');
    if (addBtn) {
      const group_id = document.getElementById('sched-new-group')?.value;
      const title = document.getElementById('sched-new-title')?.value;
      const lesson_at = document.getElementById('sched-new-at')?.value;
      const duration_minutes = document.getElementById('sched-new-duration')?.value;
      const topic = document.getElementById('sched-new-topic')?.value;
      const location = document.getElementById('sched-new-location')?.value;
      if (!group_id || !title?.trim() || !lesson_at) {
        return showToast('Заповніть групу, назву і дату', 'error');
      }
      try {
        await api('/admin/schedule/lessons', {
          method: 'POST',
          body: JSON.stringify({
            group_id, title, lesson_at: new Date(lesson_at).toISOString(),
            duration_minutes, topic, location,
          }),
        });
        showToast('Заняття додано');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
      return;
    }

    const delBtn = e.target.closest('.sched-del');
    if (delBtn) {
      if (!(await showConfirm('Скасувати заняття?', { danger: true }))) return;
      try {
        await api(`/admin/schedule/lessons/${delBtn.dataset.id}`, { method: 'DELETE' });
        showToast('Заняття скасовано');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
      return;
    }

    const ackBtn = e.target.closest('.sched-ack');
    if (ackBtn) {
      try {
        await api(`/admin/schedule/absences/${ackBtn.dataset.id}/acknowledge`, { method: 'POST' });
        showToast('Відмітку переглянуто');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    }
  });
}
