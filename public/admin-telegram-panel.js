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
  const m = data.monitor || {};
  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <div>
        <h2>${icon('chat', 'ico ico--md')}User-bot + адмін-бот</h2>
        <p class="crm-panel-sub">Підключення через Telegram API (my.telegram.org): API ID + API Hash і вхід з акаунта. Чати обираються зі списку діалогів, не вручну.</p>
      </div>
      <span class="status-pill ${s.configured ? 'approved' : 'pending'}">${s.configured ? 'готовий' : 'не налаштовано'}</span>
    </div>
    <div class="tg-monitor-strip">
      <article><strong>${m.users ?? '—'}</strong><span>Користувачі</span></article>
      <article><strong>${m.errors24h ?? 0}</strong><span>Помилки 24h</span></article>
      <article><strong>${m.liveConferences ?? 0}</strong><span>Live кімнати</span></article>
      <article><strong>${m.botEnabled ? 'он' : 'оф'}</strong><span>Telegram</span></article>
    </div>
    <div class="tg-persona-grid">
      <article class="admin-panel">
        <h3>Адмін</h3>
        <p class="crm-panel-sub">/start /monitor /pay_ask /reply /link_user. Ідентичність адміна не змінюється.</p>
      </article>
      <article class="admin-panel">
        <h3>User-bot (учні)</h3>
        <p class="crm-panel-sub">/cabinet /tools /ctf /schedule /pay /me. Не бачать адмін-мануал. Привʼязка: username = handle.</p>
      </article>
    </div>

    <form class="admin-inline-form tg-settings" id="tg-settings">
      <label class="admin-check"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}> Увімкнено</label>
      <input class="admin-inp" name="apiId" inputmode="numeric" placeholder="API ID" value="${esc(s.apiId || '')}" autocomplete="off">
      <input class="admin-inp" name="apiHash" type="password" placeholder="${s.hasApiHash ? 'API Hash збережено — введіть новий щоб змінити' : 'API Hash'}" autocomplete="off">
      <input class="admin-inp" name="adminUsername" placeholder="@username адміна (необовʼязково)" value="${esc(s.adminUsername || '')}">
      <select class="admin-inp" name="adminChatId" id="tg-admin-chat" ${s.hasSession ? '' : 'disabled'}>
        <option value="">Адмін-чат — оберіть зі списку</option>
        ${s.adminChatId ? `<option value="${esc(s.adminChatId)}" selected>Збережено: ${esc(s.adminChatId)}</option>` : ''}
      </select>
      <select class="admin-inp" name="homeworkGroupChatId" id="tg-hw-chat" ${s.hasSession ? '' : 'disabled'}>
        <option value="">Група для ДЗ — оберіть зі списку</option>
        ${s.homeworkGroupChatId ? `<option value="${esc(s.homeworkGroupChatId)}" selected>Збережено: ${esc(s.homeworkGroupChatId)}</option>` : ''}
      </select>
      <button type="submit" class="btn btn--primary btn--sm">Зберегти</button>
    </form>
    <form class="admin-inline-form tg-login" id="tg-login">
      <input class="admin-inp" name="phone" placeholder="Телефон +380…" autocomplete="off">
      <button type="submit" class="btn btn--outline btn--sm" id="tg-send-code">Надіслати код</button>
      <input class="admin-inp" name="code" placeholder="Код з Telegram" autocomplete="one-time-code" inputmode="numeric">
      <input class="admin-inp" name="password" type="password" placeholder="Пароль 2FA (якщо є)" autocomplete="off">
      <button type="button" class="btn btn--outline btn--sm" id="tg-confirm-login">Увійти</button>
      ${s.hasSession ? `<button type="button" class="btn btn--ghost btn--sm" id="tg-logout">Вийти з акаунта</button>` : ''}
    </form>
    <p class="billing-hint">${s.hasSession
      ? `Сесія активна${s.phoneMasked ? ` · ${esc(s.phoneMasked)}` : ''}. Оберіть чати зі списку діалогів.`
      : 'API ID і Hash беріть на my.telegram.org/apps, збережіть, потім увійдіть номером акаунта. Після входу зʼявиться список чатів.'}</p>

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

function fillChatSelect(sel, dialogs, currentId, emptyLabel) {
  if (!sel) return;
  const current = String(currentId || sel.value || '');
  sel.disabled = false;
  sel.innerHTML = `<option value="">${emptyLabel}</option>` + dialogs.map((d) => {
    const label = `${d.title}${d.username ? ` @${d.username}` : ''} · ${d.type}`;
    const selected = String(d.id) === current ? ' selected' : '';
    return `<option value="${esc(d.id)}"${selected}>${esc(label)}</option>`;
  }).join('');
  if (current && ![...sel.options].some((o) => o.value === current)) {
    sel.insertAdjacentHTML('beforeend', `<option value="${esc(current)}" selected>Збережено: ${esc(current)}</option>`);
  }
}

async function hydrateTelegramDialogs(settings = {}) {
  const adminSel = document.getElementById('tg-admin-chat');
  const hwSel = document.getElementById('tg-hw-chat');
  if (!adminSel || !settings.hasSession) return;
  try {
    const { dialogs } = await api('/admin/telegram/dialogs');
    const list = dialogs || [];
    fillChatSelect(adminSel, list, settings.adminChatId, 'Адмін-чат — оберіть зі списку');
    fillChatSelect(hwSel, list, settings.homeworkGroupChatId, 'Група для ДЗ — оберіть зі списку');
  } catch (err) {
    adminSel.disabled = false;
    if (!adminSel.options.length) {
      adminSel.innerHTML = `<option value="">${esc(err.message || 'Не вдалося завантажити чати')}</option>`;
    }
  }
}

export function bindTelegramPanelEvents(showToast, reload) {
  const adminSel = document.getElementById('tg-admin-chat');
  hydrateTelegramDialogs({
    hasSession: !!(adminSel && !adminSel.disabled),
    adminChatId: adminSel?.value,
    homeworkGroupChatId: document.getElementById('tg-hw-chat')?.value,
  });

  document.getElementById('tg-settings')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      enabled: fd.get('enabled') === 'on',
      apiId: fd.get('apiId'),
      adminUsername: fd.get('adminUsername'),
      adminChatId: fd.get('adminChatId'),
      homeworkGroupChatId: fd.get('homeworkGroupChatId'),
    };
    const apiHash = String(fd.get('apiHash') || '').trim();
    if (apiHash) body.apiHash = apiHash;
    try {
      await api('/admin/telegram/settings', { method: 'PATCH', body: JSON.stringify(body) });
      showToast('Збережено');
      reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('tg-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/telegram/login/code', {
        method: 'POST',
        body: JSON.stringify({ phone: fd.get('phone') }),
      });
      showToast('Код надіслано');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('tg-confirm-login')?.addEventListener('click', async () => {
    const form = document.getElementById('tg-login');
    const fd = new FormData(form);
    const body = { code: fd.get('code') };
    const password = String(fd.get('password') || '').trim();
    if (password) body.password = password;
    try {
      const res = await api('/admin/telegram/login/confirm', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.needsPassword) {
        showToast('Введіть пароль 2FA і натисніть Увійти ще раз', 'error');
        return;
      }
      showToast('Увійшли в Telegram');
      reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('tg-logout')?.addEventListener('click', async () => {
    try {
      await api('/admin/telegram/logout', { method: 'POST' });
      showToast('Сесію скинуто');
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
