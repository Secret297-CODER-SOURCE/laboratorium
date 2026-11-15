import db from '../db/index.js';
import * as tg from './telegram.service.js';
import * as settings from './settings.service.js';
import { getAccessStatus } from './payment.service.js';

let polling = false;
let offset = 0;
let pollTimer = null;

const ADMIN_MANUAL = `📚 Мануал бота laboratorium.

Команди адміна:
/start — цей мануал
/status — стан бота
/templates — шаблони повідомлень
/tpl <ключ> — показати шаблон (lead_interest | homework_group | payment_reminder)
/send_lead <chat_id|@user> — надіслати шаблон «зацікавлення курсом»
/hw_group — нагадати про ДЗ у навчальну групу
/pay_ask — запитати, кому нагадати про оплату (я надішлю список)
/reply <chat_id> <текст> — відповісти в чат
/auto — список авто-відповідей
/auto_add <тригер> || <відповідь> — додати авто-відповідь
/auto_off <id> — вимкнути авто-відповідь
/link_me — привʼязати цей чат як адмінський
/link_user <chat_id|@user> <user_id> — привʼязати чат учня
/set_hw_group — позначити цей чат як групу для ДЗ-нагадувань

Підказки:
• Оплата: /pay_ask → оберіть учнів кнопками → бот надішле шаблон payment_reminder.
• ДЗ у групу: текст без імен учнів (налаштовується в адмінці / шаблоні homework_group).
• Авто-відповіді спрацьовують у особистих чатах, якщо немає відкритої admin-команди.`;

function cfg() {
  return settings.getTelegramConfig();
}

function isAdminChat(chatId, fromUsername) {
  const c = cfg();
  if (c.adminChatId && String(chatId) === String(c.adminChatId)) return true;
  if (c.adminUsername && fromUsername
    && String(fromUsername).toLowerCase() === String(c.adminUsername).toLowerCase()) {
    return true;
  }
  const row = db.prepare('SELECT is_admin FROM telegram_chats WHERE chat_id = ?').get(String(chatId));
  return !!row?.is_admin;
}

function upsertChat(chat, { isAdmin = false, isGroupHomework = false, linkedUserId = null } = {}) {
  if (!chat?.id) return;
  db.prepare(`
    INSERT INTO telegram_chats (chat_id, chat_type, title, username, linked_user_id, is_admin, is_group_homework)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      chat_type = excluded.chat_type,
      title = COALESCE(excluded.title, telegram_chats.title),
      username = COALESCE(excluded.username, telegram_chats.username),
      linked_user_id = COALESCE(excluded.linked_user_id, telegram_chats.linked_user_id),
      is_admin = CASE WHEN excluded.is_admin = 1 THEN 1 ELSE telegram_chats.is_admin END,
      is_group_homework = CASE WHEN excluded.is_group_homework = 1 THEN 1 ELSE telegram_chats.is_group_homework END
  `).run(
    String(chat.id),
    chat.type || 'private',
    chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || null,
    chat.username || null,
    linkedUserId,
    isAdmin ? 1 : 0,
    isGroupHomework ? 1 : 0,
  );
}

function logMessage(chatId, direction, body, tgMessageId = null) {
  db.prepare(`
    INSERT INTO telegram_message_log (chat_id, direction, body, tg_message_id)
    VALUES (?, ?, ?, ?)
  `).run(String(chatId), direction, String(body || '').slice(0, 4000), tgMessageId ? String(tgMessageId) : null);
}

export function getTemplate(key) {
  return db.prepare('SELECT * FROM telegram_templates WHERE key = ?').get(key);
}

export function listTemplates() {
  return db.prepare('SELECT * FROM telegram_templates ORDER BY key').all();
}

export function saveTemplate(key, body, title) {
  db.prepare(`
    INSERT INTO telegram_templates (key, title, body, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      body = excluded.body,
      title = COALESCE(excluded.title, telegram_templates.title),
      updated_at = datetime('now')
  `).run(key, title || key, body);
  return getTemplate(key);
}

async function reply(chatId, text, extra = {}) {
  const res = await tg.sendMessage(chatId, text, extra);
  if (res.ok) logMessage(chatId, 'out', text, res.result?.message_id);
  return res;
}

function overdueStudents() {
  const students = db.prepare(`
    SELECT id, name, handle, email FROM users
    WHERE role = 'student' AND billing_exempt = 0
    ORDER BY name COLLATE NOCASE
  `).all();
  return students.filter((s) => {
    try {
      const st = getAccessStatus(s.id);
      return ['pending', 'grace', 'overdue'].includes(st.status);
    } catch {
      return false;
    }
  }).slice(0, 30);
}

async function handlePayAsk(adminChatId) {
  const list = overdueStudents();
  if (!list.length) {
    await reply(adminChatId, 'Немає учнів з наближенням/простроченням оплати.');
    return;
  }
  const pending = db.prepare(`
    INSERT INTO telegram_pending (admin_chat_id, kind, payload, status)
    VALUES (?, 'payment_pick', ?, 'open')
  `).run(String(adminChatId), JSON.stringify({ selected: [] }));

  const keyboard = {
    inline_keyboard: [
      ...list.map((s) => ([{
        text: `${s.name} (@${s.handle})`,
        callback_data: `pay:${pending.lastInsertRowid}:${s.id}`,
      }])),
      [{ text: '✅ Надіслати вибраним', callback_data: `pay_send:${pending.lastInsertRowid}` }],
      [{ text: '❌ Скасувати', callback_data: `pay_cancel:${pending.lastInsertRowid}` }],
    ],
  };
  await reply(adminChatId, 'Оберіть учнів для нагадування про оплату:', { reply_markup: keyboard });
}

async function sendPaymentToUsers(userIds) {
  const tpl = getTemplate('payment_reminder');
  const text = tpl?.body || 'Нагадування про оплату навчання.';
  let sent = 0;
  for (const userId of userIds) {
    const chat = db.prepare(`
      SELECT chat_id FROM telegram_chats WHERE linked_user_id = ? AND chat_type = 'private' LIMIT 1
    `).get(userId);
    if (!chat) continue;
    const res = await reply(chat.chat_id, text);
    if (res.ok) sent += 1;
  }
  return sent;
}

function resolveChatTarget(target) {
  const raw = String(target || '').trim();
  if (!raw) return null;
  if (/^-?\d+$/.test(raw)) return raw;
  const username = raw.replace(/^@/, '').toLowerCase();
  const byUser = db.prepare(`
    SELECT chat_id FROM telegram_chats WHERE lower(username) = ? LIMIT 1
  `).get(username);
  return byUser?.chat_id || username;
}

export async function sendLeadTemplate(target) {
  const chatId = resolveChatTarget(target);
  if (!chatId) return { ok: false, error: 'no-target' };
  const tpl = getTemplate('lead_interest');
  return reply(chatId, tpl?.body || 'Доброго дня! Зацікавив ваш курс — можете розповісти детальніше?');
}

export async function adminReply(chatId, text) {
  return reply(chatId, text);
}

export async function triggerPayAskForAdmin() {
  const c = cfg();
  const adminChatId = c.adminChatId;
  if (!adminChatId) return { ok: false, error: 'no-admin-chat' };
  await handlePayAsk(adminChatId);
  return { ok: true };
}

export async function sendHomeworkReminderToUser(userId, body) {
  const chat = db.prepare(`
    SELECT chat_id FROM telegram_chats WHERE linked_user_id = ? AND chat_type = 'private' LIMIT 1
  `).get(userId);
  if (!chat) return false;
  const res = await reply(chat.chat_id, body);
  return !!res.ok;
}

export async function sendHomeworkGroupReminder() {
  const c = cfg();
  const chatId = c.homeworkGroupChatId
    || db.prepare('SELECT chat_id FROM telegram_chats WHERE is_group_homework = 1 LIMIT 1').get()?.chat_id;
  if (!chatId) return { ok: false, error: 'no-homework-group' };
  const tpl = getTemplate('homework_group');
  return reply(chatId, tpl?.body || 'Очікую ваші домашні завдання.');
}

function tryAutoReply(text) {
  const rows = db.prepare(`
    SELECT * FROM telegram_auto_replies WHERE is_active = 1 ORDER BY id ASC
  `).all();
  const lower = String(text || '').toLowerCase();
  for (const row of rows) {
    const trigger = String(row.trigger_text || '').toLowerCase();
    if (!trigger) continue;
    const hit = row.match_mode === 'exact'
      ? lower === trigger
      : lower.includes(trigger);
    if (hit) return row.reply_text;
  }
  return null;
}

async function handleAdminCommand(msg) {
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  const [cmd, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ').trim();

  if (cmd === '/start' || cmd.toLowerCase() === 'start') {
    await reply(chatId, ADMIN_MANUAL);
    return;
  }
  if (cmd === '/status') {
    const c = cfg();
    await reply(chatId, `Бот: ${c.enabled ? 'увімкнено' : 'вимкнено'}\nAdmin: @${c.adminUsername || '—'}\nAdmin chat: ${c.adminChatId || chatId}\nДЗ-група: ${c.homeworkGroupChatId || '—'}`);
    return;
  }
  if (cmd === '/templates') {
    const list = listTemplates().map((t) => `• ${t.key} — ${t.title}`).join('\n');
    await reply(chatId, list || 'Шаблонів немає');
    return;
  }
  if (cmd === '/tpl') {
    const tpl = getTemplate(arg);
    await reply(chatId, tpl ? `${tpl.key}\n\n${tpl.body}` : 'Шаблон не знайдено');
    return;
  }
  if (cmd === '/send_lead') {
    if (!arg) {
      await reply(chatId, 'Використання: /send_lead <chat_id|@username>');
      return;
    }
    const res = await sendLeadTemplate(arg);
    await reply(chatId, res.ok ? 'Надіслано' : `Помилка: ${res.error}`);
    return;
  }
  if (cmd === '/link_user') {
    const m = arg.match(/^(\S+)\s+(\d+)$/);
    if (!m) {
      await reply(chatId, 'Використання: /link_user <chat_id|@username> <user_id>');
      return;
    }
    const targetChat = resolveChatTarget(m[1]);
    if (!targetChat) {
      await reply(chatId, 'Чат не знайдено. Нехай людина спочатку напише боту.');
      return;
    }
    db.prepare('UPDATE telegram_chats SET linked_user_id = ? WHERE chat_id = ?')
      .run(parseInt(m[2], 10), String(targetChat));
    await reply(chatId, `Привʼязано chat ${targetChat} → user ${m[2]}`);
    return;
  }
  if (cmd === '/hw_group') {
    const res = await sendHomeworkGroupReminder();
    await reply(chatId, res.ok ? 'Нагадування в групу надіслано' : `Помилка: ${res.error || 'немає групи'}`);
    return;
  }
  if (cmd === '/pay_ask') {
    await handlePayAsk(chatId);
    return;
  }
  if (cmd === '/reply') {
    const m = arg.match(/^(\S+)\s+([\s\S]+)$/);
    if (!m) {
      await reply(chatId, 'Використання: /reply <chat_id> <текст>');
      return;
    }
    const res = await reply(m[1], m[2]);
    await reply(chatId, res.ok ? 'Відповідь надіслано' : `Помилка: ${res.error}`);
    return;
  }
  if (cmd === '/auto') {
    const rows = db.prepare('SELECT * FROM telegram_auto_replies ORDER BY id DESC LIMIT 30').all();
    await reply(chatId, rows.length
      ? rows.map((r) => `#${r.id} [${r.is_active ? 'on' : 'off'}] «${r.trigger_text}» → ${r.reply_text}`).join('\n')
      : 'Авто-відповідей немає');
    return;
  }
  if (cmd === '/auto_add') {
    const parts = arg.split('||');
    if (parts.length < 2) {
      await reply(chatId, 'Використання: /auto_add тригер || відповідь');
      return;
    }
    db.prepare(`
      INSERT INTO telegram_auto_replies (trigger_text, reply_text) VALUES (?, ?)
    `).run(parts[0].trim(), parts.slice(1).join('||').trim());
    await reply(chatId, 'Авто-відповідь додано');
    return;
  }
  if (cmd === '/auto_off') {
    db.prepare('UPDATE telegram_auto_replies SET is_active = 0 WHERE id = ?').run(parseInt(arg, 10));
    await reply(chatId, 'Вимкнено');
    return;
  }
  if (cmd === '/link_me') {
    upsertChat(msg.chat, { isAdmin: true });
    settings.saveTelegramSettings({ adminChatId: String(chatId), adminUsername: msg.from?.username || undefined });
    await reply(chatId, 'Цей чат збережено як адмінський.');
    return;
  }
  if (cmd === '/set_hw_group') {
    upsertChat(msg.chat, { isGroupHomework: true });
    settings.saveTelegramSettings({ homeworkGroupChatId: String(chatId) });
    await reply(chatId, 'Цей чат позначено для групових нагадувань про ДЗ.');
  }
}

async function handleCallback(cq) {
  const data = String(cq.data || '');
  const chatId = cq.message?.chat?.id;
  if (!chatId || !isAdminChat(chatId, cq.from?.username)) {
    await tg.answerCallbackQuery(cq.id, 'Немає доступу');
    return;
  }

  if (data.startsWith('pay:')) {
    const [, pendingId, userId] = data.split(':');
    const row = db.prepare('SELECT * FROM telegram_pending WHERE id = ? AND status = ?')
      .get(pendingId, 'open');
    if (!row) {
      await tg.answerCallbackQuery(cq.id, 'Сесію закрито');
      return;
    }
    const payload = JSON.parse(row.payload || '{}');
    const selected = new Set(payload.selected || []);
    const uid = Number(userId);
    if (selected.has(uid)) selected.delete(uid);
    else selected.add(uid);
    payload.selected = [...selected];
    db.prepare('UPDATE telegram_pending SET payload = ? WHERE id = ?')
      .run(JSON.stringify(payload), pendingId);
    await tg.answerCallbackQuery(cq.id, `Обрано: ${selected.size}`);
    return;
  }

  if (data.startsWith('pay_send:')) {
    const pendingId = data.split(':')[1];
    const row = db.prepare('SELECT * FROM telegram_pending WHERE id = ? AND status = ?')
      .get(pendingId, 'open');
    if (!row) {
      await tg.answerCallbackQuery(cq.id, 'Сесію закрито');
      return;
    }
    const payload = JSON.parse(row.payload || '{}');
    const selected = payload.selected || [];
    const sent = await sendPaymentToUsers(selected);
    db.prepare(`UPDATE telegram_pending SET status = 'done', resolved_at = datetime('now') WHERE id = ?`)
      .run(pendingId);
    await tg.answerCallbackQuery(cq.id, 'Готово');
    await reply(chatId, `Надіслано нагадувань про оплату: ${sent} з ${selected.length}`);
    return;
  }

  if (data.startsWith('pay_cancel:')) {
    const pendingId = data.split(':')[1];
    db.prepare(`UPDATE telegram_pending SET status = 'cancelled', resolved_at = datetime('now') WHERE id = ?`)
      .run(pendingId);
    await tg.answerCallbackQuery(cq.id, 'Скасовано');
    await reply(chatId, 'Скасовано.');
  }
}

async function handleUpdate(update) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
  const msg = update.message;
  if (!msg?.chat) return;
  upsertChat(msg.chat);
  const text = msg.text || '';
  if (text) logMessage(msg.chat.id, 'in', text, msg.message_id);

  const admin = isAdminChat(msg.chat.id, msg.from?.username);
  if (admin && (text.startsWith('/') || text.toLowerCase() === 'start')) {
    await handleAdminCommand(msg);
    return;
  }

  if (msg.chat.type === 'private' && text) {
    // link student by telegram username ↔ handle coincidence is weak; skip auto-link
    const auto = tryAutoReply(text);
    if (auto) {
      await reply(msg.chat.id, auto);
      return;
    }
    if (admin) return;
    // Forward unknown private messages to admin for smart reply
    const c = cfg();
    const adminTarget = c.adminChatId;
    if (adminTarget) {
      await reply(adminTarget, `✉️ Вхідне від ${msg.from?.username ? `@${msg.from.username}` : msg.chat.id} (chat ${msg.chat.id}):\n${text}\n\nВідповісти: /reply ${msg.chat.id} ваш текст`);
    }
  }
}

async function pollOnce() {
  const c = cfg();
  if (!c.enabled || !c.botToken) return;
  const res = await tg.getUpdates(offset, 20);
  if (!res.ok) return;
  for (const update of res.result || []) {
    offset = update.update_id + 1;
    try {
      await handleUpdate(update);
    } catch (err) {
      console.error('[telegram-bot] update error:', err.message);
    }
  }
}

export function startTelegramBotPolling() {
  if (polling) return;
  polling = true;
  const loop = async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error('[telegram-bot] poll error:', err.message);
    }
    pollTimer = setTimeout(loop, 1200);
    pollTimer.unref?.();
  };
  loop();
  console.log('[telegram-bot] polling started (enable + token in admin settings)');
}

export function getAdminOverview() {
  return {
    settings: settings.getTelegramSettingsPublic(),
    templates: listTemplates(),
    autoReplies: db.prepare('SELECT * FROM telegram_auto_replies ORDER BY id DESC LIMIT 50').all(),
    chats: db.prepare('SELECT * FROM telegram_chats ORDER BY id DESC LIMIT 50').all(),
    pending: db.prepare(`SELECT * FROM telegram_pending WHERE status = 'open' ORDER BY id DESC LIMIT 20`).all(),
  };
}
