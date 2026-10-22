import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm, showForm } from '/dialog.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function fmtLessonDate(iso) {
  const d = new Date(iso.includes('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('uk-UA', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function toLocalInput(iso) {
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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

export function renderSchedulePanel(groups, scheduleData = {}, groupFilter = '', canManageCalendar = false, activeView = 'schedule') {
  const { lessons = [], conferences = [], absences = [], stats = {}, calendarEvents = [], students = [], calendarSync = {} } = scheduleData;
  const groupOpts = (groups || []).map(g =>
    `<option value="${g.id}"${String(g.id) === String(groupFilter) ? ' selected' : ''}>${esc(g.name)}</option>`).join('');
  const audienceGroupOpts = (groups || []).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  const studentOpts = students.filter(student => student.role === 'student').map(student =>
    `<option value="${student.id}">${esc(student.name)} (@${esc(student.handle)})</option>`).join('');

  const now = new Date();
  const defaultDt = new Date(now.getTime() + 86400000);
  defaultDt.setMinutes(0, 0, 0);
  const defaultLocal = new Date(defaultDt.getTime() - defaultDt.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
  const syncTime = calendarSync.ctftime_calendar_sync_at
    ? new Date(calendarSync.ctftime_calendar_sync_at).toLocaleString('uk-UA')
    : 'Ще не синхронізовано';
  const calendarPanel = canManageCalendar ? `
    <div class="sched-calendar-admin">
      <div class="sched-calendar-admin-head">
        <div><h3>Події в календарі учнів</h3><p>Додавайте власні події для всіх учнів, групи або окремого учня. У списку — минулий місяць і майбутні події.</p></div>
        <div class="sched-calendar-sync"><span>Події CTF · оновлено: ${esc(syncTime)}</span><button type="button" class="btn btn--outline btn--sm" id="ctftime-sync-btn">Оновити зараз</button></div>
      </div>
      <div class="sched-calendar-form">
        <label>Назва<input class="admin-inp" id="cal-event-title" maxlength="180" placeholder="Наприклад, командний CTF" required></label>
        <label>Дата і час<input class="admin-inp" id="cal-event-start" type="datetime-local" value="${defaultLocal}" required></label>
        <label>Завершення<input class="admin-inp" id="cal-event-end" type="datetime-local"></label>
        <label>Кому<select class="admin-inp" id="cal-event-audience-type">
          <option value="all">Усі учні</option><option value="group">Одна група</option><option value="student">Один учень</option>
        </select></label>
        <label id="cal-event-target-wrap" hidden>Оберіть адресата<select class="admin-inp" id="cal-event-target">
          <option value="">Оберіть…</option><optgroup label="Групи">${audienceGroupOpts}</optgroup><optgroup label="Учні">${studentOpts}</optgroup>
        </select></label>
        <label class="sched-calendar-description">Опис<textarea class="admin-inp" id="cal-event-description" rows="3" maxlength="4000" placeholder="Що відбудеться та що варто підготувати"></textarea></label>
        <label class="sched-calendar-url">Посилання<input class="admin-inp" id="cal-event-url" type="url" placeholder="https://"></label>
        <button type="button" class="btn btn--primary btn--sm" id="cal-event-create">Додати подію</button>
      </div>
      <div class="sched-calendar-event-list">
        ${calendarEvents.length ? calendarEvents.map(event => `
          <article class="sched-calendar-event-row">
            <div><strong>${esc(event.title)}</strong><small>${fmtLessonDate(event.starts_at)} · ${esc(event.audience_label || 'CTF')}</small>
              ${event.description ? `<p>${esc(event.description)}</p>` : ''}
              ${event.url ? `<a href="${esc(event.url)}" target="_blank" rel="noopener noreferrer">Сторінка події</a>` : ''}
            </div>
            ${event.source === 'manual' ? `<button type="button" class="btn btn--ghost btn--sm cal-event-delete" data-id="${event.id}" aria-label="Видалити подію">${icon('trash', 'ico ico--sm')}</button>` : '<span class="sched-badge">CTF</span>'}
          </article>`).join('') : '<p class="empty-state">Подій найближчим часом немає</p>'}
      </div>
    </div>` : '';

  const viewToggle = canManageCalendar ? `
    <div class="sched-view-switch" role="group" aria-label="Перемикання між розкладом та подіями">
      <button type="button" class="sched-view-option${activeView === 'schedule' ? ' active' : ''}" data-sched-view="schedule" aria-pressed="${activeView === 'schedule'}">Розклад</button>
      <button type="button" class="sched-view-option${activeView === 'events' ? ' active' : ''}" data-sched-view="events" aria-pressed="${activeView === 'events'}">Події</button>
      <span class="sched-view-thumb" aria-hidden="true"></span>
    </div>` : '';

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('calendar', 'ico ico--md')}Розклад занять</h2>
      ${viewToggle}
      <select class="admin-inp" id="sched-group-filter" style="width:auto;min-width:160px">
        <option value=""${!groupFilter ? ' selected' : ''}>Усі групи</option>${groupOpts}
      </select>
    </div>

    <div class="sched-grid"${activeView === 'events' ? ' hidden' : ''}>
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
          <label class="sched-repeat-option"><input type="checkbox" id="sched-repeat-weekly"> Щотижня</label>
          <label class="sched-repeat-until" id="sched-repeat-until-wrap" hidden>Повторювати до<input class="admin-inp" id="sched-repeat-until" type="date"></label>
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

    <div class="sched-two-col"${activeView === 'events' ? ' hidden' : ''}>
      <div>
        <h3>Заняття <span class="sched-badge">${lessons.length}</span></h3>
        <div class="sched-lesson-list" id="sched-lesson-list">
          ${lessons.length ? lessons.map(l => `
            <article class="sched-lesson-item" data-id="${l.id}" data-title="${esc(l.title)}" data-at="${esc(l.lesson_at)}"
              data-duration="${l.duration_minutes}" data-topic="${esc(l.topic || '')}" data-location="${esc(l.location || '')}"
              data-series-id="${esc(l.series_id || '')}">
              <div>
                <strong>${esc(l.title)}</strong>
                <div class="sched-lesson-meta">${fmtLessonDate(l.lesson_at)} · ${esc(l.group_name)} · ${l.duration_minutes} хв</div>
                ${l.topic ? `<div class="sched-lesson-topic">${esc(l.topic)}</div>` : ''}
                ${l.series_id ? `<span class="sched-repeat-badge">${l.is_exception ? 'Окрема зміна циклу' : 'Щотижневий цикл'}</span>` : ''}
              </div>
              <div class="sched-lesson-side">
                ${l.absence_count ? `<span class="sched-abs-badge">${l.absence_count} відс.</span>` : ''}
                <button type="button" class="btn btn--ghost btn--sm sched-edit" data-id="${l.id}" aria-label="Редагувати заняття">${icon('edit', 'ico ico--sm')}</button>
                <button type="button" class="btn btn--ghost btn--sm sched-del" data-id="${l.id}">${icon('trash', 'ico ico--sm')}</button>
              </div>
            </article>`).join('') : '<p class="empty-state">Розклад порожній</p>'}
        </div>
        <h3 class="sched-conf-title">Конференції <span class="sched-badge">${conferences.length}</span></h3>
        <div class="sched-lesson-list sched-conf-list" id="sched-conf-list">
          ${conferences.length ? conferences.map(c => `
            <article class="sched-lesson-item sched-conf-item">
              <div>
                <strong>${esc(c.title)}</strong>
                <div class="sched-lesson-meta">${fmtLessonDate(c.scheduled_at)} · ${esc(c.group_name || 'Без групи')} · ${Number(c.duration_minutes) || 60} хв</div>
                <span class="sched-repeat-badge sched-conf-badge">${c.status === 'live' ? 'Іде зараз' : 'Конференція'}</span>
              </div>
              <div class="sched-lesson-side"><a class="btn btn--outline btn--sm" href="/conferences.html">Відкрити</a></div>
            </article>`).join('') : '<p class="empty-state">Запланованих конференцій немає</p>'}
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
    ${activeView === 'events' ? calendarPanel : ''}
  </section>`;
}

export async function loadScheduleData(groups, groupFilter = '', canManageCalendar = false) {
  const qs = groupFilter ? `?groupId=${groupFilter}` : '';
  const calendarRequest = canManageCalendar ? api('/admin/calendar/events') : Promise.resolve({});
  const studentsRequest = canManageCalendar ? api('/admin/users') : Promise.resolve({});
  const [lessonsRes, absencesRes, statsRes, calendarRes, studentsRes, confRes] = await Promise.allSettled([
    api(`/admin/schedule/lessons${qs}`),
    api(`/admin/schedule/absences${qs}`),
    api(`/admin/schedule/stats${qs}`),
    calendarRequest,
    studentsRequest,
    api('/conferences'),
  ]);

  if (canManageCalendar && calendarRes.status === 'rejected') throw calendarRes.reason;
  if (canManageCalendar && studentsRes.status === 'rejected') throw studentsRes.reason;
  const pick = (res, fallback) => (res.status === 'fulfilled' ? res.value : fallback);

  return {
    lessons: pick(lessonsRes, {}).lessons || [],
    conferences: (pick(confRes, {}).conferences || [])
      .filter(c => c.scheduled_at && ['scheduled', 'live'].includes(c.status)
        && (!groupFilter || String(c.group_id) === String(groupFilter)))
      .slice(0, 50),
    absences: pick(absencesRes, {}).absences || [],
    stats: pick(statsRes, { weekly: [], byStudent: [], pending_absences: 0 }),
    calendarEvents: pick(calendarRes, {}).events || [],
    calendarSync: pick(calendarRes, {}).sync || {},
    students: pick(studentsRes, {}).users || [],
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

  document.addEventListener('change', (e) => {
    if (e.target?.id === 'sched-repeat-weekly') {
      document.getElementById('sched-repeat-until-wrap').hidden = !e.target.checked;
      document.getElementById('sched-repeat-until').required = e.target.checked;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target?.id !== 'cal-event-audience-type') return;
    const wrap = document.getElementById('cal-event-target-wrap');
    const target = document.getElementById('cal-event-target');
    const type = e.target.value;
    wrap.hidden = type === 'all';
    target.required = type !== 'all';
    target.querySelectorAll('optgroup').forEach(group => {
      group.hidden = group.label === 'Групи' ? type !== 'group' : type !== 'student';
    });
    target.value = '';
  });

  document.addEventListener('click', async (e) => {
    const viewButton = e.target.closest('[data-sched-view]');
    if (viewButton) {
      const url = new URL(location.href);
      url.searchParams.set('view', viewButton.dataset.schedView);
      history.replaceState(null, '', url);
      reload();
      return;
    }

    const createEventBtn = e.target.closest('#cal-event-create');
    if (createEventBtn) {
      const title = document.getElementById('cal-event-title')?.value.trim();
      const startsLocal = document.getElementById('cal-event-start')?.value;
      const endsLocal = document.getElementById('cal-event-end')?.value;
      const audienceType = document.getElementById('cal-event-audience-type')?.value || 'all';
      const audienceId = document.getElementById('cal-event-target')?.value || null;
      if (!title || !startsLocal || (audienceType !== 'all' && !audienceId)) {
        return showToast('Заповніть назву, дату і адресата події', 'error');
      }
      createEventBtn.disabled = true;
      try {
        await api('/admin/calendar/events', {
          method: 'POST',
          body: JSON.stringify({
            title,
            description: document.getElementById('cal-event-description')?.value,
            starts_at: new Date(startsLocal).toISOString(),
            ends_at: endsLocal ? new Date(endsLocal).toISOString() : null,
            url: document.getElementById('cal-event-url')?.value.trim() || null,
            audience_type: audienceType,
            audience_id: audienceId,
          }),
        });
        showToast('Подію додано до календаря');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
      finally { createEventBtn.disabled = false; }
      return;
    }

    const syncBtn = e.target.closest('#ctftime-sync-btn');
    if (syncBtn) {
      syncBtn.disabled = true;
      try {
        const { result } = await api('/admin/calendar/ctftime/sync', { method: 'POST' });
        showToast(`CTF: додано ${result.added}, імпортовано/оновлено ${result.imported}`);
        reload();
      } catch (err) { showToast(err.message, 'error'); }
      finally { syncBtn.disabled = false; }
      return;
    }

    const calendarDeleteBtn = e.target.closest('.cal-event-delete');
    if (calendarDeleteBtn) {
      if (!(await showConfirm('Видалити подію з календаря учнів?', { danger: true }))) return;
      try {
        await api(`/admin/calendar/events/${calendarDeleteBtn.dataset.id}`, { method: 'DELETE' });
        showToast('Подію видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
      return;
    }

    const addBtn = e.target.closest('#sched-add-btn');
    if (addBtn) {
      const group_id = document.getElementById('sched-new-group')?.value;
      const title = document.getElementById('sched-new-title')?.value;
      const lesson_at = document.getElementById('sched-new-at')?.value;
      const duration_minutes = document.getElementById('sched-new-duration')?.value;
      const topic = document.getElementById('sched-new-topic')?.value;
      const location = document.getElementById('sched-new-location')?.value;
      const repeat_weekly = document.getElementById('sched-repeat-weekly')?.checked || false;
      const recurrence_until = document.getElementById('sched-repeat-until')?.value || '';
      if (!group_id || !title?.trim() || !lesson_at) {
        return showToast('Заповніть групу, назву і дату', 'error');
      }
      if (repeat_weekly && !recurrence_until) return showToast('Оберіть дату завершення циклу', 'error');
      try {
        await api('/admin/schedule/lessons', {
          method: 'POST',
          body: JSON.stringify({
            group_id, title, lesson_at: new Date(lesson_at).toISOString(),
            duration_minutes, topic, location, repeat_weekly, recurrence_until,
          }),
        });
        showToast('Заняття додано');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
      return;
    }

    const editBtn = e.target.closest('.sched-edit');
    if (editBtn) {
      const row = editBtn.closest('.sched-lesson-item');
      if (!row) return showToast('Заняття не знайдено', 'error');
      const lesson = {
        id: row.dataset.id,
        title: row.dataset.title,
        lesson_at: row.dataset.at,
        duration_minutes: row.dataset.duration,
        topic: row.dataset.topic,
        location: row.dataset.location,
        series_id: row.dataset.seriesId,
      };
      const result = await showForm('Редагувати заняття', [
        { id: 'title', label: 'Назва', type: 'text', value: lesson.title },
        { id: 'lesson_at', label: 'Дата і час', type: 'datetime-local', value: toLocalInput(lesson.lesson_at) },
        { id: 'duration_minutes', label: 'Тривалість у хвилинах', type: 'number', value: lesson.duration_minutes },
        { id: 'topic', label: 'Тема', type: 'text', value: lesson.topic || '' },
        { id: 'location', label: 'Аудиторія / посилання', type: 'text', value: lesson.location || '' },
      ], { okText: 'Зберегти' });
      if (!result) return;
      if (!result.title.trim() || !result.lesson_at.trim()) return showToast('Заповніть назву, дату і час', 'error');
      try {
        await api(`/admin/schedule/lessons/${lesson.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...result,
            lesson_at: new Date(result.lesson_at).toISOString(),
            duration_minutes: Number(result.duration_minutes),
          }),
        });
        showToast(lesson.series_id ? 'Окреме заняття циклу оновлено' : 'Заняття оновлено');
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
