import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showPrompt } from '/dialog.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function loadTelegramData() {
  return api('/admin/telegram');
}

export function renderTelegramPanel(data = {}) {
  const s = data.settings || {};
  const templates = data.templates || [];
  const autos = data.autoReplies || [];
  const chats = data.chats || [];
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <div>
        <h2>${icon('chat', 'ico ico--md')}Telegram-бот</h2>
        <p class="crm-panel-sub">Ліди, ДЗ, оплата, авто-відповіді. Надішліть боту <strong>Start</strong> від адміна — прийде мануал команд.</p>
      </div>
      <span class="status-pill ${s.configured ? 'approved' : 'pending'}">${s.configured ? 'готовий' : 'не налаштовано'}</span>
    </div>

    <form class="admin-inline-form tg-settings" id="tg-settings">
      <label class="admin-check"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}> Увімкнено</label>
      <input class="admin-inp" name="botToken" type="password" placeholder="${s.hasToken ? 'Токен збережено — введіть новий щоб змінити' : 'Bot token від @BotFather'}" autocomplete="off">
      <input class="admin-inp" name="adminUsername" placeholder="@username адміна" value="${esc(s.adminUsername || '')}">
      <input class="admin-inp" name="adminChatId" placeholder="Admin chat_id" value="${esc(s.adminChatId || '')}">
      <input class="admin-inp" name="homeworkGroupChatId" placeholder="Chat_id групи для ДЗ" value="${esc(s.homeworkGroupChatId || '')}">
      <button type="submit" class="btn btn--primary btn--sm">Зберегти</button>
    </form>
    <p class="billing-hint">Після /link_me в особистому чаті з ботом admin chat_id підставиться сам. У групі з ДЗ надішліть /set_hw_group.</p>

    <div class="admin-grid" style="margin-top:20px">
      <section class="admin-panel">
        <h3>Шаблони повідомлень</h3>
        <div class="admin-list">
          ${templates.map((t) => `
            <article class="admin-list-item">
              <div>
                <strong>${esc(t.title)}</strong>
                <div class="homework-history-meta">${esc(t.key)}</div>
                <p class="homework-history-note">${esc(t.body)}</p>
              </div>
              <button type="button" class="btn btn--outline btn--sm tg-edit-tpl" data-key="${esc(t.key)}" data-title="${esc(t.title)}">${icon('edit', 'ico ico--sm')}</button>
            </article>`).join('') || '<p class="empty-state">Немає шаблонів</p>'}
        </div>
      </section>

      <section class="admin-panel">
        <h3>Швидкі дії</h3>
        <div class="tg-actions" style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="btn btn--outline btn--sm" id="tg-send-lead">${icon('plus', 'ico ico--sm')}Лід (зацікавлення)</button>
          <button type="button" class="btn btn--outline btn--sm" id="tg-hw-group">ДЗ у групу</button>
          <button type="button" class="btn btn--outline btn--sm" id="tg-pay-ask">Оплата → вибір учнів</button>
          <button type="button" class="btn btn--outline btn--sm" id="tg-reply">Відповісти в чат</button>
        </div>
        <h3 style="margin-top:20px">Авто-відповіді</h3>
        <form class="admin-inline-form" id="tg-auto-add">
          <input class="admin-inp" name="trigger" placeholder="Тригер (фраза)" required>
          <input class="admin-inp" name="reply" placeholder="Відповідь" required>
          <button type="submit" class="btn btn--primary btn--sm">Додати</button>
        </form>
        <div class="admin-list" style="margin-top:12px">
          ${autos.map((a) => `
            <div class="admin-list-item">
              <div><strong>«${esc(a.trigger_text)}»</strong> → ${esc(a.reply_text)}
                <div class="homework-history-meta">${a.is_active ? 'активна' : 'вимкнена'} · ${esc(a.match_mode)}</div>
              </div>
              ${a.is_active ? `<button type="button" class="btn btn--ghost btn--sm tg-auto-off" data-id="${a.id}">Вимкнути</button>` : ''}
            </div>`).join('') || '<p class="empty-state">Немає авто-відповідей</p>'}
        </div>
      </section>
    </div>

    <section class="admin-panel admin-panel--wide" style="margin-top:16px">
      <h3>Відомі чати</h3>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>Chat</th><th>Тип</th><th>Username</th><th>Учень</th><th>Прапорці</th><th></th></tr></thead>
        <tbody>
          ${chats.map((c) => `<tr>
            <td><code>${esc(c.chat_id)}</code><div class="billing-user-sub">${esc(c.title || '')}</div></td>
            <td>${esc(c.chat_type)}</td>
            <td>${c.username ? `@${esc(c.username)}` : '—'}</td>
            <td>${c.linked_user_id || '—'}</td>
            <td>${c.is_admin ? 'admin ' : ''}${c.is_group_homework ? 'hw-group' : ''}</td>
            <td><button type="button" class="btn btn--ghost btn--sm tg-link-user" data-chat-id="${esc(c.chat_id)}">Привʼязати user_id</button></td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Поки ніхто не писав боту</td></tr>'}
        </tbody>
      </table></div>
    </section>
  </section>`;
}

export function bindTelegramPanelEvents(showToast, reload) {
  document.getElementById('tg-settings')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      enabled: fd.get('enabled') === 'on',
      adminUsername: fd.get('adminUsername'),
      adminChatId: fd.get('adminChatId'),
      homeworkGroupChatId: fd.get('homeworkGroupChatId'),
    };
    const token = String(fd.get('botToken') || '').trim();
    if (token) body.botToken = token;
    try {
      await api('/admin/telegram/settings', { method: 'PATCH', body: JSON.stringify(body) });
      showToast('Збережено');
      reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.querySelectorAll('.tg-edit-tpl').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const body = await showPrompt(`Текст шаблону «${btn.dataset.title}»:`);
      if (body === null) return;
      try {
        await api(`/admin/telegram/templates/${btn.dataset.key}`, {
          method: 'PATCH',
          body: JSON.stringify({ body, title: btn.dataset.title }),
        });
        showToast('Шаблон оновлено');
        reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('tg-auto-add')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/telegram/auto-replies', {
        method: 'POST',
        body: JSON.stringify({
          trigger_text: fd.get('trigger'),
          reply_text: fd.get('reply'),
        }),
      });
      showToast('Авто-відповідь додано');
      reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.querySelectorAll('.tg-auto-off').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/admin/telegram/auto-replies/${btn.dataset.id}/disable`, { method: 'POST' });
        reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('.tg-link-user').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = await showPrompt('user_id учня з адмінки:');
      if (!userId) return;
      try {
        await api('/admin/telegram/link-chat', {
          method: 'POST',
          body: JSON.stringify({ chat_id: btn.dataset.chatId, user_id: parseInt(userId, 10) }),
        });
        showToast('Привʼязано');
        reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('tg-send-lead')?.addEventListener('click', async () => {
    const target = await showPrompt('chat_id або @username:');
    if (!target) return;
    try {
      const res = await api('/admin/telegram/send-lead', {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
      showToast(res.ok ? 'Надіслано' : (res.error || 'Помилка'), res.ok ? 'success' : 'error');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('tg-hw-group')?.addEventListener('click', async () => {
    try {
      const res = await api('/admin/telegram/hw-group', { method: 'POST' });
      showToast(res.ok ? 'Нагадування в групу надіслано' : (res.error || 'Помилка'), res.ok ? 'success' : 'error');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('tg-pay-ask')?.addEventListener('click', async () => {
    try {
      const res = await api('/admin/telegram/pay-ask', { method: 'POST' });
      showToast(res.ok ? 'Список учнів надіслано адміну в Telegram' : (res.error || 'Помилка'), res.ok ? 'success' : 'error');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('tg-reply')?.addEventListener('click', async () => {
    const chatId = await showPrompt('chat_id:');
    if (!chatId) return;
    const text = await showPrompt('Текст відповіді:');
    if (!text) return;
    try {
      const res = await api('/admin/telegram/reply', {
        method: 'POST',
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      showToast(res.ok ? 'Відповідь надіслано' : (res.error || 'Помилка'), res.ok ? 'success' : 'error');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
