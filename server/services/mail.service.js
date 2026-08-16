import nodemailer from 'nodemailer';
import config from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host) return null;

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

export function isMailConfigured() {
  return !!config.smtp.host;
}

export async function sendMail({ to, subject, html, text }) {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[mail] (dev, no SMTP) To: ${to}\nSubject: ${subject}\n${text || html}`);
    return { dev: true, preview: text || html };
  }

  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  });
  return { sent: true };
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
