import db from '../db/index.js';
import * as settingsService from '../services/settings.service.js';
import * as telegramBot from '../services/telegram-bot.service.js';
import { ValidationError } from '../utils/errors.js';

export async function getOverview(req, res) {
  res.json(telegramBot.getAdminOverview());
}

export async function getMonitor(req, res) {
  res.json({ monitor: telegramBot.getSiteMonitor() });
}

export async function updateSettings(req, res) {
  const settings = settingsService.saveTelegramSettings(req.body);
  telegramBot.restartTelegramClient().catch(() => {});
  res.json({ settings, message: 'Telegram налаштування збережено' });
}

export async function sendLoginCode(req, res) {
  const result = await telegramBot.sendLoginCode(req.body.phone);
  res.json({ ...result, message: result.viaApp ? 'Код надіслано в Telegram' : 'Код надіслано SMS' });
}

export async function confirmLogin(req, res) {
  const result = await telegramBot.confirmLogin({
    code: req.body.code,
    password: req.body.password,
  });
  if (result.ok) {
    await telegramBot.restartTelegramClient().catch(() => {});
  }
  res.json(result);
}

export async function logoutAccount(req, res) {
  const settings = await telegramBot.logoutAccount();
  res.json({ settings, message: 'Сесію Telegram скинуто' });
}

export async function listDialogs(req, res) {
  const dialogs = await telegramBot.listAccountDialogs();
  res.json({ dialogs });
}

export async function updateTemplate(req, res) {
  const key = String(req.params.key || '').trim();
  const body = String(req.body.body || '').trim();
  if (!key || !body) throw new ValidationError('Вкажіть ключ і текст шаблону');
  const template = telegramBot.saveTemplate(key, body, req.body.title);
  res.json({ template, message: 'Шаблон збережено' });
}

export async function addAutoReply(req, res) {
  const trigger = String(req.body.trigger_text || '').trim();
  const reply = String(req.body.reply_text || '').trim();
  if (!trigger || !reply) throw new ValidationError('Вкажіть тригер і відповідь');
  const result = db.prepare(`
    INSERT INTO telegram_auto_replies (trigger_text, reply_text, match_mode)
    VALUES (?, ?, ?)
  `).run(trigger.slice(0, 200), reply.slice(0, 2000), req.body.match_mode === 'exact' ? 'exact' : 'contains');
  const row = db.prepare('SELECT * FROM telegram_auto_replies WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ autoReply: row, message: 'Авто-відповідь додано' });
}

export async function disableAutoReply(req, res) {
  const id = parseInt(req.params.id, 10);
  db.prepare('UPDATE telegram_auto_replies SET is_active = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
}

export async function linkChatUser(req, res) {
  const chatId = String(req.body.chat_id || '').trim();
  const userId = parseInt(req.body.user_id, 10);
  if (!chatId || !userId) throw new ValidationError('Вкажіть chat_id і user_id');
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) throw new ValidationError('Користувача не знайдено');
  db.prepare(`
    UPDATE telegram_chats SET linked_user_id = ? WHERE chat_id = ?
  `).run(userId, chatId);
  res.json({ ok: true, message: 'Чат привʼязано до учня' });
}

export async function sendLead(req, res) {
  const target = String(req.body.target || '').trim();
  if (!target) throw new ValidationError('Вкажіть chat_id або @username');
  const result = await telegramBot.sendLeadTemplate(target);
  res.json(result);
}

export async function sendHomeworkGroup(req, res) {
  const result = await telegramBot.sendHomeworkGroupReminder();
  res.json(result);
}

export async function askPaymentReminders(req, res) {
  const result = await telegramBot.triggerPayAskForAdmin();
  res.json(result);
}

export async function sendReply(req, res) {
  const chatId = String(req.body.chat_id || '').trim();
  const text = String(req.body.text || '').trim();
  if (!chatId || !text) throw new ValidationError('Вкажіть chat_id і текст');
  const result = await telegramBot.adminReply(chatId, text);
  res.json(result);
}
