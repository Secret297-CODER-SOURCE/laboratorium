import * as userService from '../services/user.service.js';
import * as passwordService from '../services/password.service.js';
import { signToken } from '../middleware/auth.js';
import config from '../config/index.js';
import { ForbiddenError } from '../utils/errors.js';

export async function register(req, res) {
  if (!config.auth.allowPublicRegistration) {
    throw new ForbiddenError('Реєстрація закрита. Доступ надається після оплати.');
  }
  // No token/session here: the account's login+password are generated and
  // emailed, not chosen by the registrant, so there's nothing to log them
  // in with yet — they sign in themselves once they have that email.
  const { emailSent, mailReason } = await userService.register(req.body);
  res.status(201).json({
    ok: true,
    emailSent,
    mailReason,
    message: emailSent
      ? 'Реєстрацію прийнято! Перевірте пошту — ми надіслали логін і пароль для входу.'
      : 'Акаунт створено, але лист не надійшов. Зверніться до адміністрації, щоб отримати доступ.',
  });
}

export async function login(req, res) {
  const user = userService.login(req.body);
  const token = signToken(user);
  res.json({ token, user: userService.toPublic(user) });
}

export async function me(req, res) {
  const user = userService.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Користувача не знайдено' });
  res.json({ user: userService.toPublic(user) });
}

export async function forgotPassword(req, res) {
  const result = await passwordService.requestPasswordReset(req.body.email);
  res.json(result);
}

export async function resetPassword(req, res) {
  await passwordService.resetPassword(req.body.token, req.body.password);
  res.json({ ok: true, message: 'Пароль оновлено. Увійдіть з новим паролем.' });
}
