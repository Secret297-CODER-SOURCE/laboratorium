import { api } from '/auth.js';
import { icon, STUDENT_MEMBER_ROLE_LABELS } from '/icons.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function renderTeacherTabs(active = 'overview') {
  const tabs = [
    { id: 'overview', label: 'Огляд', icon: 'grid' },
    { id: 'groups', label: 'Групи', icon: 'users' },
    { id: 'tasks', label: 'Задачі', icon: 'notes' },
    { id: 'ctf', label: 'CTF', icon: 'shield' },
    { id: 'quizzes', label: 'Тести', icon: 'book' },
    { id: 'stats', label: 'Статистика', icon: 'chart' },
    { id: 'schedule', label: 'Розклад', icon: 'calendar' },
  ];
  return `<nav class="admin-tabs">${tabs.map(t => `
    <button type="button" class="admin-tab${active === t.id ? ' active' : ''}" data-tab="${t.id}">
      ${icon(t.icon, 'ico ico--sm')}${t.label}
    </button>`).join('')}</nav>`;
}

export function renderGroupsPanel(groups, programs = []) {
  const progOpts = programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('users', 'ico ico--md')}Мої групи</h2>
      <button type="button" class="btn btn--outline btn--sm" id="add-group-btn">${icon('plus', 'ico ico--sm')}Нова група</button>
    </div>
    <div id="create-group-form" class="admin-inline-form" hidden>
      <input class="admin-inp" id="new-group-name" placeholder="Назва групи">
      <input class="admin-inp" id="new-group-desc" placeholder="Опис (необов'язково)">
      <select class="admin-inp" id="new-group-program"><option value="">Без програми</option>${progOpts}</select>
      <button type="button" class="btn btn--primary btn--sm" id="create-group-submit">Створити</button>
    </div>
    <div class="groups-grid" id="groups-grid">
      ${(groups || []).length ? groups.map(g => renderGroupCard(g)).join('') : '<p class="empty-state">Ще немає груп. Створіть першу!</p>'}
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

function renderGroupCard(g) {
  return `<article class="group-card" data-group-id="${g.id}" style="--group-color:${g.color || 'var(--accent)'}">
    <div class="group-card-head">
      <h3>${esc(g.name)}</h3>
      <span class="group-card-count">${g.member_count || 0} учн.</span>
    </div>
    ${g.description ? `<p class="group-card-desc">${esc(g.description)}</p>` : ''}
    ${g.program_name ? `<span class="group-card-prog">${esc(g.program_name)}</span>` : ''}
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
            <strong>@${esc(m.handle)}</strong> · ${esc(m.name)}
            <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">Роль в групі</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="admin-inp member-role-select" data-uid="${m.id}" style="width:auto;min-width:110px;padding:6px 8px;font-size:0.75rem">
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
          ${students.map(s => `<option value="${s.id}">@${esc(s.handle)} · ${esc(s.name)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn--primary btn--sm" id="add-member-btn">Додати</button>
      </div>
    </div>`;

  body.querySelector('#add-member-btn')?.addEventListener('click', async () => {
    const uid = parseInt(body.querySelector('#add-member-select').value, 10);
    if (!uid) return;
    try {
      await api(`/admin/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userIds: [uid] }) });
      showToast('Учня додано');
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

export function bindGroupsPanelEvents(showToast, reload, programs = []) {
  document.getElementById('add-group-btn')?.addEventListener('click', () => {
    const form = document.getElementById('create-group-form');
    form.hidden = !form.hidden;
  });

  document.getElementById('create-group-submit')?.addEventListener('click', async () => {
    const name = document.getElementById('new-group-name').value;
    const description = document.getElementById('new-group-desc').value;
    const program_id = document.getElementById('new-group-program').value;
    if (!name?.trim()) return showToast('Вкажіть назву', 'error');
    try {
      await api('/admin/groups', {
        method: 'POST',
        body: JSON.stringify({ name, description, program_id: program_id || null }),
      });
      showToast('Групу створено');
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
      const name = prompt('Нова назва групи:');
      if (!name?.trim()) return;
      try {
        await api(`/admin/groups/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
        showToast('Збережено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.group-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити групу?')) return;
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

export function renderTasksPanel(groups, tasksData = {}) {
  const { tasks = [], reviewQueue = [] } = tasksData;
  const groupOpts = (groups || []).map(g =>
    `<option value="${g.id}">${esc(g.name)}</option>`
  ).join('');

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('notes', 'ico ico--md')}Задачі для учнів</h2>
      <button type="button" class="btn btn--outline btn--sm" id="add-task-btn">${icon('plus', 'ico ico--sm')}Нова задача</button>
    </div>
    <div id="create-task-form" class="admin-inline-form" hidden>
      <select class="admin-inp" id="new-task-group" required>
        <option value="">Група</option>${groupOpts}
      </select>
      <input class="admin-inp" id="new-task-title" placeholder="Назва задачі" required>
      <input class="admin-inp" id="new-task-desc" placeholder="Опис">
      <input class="admin-inp" id="new-task-bounty" type="number" min="0" placeholder="Bounty" value="0">
      <input class="admin-inp" id="new-task-time" type="number" min="1" placeholder="Ліміт хв (необов'язково)">
      <input class="admin-inp" id="new-task-due" type="date">
      <button type="button" class="btn btn--primary btn--sm" id="create-task-submit">Створити</button>
    </div>
    <div class="admin-grid" style="margin-top:16px">
      <section class="admin-panel admin-panel--wide">
        <h3>На перевірці (${reviewQueue.length})</h3>
        <div class="admin-list" id="review-queue">
          ${reviewQueue.length ? reviewQueue.map(a => `
            <div class="admin-list-item task-review-item" data-id="${a.id}">
              <div>
                <strong>${esc(a.title)}</strong>
                <div style="font-size:0.75rem;color:var(--text-muted)">
                  @${esc(a.student_handle)} · ${esc(a.group_name)}
                  ${a.submitted_at ? ` · здано ${esc(a.submitted_at)}` : ''}
                  ${a.work_duration_seconds != null ? ` · ${Math.ceil(a.work_duration_seconds / 60)} хв` : ''}
                  ${a.submission_note ? ` · «${esc(a.submission_note)}»` : ''}
                </div>
                ${(a.submission_files || []).length ? `
                  <div class="task-submission-files">
                    ${a.submission_files.map(f => `
                      <a href="${esc(f.url)}" target="_blank" rel="noopener" class="task-submission-file" title="${esc(f.original_name)}">
                        ${icon(f.mime_type?.startsWith('image/') ? 'image' : 'notes', 'ico ico--xs')}
                        ${esc(f.original_name)}
                      </a>`).join('')}
                  </div>` : ''}
              </div>
              <div style="display:flex;gap:6px">
                <button type="button" class="btn btn--primary btn--sm task-approve" data-id="${a.id}">${icon('check', 'ico ico--sm')}Завершено</button>
                <button type="button" class="btn btn--ghost btn--sm task-reject" data-id="${a.id}">${icon('trash', 'ico ico--sm')}</button>
              </div>
            </div>`).join('') : '<p class="empty-state">Немає задач на перевірці</p>'}
        </div>
      </section>
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
    if (!group_id || !title?.trim()) return showToast('Вкажіть групу та назву', 'error');
    try {
      await api('/admin/tasks', {
        method: 'POST',
        body: JSON.stringify({
          group_id, title, description, bounty_reward, due_at: due_at || null,
          time_limit_minutes: time_limit_minutes || null,
        }),
      });
      showToast('Задачу створено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
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
      if (!confirm('Повернути задачу учню на доопрацювання?')) return;
      try {
        await api(`/admin/tasks/assignments/${btn.dataset.id}/reject`, { method: 'POST' });
        showToast('Повернуто на доопрацювання');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.task-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити задачу для всіх учнів?')) return;
      try {
        await api(`/admin/tasks/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Задачу видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}
