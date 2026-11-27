import db from '../db/index.js';
import config from '../config/index.js';
import * as tg from './telegram.service.js';
import * as settings from './settings.service.js';
import { getAccessStatus } from './payment.service.js';
import { listStudentLessons } from './schedule.service.js';
import * as errorLog from './error-log.service.js';

let polling = false;

function siteBase() {
  return String(config.siteUrl || 'https://laboratorium.club').replace(/\/+$/, '');
}

const ADMIN_MANUAL = `📚 Адмін-бот laboratorium (особистість адміна не змінюється).

Команди адміна:
/start — цей мануал
/status — стан бота
/monitor — здоровʼя сайту (користувачі, помилки, live-кімнати)
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

Учні в цьому ж боті бачать user-bot (/cabinet, /tools, /schedule, /pay), не адмін-команди.
Моніторинг також у адмінці: ${siteBase()}/admin.html?tab=telegram

Підказки:
• Оплата: /pay_ask → оберіть учнів кнопками → бот надішле шаблон payment_reminder.
• ДЗ у групу: текст без імен учнів (налаштовується в адмінці / шаблоні homework_group).
• Авто-відповіді спрацьовують у особистих чатах, якщо немає відкритої admin-команди.`;

const STUDENT_MANUAL = `👋 User-bot laboratorium — швидкий доступ до школи.

Команди:
/start /help — ця підказка
/cabinet — особистий кабінет
/tools — лабораторія (VM, Docker, workbench)
/ctf — CTF-завдання
/schedule — найближчі заняття
/pay — статус оплати
/me — хто привʼязаний до цього чату
/link — як привʼязати акаунт

Сайт: ${siteBase()}
Кабінет: ${siteBase()}/dashboard.html
Інструменти: ${siteBase()}/dashboard.html?tab=lab`;

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
  db.prepare(`
    INSERT INTO telegram_pending (admin_chat_id, kind, payload, status)
    VALUES (?, 'payment_pick', ?, 'open')
  `).run(String(adminChatId), JSON.stringify({
    selected: [],
    students: list.map((s) => ({ id: s.id, name: s.name, handle: s.handle })),
  }));
  const lines = list.map((s, i) => `${i + 1}. ${s.name} (@${s.handle})`);
  await reply(adminChatId, [
    'Оберіть учнів номерами:',
    lines.join('\n'),
    '',
    'Далі: /pay_sel 1 3',
    'Надіслати: /pay_go',
    'Скасувати: /pay_cancel',
  ].join('\n'));
}

function openPayPending(adminChatId) {
  return db.prepare(`
    SELECT * FROM telegram_pending
    WHERE admin_chat_id = ? AND kind = 'payment_pick' AND status = 'open'
    ORDER BY id DESC LIMIT 1
  `).get(String(adminChatId));
}

async function handlePayPickCommand(msg) {
  const chatId = msg.chat.id;
  const cmd = commandName(msg.text);
  const row = openPayPending(chatId);
  if (!row) {
    await reply(chatId, 'Немає відкритого вибору оплати. /pay_ask');
    return;
  }
  const payload = JSON.parse(row.payload || '{}');
  const students = payload.students || [];
  if (cmd === '/pay_cancel') {
    db.prepare(`UPDATE telegram_pending SET status = 'cancelled', resolved_at = datetime('now') WHERE id = ?`)
      .run(row.id);
    await reply(chatId, 'Скасовано.');
    return;
  }
  if (cmd === '/pay_go') {
    const selected = payload.selected || [];
    const sent = await sendPaymentToUsers(selected);
    db.prepare(`UPDATE telegram_pending SET status = 'done', resolved_at = datetime('now') WHERE id = ?`)
      .run(row.id);
    await reply(chatId, `Надіслано нагадувань про оплату: ${sent} з ${selected.length}`);
    return;
  }
  const nums = String(msg.text || '').replace(/^\/pay_sel\s*/i, '').match(/\d+/g) || [];
  const selected = new Set(payload.selected || []);
  for (const n of nums) {
    const idx = parseInt(n, 10);
    const student = students[idx - 1] || students.find((s) => s.id === idx);
    if (student) {
      if (selected.has(student.id)) selected.delete(student.id);
      else selected.add(student.id);
    }
  }
  payload.selected = [...selected];
  db.prepare('UPDATE telegram_pending SET payload = ? WHERE id = ?')
    .run(JSON.stringify(payload), row.id);
  await reply(chatId, `Обрано: ${payload.selected.length}. /pay_go або /pay_cancel`);
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

function countSafe(sql, params = []) {
  try {
    return db.prepare(sql).get(...params)?.n || 0;
  } catch {
    return 0;
  }
}

export function getSiteMonitor() {
  const c = cfg();
  return {
    users: countSafe('SELECT COUNT(*) AS n FROM users'),
    students: countSafe("SELECT COUNT(*) AS n FROM users WHERE role = 'student'"),
    errors24h: errorLog.countSinceHours(24),
    liveConferences: countSafe("SELECT COUNT(*) AS n FROM conferences WHERE status = 'live'"),
    pendingApplications: countSafe("SELECT COUNT(*) AS n FROM applications WHERE status = 'pending'"),
    linkedChats: countSafe('SELECT COUNT(*) AS n FROM telegram_chats WHERE linked_user_id IS NOT NULL'),
    inbound24h: countSafe(`
      SELECT COUNT(*) AS n FROM telegram_message_log
      WHERE direction = 'in' AND created_at >= datetime('now', '-1 day')
    `),
    botEnabled: !!(c.enabled && c.session),
    hasAdminChat: !!c.adminChatId,
    uptimeSec: Math.floor(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
}

export function formatMonitorText(monitor = getSiteMonitor()) {
  const m = monitor;
  const bot = m.botEnabled ? 'он' : 'оф';
  return [
    '🩺 Моніторинг laboratorium',
    `Користувачі: ${m.users} (учні: ${m.students})`,
    `Заявки pending: ${m.pendingApplications}`,
    `Live-конференції: ${m.liveConferences}`,
    `Помилки 24h: ${m.errors24h}`,
    `Telegram: ${bot}${m.hasAdminChat ? ' · admin chat ок' : ' · немає admin chat'}`,
    `Привʼязані чати: ${m.linkedChats} · вхідні 24h: ${m.inbound24h}`,
    `Процес: ${m.uptimeSec}s · heap ${m.memoryMB}MB`,
  ].join('\n');
}

function linkedUserForChat(chatId) {
  const row = db.prepare(`
    SELECT linked_user_id FROM telegram_chats WHERE chat_id = ?
  `).get(String(chatId));
  if (!row?.linked_user_id) return null;
  return db.prepare(`
    SELECT id, name, handle, role FROM users WHERE id = ?
  `).get(row.linked_user_id);
}

function tryLinkByUsername(chat, from) {
  const uname = String(from?.username || '').replace(/^@/, '').toLowerCase();
  if (!uname) return null;
  const existing = db.prepare('SELECT linked_user_id FROM telegram_chats WHERE chat_id = ?')
    .get(String(chat.id));
  if (existing?.linked_user_id) return existing.linked_user_id;
  const matches = db.prepare('SELECT id FROM users WHERE lower(handle) = ?').all(uname);
  if (matches.length !== 1) return null;
  db.prepare('UPDATE telegram_chats SET linked_user_id = ? WHERE chat_id = ?')
    .run(matches[0].id, String(chat.id));
  return matches[0].id;
}

function commandName(text) {
  const raw = String(text || '').trim().split(/\s+/)[0] || '';
  return raw.split('@')[0].toLowerCase();
}

async function handleStudentCommand(msg) {
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  const cmd = commandName(text);
  const user = linkedUserForChat(chatId);
  const base = siteBase();

  if (cmd === '/start' || cmd === '/help' || cmd === 'start') {
    await reply(chatId, STUDENT_MANUAL);
    return;
  }
  if (cmd === '/cabinet') {
    await reply(chatId, `Кабінет: ${base}/dashboard.html`);
    return;
  }
  if (cmd === '/tools') {
    await reply(chatId, `Інструменти (VM, Docker, JWT/hashes workbench):\n${base}/dashboard.html?tab=lab&lab=tools`);
    return;
  }
  if (cmd === '/ctf') {
    await reply(chatId, `CTF: ${base}/dashboard.html?tab=ctf`);
    return;
  }
  if (cmd === '/link') {
    await reply(chatId, user
      ? `Чат уже привʼязано до @${user.handle}.`
      : 'Поставте Telegram @username = ваш handle на сайті і напишіть /me, або попросіть адміна /link_user.');
    return;
  }
  if (cmd === '/me') {
    if (!user) {
      await reply(chatId, 'Акаунт не привʼязано. Надішліть /link');
      return;
    }
    await reply(chatId, `Ви: ${user.name} (@${user.handle})\nРоль: ${user.role}`);
    return;
  }
  if (cmd === '/pay') {
    if (!user) {
      await reply(chatId, 'Спочатку привʼяжіть акаунт: /link');
      return;
    }
    try {
      const st = getAccessStatus(user.id);
      await reply(chatId, `Оплата: ${st.status}${st.dueDate ? `\nНаступна дата: ${st.dueDate}` : ''}`);
    } catch {
      await reply(chatId, 'Не вдалося прочитати статус оплати. Відкрийте кабінет.');
    }
    return;
  }
  if (cmd === '/schedule') {
    if (!user) {
      await reply(chatId, `Розклад: ${base}/dashboard.html#schedule-panel\n(привʼяжіть акаунт через /link, щоб бачити заняття тут)`);
      return;
    }
    const lessons = listStudentLessons(user.id, {
      from: new Date().toISOString(),
      to: new Date(Date.now() + 14 * 86400000).toISOString(),
    }).slice(0, 5);
    if (!lessons.length) {
      await reply(chatId, `Найближчих занять немає.\nКабінет: ${base}/dashboard.html`);
      return;
    }
    const lines = lessons.map((l) => `• ${l.lesson_at} — ${l.title} (${l.group_name})`);
    await reply(chatId, `Найближчі заняття:\n${lines.join('\n')}`);
    return;
  }
  await reply(chatId, 'Невідома команда. Надішліть /help');
}

async function handleAdminCommand(msg) {
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = String(rawCmd || '').split('@')[0];
  const arg = rest.join(' ').trim();

  if (cmd === '/start' || cmd.toLowerCase() === 'start') {
    await reply(chatId, ADMIN_MANUAL);
    return;
  }
  if (cmd === '/status') {
    const c = cfg();
    await reply(chatId, `Telegram: ${c.enabled && c.session ? 'увімкнено' : 'вимкнено'}\nAdmin: @${c.adminUsername || '—'}\nAdmin chat: ${c.adminChatId || chatId}\nДЗ-група: ${c.homeworkGroupChatId || '—'}`);
    return;
  }
  if (cmd === '/monitor') {
    await reply(chatId, formatMonitorText());
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
  if (cmd === '/pay_sel' || cmd === '/pay_go' || cmd === '/pay_cancel') {
    await handlePayPickCommand(msg);
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
  if (msg.chat.type === 'private') tryLinkByUsername(msg.chat, msg.from);
  const text = msg.text || '';
  if (text) logMessage(msg.chat.id, 'in', text, msg.message_id);

  const admin = isAdminChat(msg.chat.id, msg.from?.username);
  const cmd = commandName(text);
  const isSlash = cmd.startsWith('/') || text.toLowerCase() === 'start';
  if (admin && isSlash) {
    await handleAdminCommand(msg);
    return;
  }
  if (!admin && msg.chat.type === 'private' && isSlash) {
    await handleStudentCommand(msg);
    return;
  }

  if (msg.chat.type === 'private' && text) {
    const auto = tryAutoReply(text);
    if (auto) {
      await reply(msg.chat.id, auto);
      return;
    }
    if (admin) return;
    const c = cfg();
    const adminTarget = c.adminChatId;
    if (adminTarget) {
      await reply(adminTarget, `✉️ Вхідне від ${msg.from?.username ? `@${msg.from.username}` : msg.chat.id} (chat ${msg.chat.id}):\n${text}\n\nВідповісти: /reply ${msg.chat.id} ваш текст`);
    }
  }
}

export function startTelegramBotPolling() {
  if (polling) return;
  polling = true;
  tg.setUpdateHandler(handleUpdate);
  tg.startClient().then((ok) => {
    console.log(ok
      ? '[telegram] MTProto client started'
      : '[telegram] waiting for API ID/hash + session in admin settings');
  });
}

export async function restartTelegramClient() {
  polling = true;
  tg.setUpdateHandler(handleUpdate);
  return tg.restartClient();
}

export function getAdminOverview() {
  return {
    settings: settings.getTelegramSettingsPublic(),
    templates: listTemplates(),
    autoReplies: db.prepare('SELECT * FROM telegram_auto_replies ORDER BY id DESC LIMIT 50').all(),
    chats: db.prepare('SELECT * FROM telegram_chats ORDER BY id DESC LIMIT 50').all(),
    pending: db.prepare(`SELECT * FROM telegram_pending WHERE status = 'open' ORDER BY id DESC LIMIT 20`).all(),
    monitor: getSiteMonitor(),
  };
}

export {
  sendLoginCode,
  confirmLogin,
  logoutAccount,
  listAccountDialogs,
} from './telegram.service.js';
