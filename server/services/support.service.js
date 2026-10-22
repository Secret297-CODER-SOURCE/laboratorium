import db from '../db/index.js';
import * as mailService from './mail.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

function cleanText(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ValidationError(`${label}: до ${max} символів`);
  }
  return value.trim();
}

function threadForUser(threadId, userId) {
  const thread = db.prepare(`
    SELECT st.*, u.name AS user_name, u.email AS user_email, u.handle AS user_handle
    FROM support_threads st JOIN users u ON u.id = st.user_id
    WHERE st.id = ? AND st.user_id = ?
  `).get(threadId, userId);
  if (!thread) throw new NotFoundError('Звернення не знайдено');
  return thread;
}

function threadForOwner(threadId) {
  const thread = db.prepare(`
    SELECT st.*, u.name AS user_name, u.email AS user_email, u.handle AS user_handle
    FROM support_threads st JOIN users u ON u.id = st.user_id
    WHERE st.id = ?
  `).get(threadId);
  if (!thread) throw new NotFoundError('Звернення не знайдено');
  return thread;
}

function listMessages(threadId) {
  return db.prepare(`
    SELECT id, sender_role, body, email_sent, created_at
    FROM support_messages WHERE thread_id = ? ORDER BY id
  `).all(threadId).map(message => ({ ...message, email_sent: !!message.email_sent }));
}

export function createThread(userId, input = {}) {
  const subject = cleanText(input.subject, 160, 'Тема').replace(/[\r\n]+/g, ' ');
  const body = cleanText(input.body, 5000, 'Повідомлення');
  const result = db.transaction(() => {
    const thread = db.prepare(`
      INSERT INTO support_threads (user_id, subject) VALUES (?, ?)
    `).run(userId, subject);
    db.prepare(`
      INSERT INTO support_messages (thread_id, sender_role, body) VALUES (?, 'user', ?)
    `).run(thread.lastInsertRowid, body);
    return thread.lastInsertRowid;
  })();
  return getUserThread(userId, result);
}

export function listUserThreads(userId) {
  return db.prepare(`
    SELECT st.id, st.subject, st.status, st.unread_user, st.created_at, st.updated_at,
      (SELECT body FROM support_messages sm WHERE sm.thread_id = st.id ORDER BY sm.id DESC LIMIT 1) AS last_message
    FROM support_threads st WHERE st.user_id = ? ORDER BY st.updated_at DESC
  `).all(userId).map(thread => ({ ...thread, unread_user: !!thread.unread_user }));
}

export function getUserThread(userId, threadId) {
  const thread = threadForUser(threadId, userId);
  db.prepare('UPDATE support_threads SET unread_user = 0 WHERE id = ?').run(threadId);
  return { thread, messages: listMessages(threadId) };
}

export async function replyAsUser(userId, threadId, input = {}) {
  const thread = threadForUser(threadId, userId);
  const body = cleanText(input.body, 5000, 'Повідомлення');
  db.transaction(() => {
    db.prepare(`
      INSERT INTO support_messages (thread_id, sender_role, body) VALUES (?, 'user', ?)
    `).run(threadId, body);
    db.prepare(`
      UPDATE support_threads
      SET status = 'open', unread_owner = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(threadId);
  })();
  return getUserThread(userId, thread.id);
}

export function listOwnerThreads({ status = '' } = {}) {
  if (status && !['open', 'waiting', 'closed'].includes(status)) {
    throw new ValidationError('Некоректний статус звернення');
  }
  const filter = status ? 'WHERE st.status = ?' : '';
  const threads = db.prepare(`
    SELECT st.id, st.subject, st.status, st.unread_owner, st.created_at, st.updated_at,
      u.name AS user_name, u.email AS user_email, u.handle AS user_handle,
      (SELECT body FROM support_messages sm WHERE sm.thread_id = st.id ORDER BY sm.id DESC LIMIT 1) AS last_message
    FROM support_threads st JOIN users u ON u.id = st.user_id
    ${filter}
    ORDER BY st.unread_owner DESC, st.updated_at DESC
  `).all(...(status ? [status] : []));
  return threads.map(thread => ({ ...thread, unread_owner: !!thread.unread_owner }));
}

export function getOwnerThread(threadId) {
  db.prepare('UPDATE support_threads SET unread_owner = 0 WHERE id = ?').run(threadId);
  return { thread: threadForOwner(threadId), messages: listMessages(threadId) };
}

export async function replyAsOwner(threadId, bodyInput) {
  const thread = threadForOwner(threadId);
  const body = cleanText(bodyInput, 5000, 'Відповідь');
  const messageId = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO support_messages (thread_id, sender_role, body) VALUES (?, 'owner', ?)
    `).run(threadId, body);
    db.prepare(`
      UPDATE support_threads
      SET status = 'waiting', unread_user = 1, unread_owner = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(threadId);
    return result.lastInsertRowid;
  })();

  const delivery = mailService.isMailConfigured()
    ? await mailService.sendMail({
      to: thread.user_email,
      subject: `Відповідь: ${thread.subject}`,
      text: body,
      html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(body)}</div>`,
    })
    : { sent: false, reason: 'no-smtp' };
  if (delivery.sent) {
    db.prepare('UPDATE support_messages SET email_sent = 1 WHERE id = ?').run(messageId);
  }
  return {
    ...getOwnerThread(threadId),
    emailDelivery: delivery.sent ? { sent: true } : { sent: false, reason: delivery.reason },
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function setThreadStatus(threadId, status) {
  if (!['open', 'waiting', 'closed'].includes(status)) {
    throw new ValidationError('Некоректний статус звернення');
  }
  const result = db.prepare(`
    UPDATE support_threads SET status = ?, unread_owner = 0, updated_at = datetime('now') WHERE id = ?
  `).run(status, threadId);
  if (!result.changes) throw new NotFoundError('Звернення не знайдено');
  return threadForOwner(threadId);
}

export function listTemplates() {
  return db.prepare('SELECT id, title, body FROM support_templates WHERE is_active = 1 ORDER BY id').all();
}

export function createTemplate(input = {}) {
  const title = cleanText(input.title, 100, 'Назва шаблону');
  const body = cleanText(input.body, 5000, 'Текст шаблону');
  const result = db.prepare('INSERT INTO support_templates (title, body) VALUES (?, ?)').run(title, body);
  return db.prepare('SELECT id, title, body FROM support_templates WHERE id = ?').get(result.lastInsertRowid);
}

export function removeTemplate(templateId) {
  const result = db.prepare('UPDATE support_templates SET is_active = 0 WHERE id = ?').run(templateId);
  if (!result.changes) throw new NotFoundError('Шаблон не знайдено');
  return { ok: true };
}

export function getOwnerInboxSummary() {
  return db.prepare(`
    SELECT COUNT(*) AS open_count,
      SUM(unread_owner = 1) AS unread_count
    FROM support_threads WHERE status != 'closed'
  `).get();
}
