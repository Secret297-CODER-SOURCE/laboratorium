import { api } from '/auth.js';
import { icon } from '/icons.js';

let selectedThreadId = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function dateLabel(value) {
  return value ? new Date(`${value.replace(' ', 'T')}Z`).toLocaleString('uk-UA', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : '';
}

export async function loadMessagesPanel() {
  const [{ threads }, { templates }] = await Promise.all([
    api(`/admin/messages${new URLSearchParams(location.search).get('messageStatus') ? `?status=${encodeURIComponent(new URLSearchParams(location.search).get('messageStatus'))}` : ''}`),
    api('/admin/messages/templates'),
  ]);
  if (!threads.some(thread => thread.id === selectedThreadId)) {
    selectedThreadId = threads[0]?.id || null;
  }
  const selected = selectedThreadId
    ? await api(`/admin/messages/${selectedThreadId}`)
    : null;
  return {
    threads: threads.map(thread => thread.id === selectedThreadId ? { ...thread, unread_owner: false } : thread),
    templates,
    selected,
  };
}

export function renderMessagesPanel({ threads = [], templates = [], selected = null } = {}) {
  const current = selected?.thread;
  const selectedStatus = new URLSearchParams(location.search).get('messageStatus') || '';
  const statusLabels = { open: 'Нове', waiting: 'Очікує відповіді', closed: 'Закрите' };
  return `<section class="admin-panel admin-panel--wide support-admin">
    <div class="admin-panel-head">
      <h2>${icon('chat', 'ico ico--md')}Повідомлення та звернення</h2>
      <span class="support-mail-status">Відповіді надсилаються на email учня через налаштований SMTP</span>
    </div>
    <div class="support-admin-layout">
      <aside class="support-thread-list" aria-label="Список звернень">
        <div class="support-filter">
          <label for="support-status-filter">Показати</label>
          <select class="admin-inp" id="support-status-filter">
            <option value="" ${selectedStatus === '' ? 'selected' : ''}>Усі звернення</option>
            <option value="open" ${selectedStatus === 'open' ? 'selected' : ''}>Нові / відкриті</option>
            <option value="waiting" ${selectedStatus === 'waiting' ? 'selected' : ''}>Очікують відповіді</option>
            <option value="closed" ${selectedStatus === 'closed' ? 'selected' : ''}>Закриті</option>
          </select>
        </div>
        ${threads.length ? threads.map(thread => `
          <button type="button" class="support-thread-item${thread.id === selectedThreadId ? ' is-active' : ''}" data-support-thread="${thread.id}">
            <span class="support-thread-top"><strong>${esc(thread.subject)}</strong>${thread.unread_owner ? '<i aria-label="Нове повідомлення"></i>' : ''}</span>
            <span class="support-thread-name">${esc(thread.user_name)} · ${esc(thread.user_email)}</span>
            <span class="support-thread-preview">${esc(thread.last_message || '')}</span>
            <span class="support-thread-meta">${esc(statusLabels[thread.status] || thread.status)} · ${dateLabel(thread.updated_at)}</span>
          </button>`).join('') : '<p class="empty-state">Звернень поки немає</p>'}
      </aside>
      <div class="support-conversation">
        ${current ? `
          <header class="support-conversation-head">
            <div><h3>${esc(current.subject)}</h3><p>${esc(current.user_name)} · <a href="mailto:${esc(current.user_email)}">${esc(current.user_email)}</a></p></div>
            <button type="button" class="btn btn--outline btn--sm support-close-thread" data-thread="${current.id}" data-status="${current.status}">${current.status === 'closed' ? 'Відкрити' : 'Закрити звернення'}</button>
          </header>
          <div class="support-message-list" id="support-admin-message-list">
            ${(selected.messages || []).map(message => `<article class="support-message support-message--${message.sender_role}">
              <div class="support-message-meta"><strong>${message.sender_role === 'owner' ? 'Ви' : esc(current.user_name)}</strong><time>${dateLabel(message.created_at)}</time></div>
              <p>${esc(message.body)}</p>
              ${message.sender_role === 'owner' ? `<small>${message.email_sent ? 'Надіслано на email' : 'Збережено в чаті; email не доставлено'}</small>` : ''}
            </article>`).join('')}
          </div>
          <form id="support-owner-reply" class="support-reply-form" data-thread="${current.id}">
            <label for="support-template-select">Шаблон відповіді</label>
            <div class="support-template-row">
              <select class="admin-inp" id="support-template-select"><option value="">Без шаблону</option>${templates.map(template => `<option value="${template.id}">${esc(template.title)}</option>`).join('')}</select>
              <button type="button" class="btn btn--outline btn--sm" id="support-template-remove" disabled>Видалити</button>
            </div>
            <textarea class="admin-inp support-reply-body" name="body" rows="4" maxlength="5000" required placeholder="Напишіть відповідь…"></textarea>
            <button type="submit" class="btn btn--primary btn--sm">${icon('send', 'ico ico--sm')}Відповісти та надіслати email</button>
          </form>
        ` : '<div class="support-empty"><span>✉</span><h3>Оберіть звернення</h3><p>Тут з’явиться листування з користувачем.</p></div>'}
      </div>
    </div>
    <details class="support-template-manager">
      <summary>Керувати шаблонами відповідей</summary>
      <form id="support-template-create">
        <label>Назва шаблону<input class="admin-inp" name="title" required maxlength="100"></label>
        <label>Текст відповіді<textarea class="admin-inp" name="body" rows="3" required maxlength="5000"></textarea></label>
        <button type="submit" class="btn btn--outline btn--sm">Додати шаблон</button>
      </form>
      <p>Шаблон заповнює поле відповіді — перед відправленням його можна змінити.</p>
    </details>
  </section>`;
}

export function bindMessagesPanelEvents(showToast, reload) {
  document.querySelectorAll('[data-support-thread]').forEach(button => {
    button.addEventListener('click', () => {
      selectedThreadId = Number(button.dataset.supportThread);
      reload();
    });
  });
  document.getElementById('support-status-filter')?.addEventListener('change', event => {
    const url = new URL(location.href);
    if (event.target.value) url.searchParams.set('messageStatus', event.target.value);
    else url.searchParams.delete('messageStatus');
    history.replaceState(null, '', url);
    reload();
  });
  document.getElementById('support-owner-reply')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await api(`/admin/messages/${event.currentTarget.dataset.thread}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body: new FormData(event.currentTarget).get('body') }),
      });
      showToast(result.message, result.emailDelivery.sent ? 'success' : 'error');
      reload();
    } catch (err) {
      showToast(err.message, 'error');
      button.disabled = false;
    }
  });
  document.getElementById('support-template-select')?.addEventListener('change', async event => {
    const removeButton = document.getElementById('support-template-remove');
    const id = event.target.value;
    removeButton.disabled = !id;
    if (!id) return;
    try {
      const { templates } = await api('/admin/messages/templates');
      const template = templates.find(item => String(item.id) === id);
      if (template) document.querySelector('#support-owner-reply [name="body"]').value = template.body;
    } catch (err) { showToast(err.message, 'error'); }
  });
  document.getElementById('support-template-remove')?.addEventListener('click', async () => {
    const id = document.getElementById('support-template-select')?.value;
    if (!id) return;
    try {
      await api(`/admin/messages/templates/${id}`, { method: 'DELETE' });
      showToast('Шаблон видалено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });
  document.querySelector('.support-close-thread')?.addEventListener('click', async event => {
    const current = event.currentTarget.dataset.status;
    try {
      await api(`/admin/messages/${event.currentTarget.dataset.thread}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: current === 'closed' ? 'open' : 'closed' }),
      });
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });
  document.getElementById('support-template-create')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await api('/admin/messages/templates', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      showToast('Шаблон додано');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });
  const messageList = document.getElementById('support-admin-message-list');
  if (messageList) messageList.scrollTop = messageList.scrollHeight;
}
