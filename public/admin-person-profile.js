import { api } from '/auth.js';
import { icon, ROLE_LABELS, STUDENT_MEMBER_ROLE_LABELS } from '/icons.js';
import { showConfirm } from '/dialog.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return esc(s);
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const APPLICATION_STATUS_LABELS = { pending: 'на розгляді', approved: 'схвалено', rejected: 'відхилено' };
const BILLING_STATUS_LABELS = {
  exempt: 'без оплати', paid: 'оплачено', active: 'активний', pending: 'очікує оплати',
  grace: 'пільговий період', overdue: 'прострочено', unknown: 'невідомо',
};
const BILLING_STATUS_PILL = {
  exempt: 'running', paid: 'running', active: 'running', pending: 'pending',
  grace: 'pending', overdue: 'error', unknown: '',
};

function renderHeader(u) {
  return `<div class="group-modal-section">
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <strong style="font-size:1rem">${esc(u.name)}</strong>
      <span style="color:var(--text-dim)">@${esc(u.handle)}</span>
      <span class="status-pill">${esc(ROLE_LABELS[u.role] || u.role)}</span>
      ${u.is_frozen ? `<span class="status-pill error">заморожено</span>` : ''}
      ${u.is_restricted ? `<span class="status-pill pending">очікує групи</span>` : ''}
      ${u.billing_exempt ? `<span class="status-pill running">без оплати</span>` : ''}
    </div>
    <div style="margin-top:6px;color:var(--text-dim);font-size:0.85rem">${esc(u.email)}</div>
  </div>`;
}

function renderApplications(applications) {
  return `<div class="group-modal-section">
    <h4>Заявки (${applications.length})</h4>
    ${applications.length ? `<div class="admin-list">${applications.map(a => `
      <div class="admin-list-item">
        <div>
          <strong>${esc(a.program || 'Без напрямку')}</strong>
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">${fmtDate(a.created_at)}${a.message ? ` · ${esc(a.message)}` : ''}</div>
        </div>
        <span class="status-pill ${esc(a.status)}">${esc(APPLICATION_STATUS_LABELS[a.status] || a.status)}</span>
      </div>`).join('')}</div>` : '<p class="empty-state">Немає заявок</p>'}
  </div>`;
}

function renderBilling(billing) {
  if (!billing) return '';
  const { status, payments } = billing;
  return `<div class="group-modal-section">
    <h4>Оплата</h4>
    <div class="admin-list-item" style="margin-bottom:10px">
      <div>
        ${status.periodLabel ? `<strong>${esc(status.periodLabel)}</strong>` : ''}
        ${status.dueDate ? `<div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">Термін: ${fmtDate(status.dueDate)}</div>` : ''}
      </div>
      <span class="status-pill ${BILLING_STATUS_PILL[status.status] || ''}">${esc(BILLING_STATUS_LABELS[status.status] || status.status)}</span>
    </div>
    ${payments.length ? `<div class="admin-list">${payments.map(p => `
      <div class="admin-list-item">
        <div>
          <strong>${String(p.period_month).padStart(2, '0')}.${p.period_year}</strong>
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">${fmtDate(p.paid_at)}${p.recorded_by_handle ? ` · @${esc(p.recorded_by_handle)}` : ''}${p.note ? ` · ${esc(p.note)}` : ''}</div>
        </div>
        ${p.amount != null ? `<span>${esc(p.amount)}</span>` : ''}
      </div>`).join('')}</div>` : '<p class="empty-state">Оплат ще не було</p>'}
  </div>`;
}

function renderGroups(groups) {
  return `<div class="group-modal-section">
    <h4>Групи (${groups.length})</h4>
    ${groups.length ? `<div class="admin-list">${groups.map(g => `
      <div class="admin-list-item">
        <div>
          <strong>${esc(g.name)}</strong>
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">${g.teacher_name ? `@${esc(g.teacher_handle)}` : ''}${g.program_name ? ` · ${esc(g.program_name)}` : ''}${g.direction_name ? ` · ${esc(g.direction_name)}` : ''}</div>
        </div>
        ${g.member_role && g.member_role !== 'student' ? `<span class="status-pill">${esc(STUDENT_MEMBER_ROLE_LABELS[g.member_role] || g.member_role)}</span>` : ''}
      </div>`).join('')}</div>` : '<p class="empty-state">Не в жодній групі</p>'}
  </div>`;
}

function renderNotes(notes) {
  return `<div class="group-modal-section">
    <h4>Нотатки (${notes.length})</h4>
    <div class="admin-list" id="person-notes-list">${notes.length ? notes.map(n => `
      <div class="admin-list-item" data-note-id="${n.id}">
        <div>
          <div>${esc(n.body)}</div>
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">${n.author_handle ? `@${esc(n.author_handle)} · ` : ''}${fmtDate(n.created_at)}</div>
        </div>
        <button class="btn btn--ghost btn--sm person-note-del" data-id="${n.id}">${icon('trash', 'ico ico--sm')}</button>
      </div>`).join('') : '<p class="empty-state">Немає нотаток</p>'}
    </div>
    <div class="admin-inline-form" style="margin-top:10px;padding:0;border:none">
      <textarea class="admin-inp" id="person-note-text" rows="2" placeholder="Наприклад: дзвонив, думає, передзвонити через тиждень" style="width:100%;resize:vertical"></textarea>
      <button type="button" class="btn btn--primary btn--sm" id="person-note-add" style="margin-top:6px">${icon('plus', 'ico ico--sm')}Додати нотатку</button>
    </div>
  </div>`;
}

export async function openPersonProfile(userId, name, showToast, reload) {
  const modal = document.getElementById('person-modal');
  const body = document.getElementById('person-modal-body');
  document.getElementById('person-modal-title').textContent = name ? `Картка · ${name}` : 'Картка';
  modal.hidden = false;
  body.innerHTML = '<p class="empty-state">Завантаження...</p>';

  let profile;
  try {
    profile = await api(`/admin/people/${userId}`);
  } catch (err) {
    body.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
    return;
  }

  renderProfileBody(userId, profile, body, showToast, reload);
}

function renderProfileBody(userId, profile, body, showToast, reload) {
  const { user, applications, billing, groups, notes } = profile;
  body.innerHTML = [
    renderHeader(user),
    renderApplications(applications),
    renderBilling(billing),
    renderGroups(groups),
    renderNotes(notes),
  ].join('');

  body.querySelector('#person-note-add')?.addEventListener('click', async () => {
    const textarea = body.querySelector('#person-note-text');
    const text = textarea.value.trim();
    if (!text) return;
    try {
      await api(`/admin/people/${userId}/notes`, { method: 'POST', body: JSON.stringify({ body: text }) });
      const refreshed = await api(`/admin/people/${userId}`);
      renderProfileBody(userId, refreshed, body, showToast, reload);
      showToast('Нотатку додано');
    } catch (err) { showToast(err.message, 'error'); }
  });

  body.querySelectorAll('.person-note-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Видалити нотатку?', { danger: true }))) return;
      try {
        await api(`/admin/people/${userId}/notes/${btn.dataset.id}`, { method: 'DELETE' });
        const refreshed = await api(`/admin/people/${userId}`);
        renderProfileBody(userId, refreshed, body, showToast, reload);
        showToast('Нотатку видалено');
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

export function bindPersonProfileModal() {
  document.getElementById('person-modal-close')?.addEventListener('click', () => {
    document.getElementById('person-modal').hidden = true;
  });
  document.getElementById('person-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'person-modal') e.target.hidden = true;
  });
}
