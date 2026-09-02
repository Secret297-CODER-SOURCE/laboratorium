import nodemailer from 'nodemailer';
import config from '../config/index.js';
import * as settings from './settings.service.js';

let transporter = null;
let transporterKey = '';

function transportFingerprint(c) {
  return `${c.host}|${c.port}|${c.secure}|${c.user}|${c.pass}|${c.from}`;
}

function getTransporter() {
  const c = settings.getSmtpConfig();
  if (!c.host) {
    transporter = null;
    transporterKey = '';
    return null;
  }
  const key = transportFingerprint(c);
  if (transporter && transporterKey === key) return transporter;

  transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure || c.port === 465,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
  });
  transporterKey = key;
  return transporter;
}

export function resetTransporter() {
  transporter = null;
  transporterKey = '';
}

export function isMailConfigured() {
  return !!settings.getSmtpConfig().host;
}

/**
 * Never throws — a broken/unconfigured mail relay must not block the action
 * that triggered it (account creation, password reset). Callers check
 * `.sent` and fall back to showing the credential in the admin UI directly,
 * so delivery never silently depends on SMTP actually working.
 */
export async function sendMail({ to, subject, html, text }) {
  const transport = getTransporter();
  const from = settings.getSmtpConfig().from || config.smtp.from;

  if (!transport) {
    console.log(`[mail] (no SMTP configured) To: ${to}\nSubject: ${subject}\n${text || html}`);
    return { sent: false, reason: 'no-smtp' };
  }

  try {
    await transport.sendMail({
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    return { sent: true };
  } catch (err) {
    console.error(`[mail] send failed to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

export async function testSmtp(to) {
  const transport = getTransporter();
  if (!transport) return { ok: false, reason: 'no-smtp' };
  try {
    await transport.verify();
    if (to) {
      const result = await sendMail({
        to,
        subject: 'Тест SMTP — laboratorium.',
        text: 'Якщо ви бачите цей лист, SMTP налаштовано правильно.',
        html: '<p>Якщо ви бачите цей лист, SMTP налаштовано правильно.</p>',
      });
      if (!result.sent) return { ok: false, reason: result.reason };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export async function sendPasswordResetEmail(user, resetUrl) {
  return sendMail({
    to: user.email,
    subject: 'Скидання пароля — laboratorium.',
    html: `
      <p>Вітаємо, ${user.name}!</p>
      <p>Натисніть посилання, щоб встановити новий пароль (діє 24 год):</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>Якщо ви не запитували скидання — проігноруйте цей лист.</p>
    `,
    text: `Скидання пароля laboratorium.\n\nПерейдіть за посиланням: ${resetUrl}`,
  });
}

export async function sendWelcomeCredentialsEmail(user, password) {
  return sendMail({
    to: user.email,
    subject: 'Доступ до laboratorium. — особистий кабінет',
    html: `
      <p>Вітаємо, ${user.name}!</p>
      <p>Вам надано доступ до особистого кабінету <strong>laboratorium.</strong></p>
      <p><strong>Email:</strong> ${user.email}<br>
      <strong>Пароль:</strong> ${password}</p>
      <p><a href="${config.appUrl}/login.html">Увійти в кабінет</a></p>
      <p>Рекомендуємо змінити пароль після першого входу.</p>
    `,
    text: `Доступ до laboratorium.\nEmail: ${user.email}\nПароль: ${password}\nВхід: ${config.appUrl}/login.html`,
  });
}
