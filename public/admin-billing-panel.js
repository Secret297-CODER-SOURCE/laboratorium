import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showConfirm, showPrompt } from '/dialog.js';

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const STATUS_LABELS = {
  paid: 'Оплачено',
  active: 'Активний',
  pending: 'До оплати',
  grace: 'Грейс',
  overdue: 'Прострочено',
  exempt: 'Без оплати',
};

const STATUS_CLASS = {
  paid: 'billing-status--ok',
  active: 'billing-status--ok',
  pending: 'billing-status--warn',
  grace: 'billing-status--grace',
  overdue: 'billing-status--bad',
  exempt: 'billing-status--muted',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function renderBillingPanel(data = {}) {
  const now = new Date();
  const year = data.year || now.getFullYear();
  const month = data.month || (now.getMonth() + 1);
  const students = data.students || [];

  const monthOpts = MONTHS.map((label, idx) => {
    const m = idx + 1;
    const selected = m === month ? 'selected' : '';
    return `<option value="${m}" ${selected}>${label}</option>`;
  }).join('');

  const yearOpts = [year - 1, year, year + 1].map(y =>
    `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('');

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('chart', 'ico ico--md')}Оплата курсів</h2>
      <div class="billing-period-controls">
        <select class="admin-inp admin-inp--sm" id="billing-month">${monthOpts}</select>
        <select class="admin-inp admin-inp--sm" id="billing-year">${yearOpts}</select>
        <button type="button" class="btn btn--outline btn--sm" id="billing-refresh">${icon('refresh', 'ico ico--sm')}Оновити</button>
      </div>
    </div>
    <p class="billing-hint">
      Щомісячна оплата. День платежу налаштовується для кожного учня (1–28).
      Після прострочки — <strong>${data.graceDays ?? 4} дні</strong> доступу, потім платформа блокується.
    </p>
    <div class="billing-summary">
      <span class="billing-pill billing-pill--ok">Оплачено: ${students.filter(s => s.payment).length}</span>
      <span class="billing-pill billing-pill--warn">Очікують: ${students.filter(s => !s.payment && s.accessStatus !== 'overdue').length}</span>
      <span class="billing-pill billing-pill--bad">Прострочено: ${students.filter(s => s.accessStatus === 'overdue').length}</span>
    </div>
    <table class="admin-table admin-table--billing">
      <thead>
        <tr>
          <th>Учень</th>
          <th>День оплати</th>
          <th>Статус</th>
          <th>Оплата за ${esc(MONTHS[month - 1])} ${year}</th>
          <th>Дедлайн / грейс</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${students.length ? students.map(s => renderBillingRow(s, year, month)).join('') : '<tr><td colspan="6" class="empty-state">Немає учнів</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

function renderBillingRow(student, year, month) {
  const status = student.billing_exempt ? 'exempt' : student.accessStatus;
  const statusLabel = STATUS_LABELS[status] || status;
  const statusClass = STATUS_CLASS[status] || '';

  const paidCell = student.payment
    ? `<span class="billing-paid-at">${formatDate(student.payment.paid_at)}</span>${student.payment.note ? `<span class="billing-note">${esc(student.payment.note)}</span>` : ''}`
    : '<span class="billing-unpaid">Не оплачено</span>';

  const due = student.dueDate ? formatDate(student.dueDate).split(',')[0] : '—';
  const grace = student.graceUntil ? formatDate(student.graceUntil).split(',')[0] : '—';

  return `<tr data-user-id="${student.id}">
    <td>
      <strong>@${esc(student.handle)}</strong>
      <div class="billing-user-sub">${esc(student.name)}</div>
    </td>
    <td>
      <input class="admin-inp admin-inp--xs billing-day-inp" type="number" min="1" max="28" value="${student.billing_day || 1}" data-user-id="${student.id}">
    </td>
    <td><span class="billing-status ${statusClass}">${statusLabel}</span></td>
    <td>${paidCell}</td>
    <td class="billing-dates"><span>до ${due}</span><span class="billing-grace">грейс → ${grace}</span></td>
    <td class="billing-actions">
      ${student.payment
    ? `<button type="button" class="btn btn--ghost btn--sm billing-unpay" data-payment-id="${student.payment.id}" title="Скасувати оплату">${icon('trash', 'ico ico--sm')}</button>`
    : `<button type="button" class="btn btn--primary btn--sm billing-mark-paid" data-user-id="${student.id}">${icon('check', 'ico ico--sm')}Оплачено</button>`}
      <label class="admin-check billing-exempt-check" title="Без щомісячної оплати">
        <input type="checkbox" class="billing-exempt-inp" data-user-id="${student.id}" ${student.billing_exempt ? 'checked' : ''}> звільнено
      </label>
    </td>
  </tr>`;
}

export async function loadBillingAdminData(year, month) {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  return api(`/admin/billing?${params}`);
}

export function bindBillingPanelEvents(showToast, reload) {
  const refresh = () => {
    const y = parseInt(document.getElementById('billing-year')?.value, 10);
    const m = parseInt(document.getElementById('billing-month')?.value, 10);
    const url = new URL(location.href);
    url.searchParams.set('billingYear', String(y));
    url.searchParams.set('billingMonth', String(m));
    history.replaceState(null, '', url);
    reload();
  };

  document.getElementById('billing-refresh')?.addEventListener('click', refresh);
  document.getElementById('billing-month')?.addEventListener('change', refresh);
  document.getElementById('billing-year')?.addEventListener('change', refresh);

  document.querySelectorAll('.billing-mark-paid').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = parseInt(btn.dataset.userId, 10);
      const year = parseInt(document.getElementById('billing-year')?.value, 10);
      const month = parseInt(document.getElementById('billing-month')?.value, 10);
      const note = (await showPrompt('Примітка (необов\'язково):')) ?? '';
      try {
        await api(`/admin/billing/users/${userId}/payments`, {
          method: 'POST',
          body: JSON.stringify({ year, month, note: note.trim() || null }),
        });
        showToast('Оплату зафіксовано');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.billing-unpay').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!(await showConfirm('Скасувати запис оплати за цей місяць?', { danger: true }))) return;
      try {
        await api(`/admin/billing/payments/${btn.dataset.paymentId}`, { method: 'DELETE' });
        showToast('Запис оплати видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.billing-day-inp').forEach(inp => {
    inp.addEventListener('change', async () => {
      const userId = parseInt(inp.dataset.userId, 10);
      try {
        await api(`/admin/billing/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ billing_day: parseInt(inp.value, 10) }),
        });
        showToast('День оплати оновлено');
        reload();
      } catch (err) {
        showToast(err.message, 'error');
        reload();
      }
    });
  });

  document.querySelectorAll('.billing-exempt-inp').forEach(inp => {
    inp.addEventListener('change', async () => {
      const userId = parseInt(inp.dataset.userId, 10);
      try {
        await api(`/admin/billing/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ billing_exempt: inp.checked }),
        });
        showToast(inp.checked ? 'Учня звільнено від оплати' : 'Оплата знову обов\'язкова');
        reload();
      } catch (err) {
        showToast(err.message, 'error');
        reload();
      }
    });
  });
}
