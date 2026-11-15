import { api } from '/auth.js';
import { icon, STUDENT_MEMBER_ROLE_LABELS } from '/icons.js';
import { showConfirm, showPrompt, showForm } from '/dialog.js';
import { handleLink } from '/user-handle.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function renderTeacherTabs(active = 'overview', badges = {}) {
  const sections = [
    { label: 'Панель', tabs: [
      { id: 'overview', label: 'Огляд', icon: 'grid' },
      { id: 'planner', label: 'Планер', icon: 'notes' },
      { id: 'stats', label: 'Статистика', icon: 'chart' },
    ] },
    { label: 'Навчання', tabs: [
      { id: 'groups', label: 'Групи', icon: 'users' },
      { id: 'tasks', label: 'Домашні', icon: 'notes', badge: badges.tasks },
      { id: 'homework', label: 'Перевірка ДЗ', icon: 'check', badge: badges.homework },
      { id: 'quizzes', label: 'Тести', icon: 'book' },
      { id: 'ctf', label: 'CTF', icon: 'shield' },
      { id: 'schedule', label: 'Розклад', icon: 'calendar' },
      { id: 'attendance', label: 'Відвідуваність', icon: 'video' },
    ] },
  ];
  return `<nav class="admin-sidebar" aria-label="Меню викладача">${sections.map(section => `
    <div class="admin-sidebar-section">
      <h2>${section.label}</h2>
      ${section.tabs.map(t => `
        <button type="button" class="admin-tab${active === t.id ? ' active' : ''}" data-tab="${t.id}"${active === t.id ? ' aria-current="page"' : ''}>
          ${icon(t.icon, 'ico ico--sm')}<span>${t.label}</span>
          ${t.badge ? `<span class="admin-nav-badge" aria-label="${t.badge} нових">${t.badge > 99 ? '99+' : t.badge}</span>` : ''}
        </button>`).join('')}
    </div>`).join('')}</nav>`;
}

export function renderGroupsPanel(groups, programs = [], directions = [], { allGroups = false } = {}) {
  const progOpts = programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const dirOpts = directions.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('users', 'ico ico--md')}${allGroups ? 'Групи' : 'Мої групи'}</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn--outline btn--sm" id="add-group-btn">${icon('plus', 'ico ico--sm')}Нова група</button>
        <button type="button" class="btn btn--outline btn--sm" id="add-individual-btn">${icon('user', 'ico ico--sm')}Індивідуальний учень</button>
      </div>
    </div>
    <div id="create-group-form" class="admin-inline-form" hidden>
      <input class="admin-inp" id="new-group-name" placeholder="Назва групи">
      <input class="admin-inp" id="new-group-desc" placeholder="Опис (необов'язково)">
      <select class="admin-inp" id="new-group-direction"><option value="">Без напрямку</option>${dirOpts}</select>
      <select class="admin-inp" id="new-group-program"><option value="">Без програми</option>${progOpts}</select>
      <button type="button" class="btn btn--primary btn--sm" id="create-group-submit">Створити</button>
    </div>
    <div id="create-individual-form" class="admin-inline-form" hidden>
      <select class="admin-inp" id="new-individual-student"><option value="">Оберіть учня…</option></select>
      <input class="admin-inp" id="new-individual-name" placeholder="Назва (авто з імені учня)">
      <select class="admin-inp" id="new-individual-direction"><option value="">Без напрямку</option>${dirOpts}</select>
      <select class="admin-inp" id="new-individual-program"><option value="">Без програми</option>${progOpts}</select>
      <button type="button" class="btn btn--primary btn--sm" id="create-individual-submit">Створити pod</button>
      <p class="billing-hint" style="grid-column:1/-1">Індивідуальний pod = група з 1 учнем: окремі конференції, ДЗ, чат і рейтинг.</p>
    </div>
    <div class="groups-grid" id="groups-grid">
      ${(groups || []).length ? groups.map(g => renderGroupCard(g, allGroups)).join('') : '<p class="empty-state">Ще немає груп. Створіть першу!</p>'}
    </div>
  </section>
  <div id="group-modal" class="group-modal" hidden>
    <div class="group-modal-inner">
      <button type="button" class="group-modal-close" id="group-modal-close">×</button>
      <h3 id="group-modal-title">Група</h3>
      <div id="group-modal-body"></div>
    </div>
  </div>`;
}

function renderGroupCard(g, showTeacher) {
  const isIndividual = g.kind === 'individual';
  return `<article class="group-card" data-group-id="${g.id}" style="--group-color:${g.color || 'var(--accent)'}">
    <div class="group-card-head">
      <h3>${esc(g.name)}</h3>
      <span class="group-card-count">${isIndividual ? '1:1' : `${g.member_count || 0} учн.`}</span>
    </div>
    ${g.description ? `<p class="group-card-desc">${esc(g.description)}</p>` : ''}
    <div class="group-card-tags">
      ${isIndividual ? '<span class="group-card-prog">Індивідуальний</span>' : ''}
      ${g.direction_name ? `<span class="group-card-prog">${esc(g.direction_name)}</span>` : ''}
      ${g.program_name ? `<span class="group-card-prog">${esc(g.program_name)}</span>` : ''}
      ${showTeacher && g.teacher_name ? `<span class="group-card-prog">@${esc(g.teacher_handle)}</span>` : ''}
    </div>
    <div class="group-card-actions">
      <a href="/content-builder.html?type=group&id=${g.id}" class="btn btn--outline btn--sm">${icon('edit', 'ico ico--sm')}Конструктор</a>
      <button type="button" class="btn btn--outline btn--sm group-manage" data-id="${g.id}">${icon('users', 'ico ico--sm')}Учні</button>
      <a href="/groups-chat.html?group=${g.id}" class="btn btn--outline btn--sm">${icon('chat', 'ico ico--sm')}Чат</a>
      <a href="/groups-chat.html?group=${g.id}&tab=ranking" class="btn btn--outline btn--sm">${icon('chart', 'ico ico--sm')}Рейтинг</a>
      <button type="button" class="btn btn--ghost btn--sm group-edit" data-id="${g.id}">${icon('notes', 'ico ico--sm')}</button>
      <button type="button" class="btn btn--ghost btn--sm group-del" data-id="${g.id}">${icon('trash', 'ico ico--sm')}</button>
    </div>
  </article>`;
}

async function openGroupModal(groupId, title, showToast) {
  const modal = document.getElementById('group-modal');
  const body = document.getElementById('group-modal-body');
  document.getElementById('group-modal-title').textContent = title;
  modal.hidden = false;

  const [{ members }, { students }] = await Promise.all([
    api(`/admin/groups/${groupId}/members`),
    api(`/admin/students/available?groupId=${groupId}`),
  ]);

  body.innerHTML = `
    <div class="group-modal-section">
      <h4>Учні в групі (${members.length})</h4>
      <div class="admin-list">${members.length ? members.map(m => `
        <div class="admin-list-item">
          <div>
            <strong>${handleLink(m.handle)}</strong> · ${esc(m.name)}
            <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">Роль в групі</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="admin-inp member-role-select" data-uid="${m.id}" style="width:auto;min-width:110px;padding:6px 2rem 6px 8px;font-size:0.75rem">
              <option value="student" ${(m.member_role || 'student') === 'student' ? 'selected' : ''}>${STUDENT_MEMBER_ROLE_LABELS.student}</option>
              <option value="author" ${m.member_role === 'author' ? 'selected' : ''}>${STUDENT_MEMBER_ROLE_LABELS.author}</option>
            </select>
            <button class="btn btn--ghost btn--sm member-remove" data-uid="${m.id}">${icon('trash', 'ico ico--sm')}</button>
          </div>
        </div>`).join('') : '<p class="empty-state">Немає учнів</p>'}
      </div>
    </div>
    <div class="group-modal-section">
      <h4>Додати учня</h4>
      <div class="admin-inline-form" style="margin:0;padding:0;border:none">
        <select class="admin-inp" id="add-member-select">
          <option value="">Оберіть учня...</option>
          ${students.map(s => `<option value="${s.id}">@${esc(s.handle)} · ${esc(s.name)}${s.is_restricted ? ' (очікує групи)' : ''}</option>`).join('')}
        </select>
        <button type="button" class="btn btn--primary btn--sm" id="add-member-btn">Додати</button>
      </div>
    </div>`;

  body.querySelector('#add-member-btn')?.addEventListener('click', async () => {
    const select = body.querySelector('#add-member-select');
    const uid = parseInt(select.value, 10);
    if (!uid) return;
    const wasRestricted = students.find(s => s.id === uid)?.is_restricted;
    try {
      await api(`/admin/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userIds: [uid] }) });
      showToast(wasRestricted ? 'Учня додано, доступ відкрито' : 'Учня додано');
      openGroupModal(groupId, title, showToast);
    } catch (err) { showToast(err.message, 'error'); }
  });

  body.querySelectorAll('.member-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/admin/groups/${groupId}/members/${btn.dataset.uid}`, { method: 'DELETE' });
        showToast('Учня видалено');
        openGroupModal(groupId, title, showToast);
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  body.querySelectorAll('.member-role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const uid = sel.dataset.uid;
      const prev = sel.dataset.current || sel.querySelector('option[selected]')?.value || 'student';
      try {
        await api(`/admin/groups/${groupId}/members/${uid}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ member_role: sel.value }),
        });
        sel.dataset.current = sel.value;
        showToast(sel.value === 'author' ? 'Учню призначено роль «Автор»' : 'Роль змінено на «Учень»');
      } catch (err) {
        showToast(err.message, 'error');
        sel.value = prev;
      }
    });
    sel.dataset.current = sel.value;
  });
}

export function bindGroupsPanelEvents(showToast, reload, programs = [], directions = [], groups = [], opts = {}) {
  const { isOwner = false, teachers = [] } = opts;

  document.getElementById('add-group-btn')?.addEventListener('click', () => {
    const form = document.getElementById('create-group-form');
    const ind = document.getElementById('create-individual-form');
    if (ind) ind.hidden = true;
    form.hidden = !form.hidden;
  });

  document.getElementById('add-individual-btn')?.addEventListener('click', async () => {
    const form = document.getElementById('create-individual-form');
    const grp = document.getElementById('create-group-form');
    if (grp) grp.hidden = true;
    form.hidden = !form.hidden;
    if (!form.hidden) {
      try {
        const { students } = await api('/admin/students/available');
        const sel = document.getElementById('new-individual-student');
        sel.innerHTML = `<option value="">Оберіть учня…</option>${(students || []).map((s) =>
          `<option value="${s.id}">@${esc(s.handle)} · ${esc(s.name)}${s.is_restricted ? ' (очікує)' : ''}</option>`).join('')}`;
      } catch (err) { showToast(err.message, 'error'); }
    }
  });

  document.getElementById('create-group-submit')?.addEventListener('click', async () => {
    const name = document.getElementById('new-group-name').value;
    const description = document.getElementById('new-group-desc').value;
    const program_id = document.getElementById('new-group-program').value;
    const direction_id = document.getElementById('new-group-direction').value;
    if (!name?.trim()) return showToast('Вкажіть назву', 'error');
    try {
      await api('/admin/groups', {
        method: 'POST',
        body: JSON.stringify({ name, description, program_id: program_id || null, direction_id: direction_id || null, kind: 'group' }),
      });
      showToast('Групу створено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('create-individual-submit')?.addEventListener('click', async () => {
    const student_id = document.getElementById('new-individual-student').value;
    const name = document.getElementById('new-individual-name').value;
    const program_id = document.getElementById('new-individual-program').value;
    const direction_id = document.getElementById('new-individual-direction').value;
    if (!student_id) return showToast('Оберіть учня', 'error');
    try {
      await api('/admin/groups', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'individual',
          student_id: parseInt(student_id, 10),
          name: name?.trim() || undefined,
          program_id: program_id || null,
          direction_id: direction_id || null,
        }),
      });
      showToast('Індивідуальний pod створено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.group-manage').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.group-card');
      const name = card?.querySelector('h3')?.textContent || 'Група';
      try {
        await openGroupModal(parseInt(btn.dataset.id, 10), name, showToast);
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.group-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id, 10);
      const group = groups.find(g => g.id === id);
      if (!group) return;

      const fields = [
        { id: 'name', label: 'Назва групи', type: 'text', value: group.name },
        { id: 'description', label: "Опис (необов'язково)", type: 'text', value: group.description || '' },
        {
          id: 'direction_id',
          label: 'Напрямок',
          type: 'select',
          value: String(group.direction_id || ''),
          options: [{ value: '', label: 'Без напрямку' }, ...directions.map(d => ({ value: String(d.id), label: d.name }))],
        },
        {
          id: 'program_id',
          label: 'Програма',
          type: 'select',
          value: String(group.program_id || ''),
          options: [{ value: '', label: 'Без програми' }, ...programs.map(p => ({ value: String(p.id), label: p.name }))],
        },
      ];
      if (isOwner) {
        fields.push({
          id: 'teacher_id',
          label: 'Викладач',
          type: 'select',
          value: String(group.teacher_id || ''),
          options: teachers.map(t => ({ value: String(t.id), label: `${t.name} (@${t.handle})` })),
        });
      }

      const result = await showForm('Редагувати групу', fields);
      if (!result) return;
      try {
        await api(`/admin/groups/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...result,
            program_id: result.program_id || null,
            direction_id: result.direction_id || null,
          }),
        });
        showToast('Збережено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.group-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити групу?', { danger: true }))) return;
      try {
        await api(`/admin/groups/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Групу видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.getElementById('group-modal-close')?.addEventListener('click', () => {
    document.getElementById('group-modal').hidden = true;
  });
  document.getElementById('group-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'group-modal') e.target.hidden = true;
  });
}

function renderReviewQueue(reviewQueue) {
  return `<section class="admin-panel admin-panel--wide">
    <h3>На перевірці (${reviewQueue.length})</h3>
    <div class="admin-list" id="review-queue">
      ${reviewQueue.length ? reviewQueue.map(a => `
        <div class="admin-list-item task-review-item" data-id="${a.id}">
          <div>
            <strong>${esc(a.title)}</strong>
            <div style="font-size:0.75rem;color:var(--text-muted)">
              ${handleLink(a.student_handle)} · ${esc(a.group_name)}
              ${a.submitted_at ? ` · здано ${esc(a.submitted_at)}` : ''}
              ${a.work_duration_seconds != null ? ` · ${Math.ceil(a.work_duration_seconds / 60)} хв` : ''}
              ${a.submission_note ? ` · «${esc(a.submission_note)}»` : ''}
            </div>
            ${(a.submission_files || []).length ? `
              <div class="task-submission-files">
                ${a.submission_files.map(f => `
                  <a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" class="task-submission-file" title="${esc(f.original_name)}">
                    ${icon(f.mime_type?.startsWith('image/') ? 'image' : 'notes', 'ico ico--xs')}
                    ${esc(f.original_name)}
                  </a>`).join('')}
              </div>` : ''}
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" class="btn btn--primary btn--sm task-approve" data-id="${a.id}">${icon('check', 'ico ico--sm')}Зарахувати</button>
            <button type="button" class="btn btn--ghost btn--sm task-reject" data-id="${a.id}" aria-label="Повернути на доопрацювання">${icon('edit', 'ico ico--sm')}</button>
          </div>
        </div>`).join('') : '<p class="empty-state">Немає домашніх завдань на перевірці</p>'}
    </div>
  </section>`;
}

function renderHomeworkReminderSettings(settings = null) {
  if (!settings) return '';
  return `<section class="admin-panel admin-panel--wide" style="margin-bottom:16px">
    <div class="admin-panel-head">
      <h3>Нагадування про ДЗ</h3>
    </div>
    <form class="admin-inline-form" id="hw-reminder-form">
      <label class="admin-check"><input type="checkbox" name="enabled" ${settings.enabled ? 'checked' : ''}> Увімкнено</label>
      <label>Інтервал (год)
        <input class="admin-inp admin-inp--xs" type="number" name="interval_hours" min="6" max="168" value="${settings.interval_hours || 48}">
      </label>
      <label class="admin-check"><input type="checkbox" name="channel_site" ${settings.channel_site ? 'checked' : ''}> Сайт</label>
      <label class="admin-check"><input type="checkbox" name="channel_telegram" ${settings.channel_telegram ? 'checked' : ''}> Telegram</label>
      <input class="admin-inp" name="message_template" value="${esc(settings.message_template || '')}" maxlength="1000" style="min-width:280px">
      <button type="submit" class="btn btn--primary btn--sm">Зберегти</button>
    </form>
  </section>`;
}

export function renderHomeworkReviewPanel(tasksData = {}, reminderSettings = null) {
  const reviewQueue = tasksData.reviewQueue || [];
  const completedWork = (tasksData.submissionHistory || []).filter((item) => item.status === 'completed');
  const pastLessons = tasksData.pastLessons || [];
  const byStudent = new Map();
  for (const item of reviewQueue) {
    const key = item.user_id || item.student_handle;
    const list = byStudent.get(key) || [];
    list.push(item);
    byStudent.set(key, list);
  }
  const renderFiles = (files) => (files || []).length ? `<div class="task-submission-files">
    ${files.map((file) => `<a href="${esc(file.url)}" target="_blank" rel="noopener noreferrer" class="task-submission-file">
      ${icon(file.mime_type?.startsWith('image/') ? 'image' : 'notes', 'ico ico--xs')}${esc(file.original_name)}
    </a>`).join('')}
  </div>` : '';
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('check', 'ico ico--md')}Перевірка домашніх завдань</h2>
      <span class="sched-badge">${reviewQueue.length} на перевірці</span>
    </div>
    <p class="program-transfer-hint">Перегляньте відповіді по кожному учню. Зарахуйте або поверніть на доопрацювання.</p>
    ${renderHomeworkReminderSettings(reminderSettings)}
    ${byStudent.size ? `<div class="hw-student-filter" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <button type="button" class="btn btn--ghost btn--sm hw-filter active" data-student="">Усі (${reviewQueue.length})</button>
      ${[...byStudent.entries()].map(([key, list]) => {
    const sample = list[0];
    return `<button type="button" class="btn btn--ghost btn--sm hw-filter" data-student="${esc(String(sample.student_handle || key))}">@${esc(sample.student_handle || key)} (${list.length})</button>`;
  }).join('')}
    </div>` : ''}
    ${renderReviewQueue(reviewQueue)}
    <section class="admin-panel admin-panel--wide homework-history">
      <h3>Зараховані домашні роботи (${completedWork.length})</h3>
      <div class="admin-list">
        ${completedWork.length ? completedWork.map((item) => `
          <article class="admin-list-item homework-history-item">
            <div>
              <strong>${esc(item.title)}</strong>
              <div class="homework-history-meta">${handleLink(item.student_handle)} · ${esc(item.group_name)}
                ${item.completed_at ? ` · зараховано ${esc(item.completed_at)}` : ''}
                ${item.work_duration_seconds != null ? ` · ${Math.ceil(item.work_duration_seconds / 60)} хв` : ''}
              </div>
              ${item.submission_note ? `<p class="homework-history-note">${esc(item.submission_note)}</p>` : ''}
              ${renderFiles(item.submission_files)}
            </div>
          </article>`).join('') : '<p class="empty-state">Зарахованих робіт поки немає.</p>'}
      </div>
    </section>
    <section class="admin-panel admin-panel--wide homework-history">
      <h3>Минулі заняття (${pastLessons.length})</h3>
      <div class="admin-list">
        ${pastLessons.length ? pastLessons.map((lesson) => `
          <article class="admin-list-item homework-history-item">
            <div>
              <strong>${esc(lesson.title)}</strong>
              <div class="homework-history-meta">${esc(lesson.group_name)} · ${esc(lesson.lesson_at)}
                ${lesson.teacher_name ? ` · ${esc(lesson.teacher_name)}` : ''}
              </div>
              ${lesson.topic ? `<p class="homework-history-note">${esc(lesson.topic)}</p>` : ''}
            </div>
          </article>`).join('') : '<p class="empty-state">Минулі заняття з’являться тут.</p>'}
      </div>
    </section>
  </section>`;
}

export function renderTasksPanel(groups, tasksData = {}, students = []) {
  const { tasks = [], reviewQueue = [] } = tasksData;
  const groupOpts = (groups || []).map(g =>
    `<option value="${g.id}">${esc(g.name)}</option>`
  ).join('');
  const studentOpts = (students || []).map((s) =>
    `<option value="${s.id}">@${esc(s.handle)} · ${esc(s.name)}</option>`
  ).join('');

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('notes', 'ico ico--md')}Домашні завдання</h2>
      <button type="button" class="btn btn--outline btn--sm" id="add-task-btn">${icon('plus', 'ico ico--sm')}Призначити ДЗ</button>
    </div>
    <div id="create-task-form" class="admin-inline-form" hidden>
      <select class="admin-inp" id="new-task-group" required>
        <option value="">Група</option>${groupOpts}
      </select>
      <input class="admin-inp" id="new-task-title" placeholder="Назва завдання" required>
      <input class="admin-inp" id="new-task-desc" placeholder="Опис / критерії">
      <input class="admin-inp" id="new-task-bounty" type="number" min="0" placeholder="Bounty" value="0">
      <input class="admin-inp" id="new-task-time" type="number" min="1" placeholder="Ліміт хв">
      <input class="admin-inp" id="new-task-due" type="date">
      <input class="admin-inp" id="new-task-circuit" type="number" min="1" placeholder="ID схеми (Circuits)">
      <select class="admin-inp" id="new-task-students" multiple size="4" title="Порожньо = уся група">
        ${studentOpts}
      </select>
      <button type="button" class="btn btn--primary btn--sm" id="create-task-submit">Призначити</button>
      <p class="billing-hint" style="grid-column:1/-1">Учні (Ctrl/⌘): якщо нікого не обрано — завдання піде всій групі. ID схеми — посилання на Circuits у кабінеті учня.</p>
    </div>
    <div class="admin-grid" style="margin-top:16px">
      ${renderReviewQueue(reviewQueue)}
      <section class="admin-panel admin-panel--wide">
        <h3>Усі задачі (${tasks.length})</h3>
        <div class="admin-list">
          ${tasks.length ? tasks.map(t => `
            <div class="admin-list-item">
              <div>
                <strong>${esc(t.title)}</strong>
                <div style="font-size:0.75rem;color:var(--text-muted)">
                  ${esc(t.group_name)} · ${t.review_count || 0} на перевірці · ${t.completed_count || 0} завершено
                  ${t.time_limit_minutes ? ` · <span class="ico-inline">${icon('clock', 'ico ico--sm')}${t.time_limit_minutes} хв</span>` : ''}
                  ${t.bounty_reward ? ` · +${t.bounty_reward} pts` : ''}
                </div>
              </div>
              <button type="button" class="btn btn--ghost btn--sm task-del" data-id="${t.id}">${icon('trash', 'ico ico--sm')}</button>
            </div>`).join('') : '<p class="empty-state">Створіть першу задачу для групи</p>'}
        </div>
      </section>
    </div>
  </section>`;
}

export function bindTasksPanelEvents(showToast, reload) {
  document.getElementById('add-task-btn')?.addEventListener('click', () => {
    const form = document.getElementById('create-task-form');
    form.hidden = !form.hidden;
  });

  document.getElementById('create-task-submit')?.addEventListener('click', async () => {
    const group_id = document.getElementById('new-task-group').value;
    const title = document.getElementById('new-task-title').value;
    const description = document.getElementById('new-task-desc').value;
    const bounty_reward = document.getElementById('new-task-bounty').value;
    const time_limit_minutes = document.getElementById('new-task-time').value;
    const due_at = document.getElementById('new-task-due').value;
    const circuit_project_id = document.getElementById('new-task-circuit')?.value;
    const studentSelect = document.getElementById('new-task-students');
    const student_ids = studentSelect
      ? [...studentSelect.selectedOptions].map((o) => parseInt(o.value, 10))
      : [];
    if (!group_id || !title?.trim()) return showToast('Вкажіть групу та назву', 'error');
    try {
      await api('/admin/tasks', {
        method: 'POST',
        body: JSON.stringify({
          group_id, title, description, bounty_reward, due_at: due_at || null,
          time_limit_minutes: time_limit_minutes || null,
          circuit_project_id: circuit_project_id || null,
          student_ids: student_ids.length ? student_ids : undefined,
        }),
      });
      showToast('Домашнє завдання призначено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('hw-reminder-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/homework-reminders', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: fd.get('enabled') === 'on',
          interval_hours: parseInt(fd.get('interval_hours'), 10),
          channel_site: fd.get('channel_site') === 'on',
          channel_telegram: fd.get('channel_telegram') === 'on',
          message_template: fd.get('message_template'),
        }),
      });
      showToast('Нагадування збережено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.hw-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      const handle = btn.dataset.student || '';
      document.querySelectorAll('.hw-filter').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.task-review-item').forEach((row) => {
        if (!handle) {
          row.hidden = false;
          return;
        }
        const meta = row.textContent || '';
        row.hidden = !meta.includes(`@${handle}`);
      });
    });
  });

  document.querySelectorAll('.task-approve').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/admin/tasks/assignments/${btn.dataset.id}/approve`, { method: 'POST' });
        showToast('Задачу завершено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.task-reject').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Повернути задачу учню на доопрацювання?'))) return;
      try {
        await api(`/admin/tasks/assignments/${btn.dataset.id}/reject`, { method: 'POST' });
        showToast('Повернуто на доопрацювання');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.task-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити задачу для всіх учнів?', { danger: true }))) return;
      try {
        await api(`/admin/tasks/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Задачу видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}
