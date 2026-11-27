import { TelegramClient, Api } from 'teleproto';
import { sendCode, signInWithPassword } from 'teleproto/client/auth';
import { StringSession } from 'teleproto/sessions';
import { NewMessage } from 'teleproto/events';
import * as settings from './settings.service.js';
import { ValidationError } from '../utils/errors.js';

let client = null;
let starting = null;
let updateHandler = null;
let loginState = null;

function publicErr(err) {
  const msg = String(err?.errorMessage || err?.message || 'telegram-error');
  if (/PHONE_NUMBER/i.test(msg)) return 'Невірний номер телефону';
  if (/PHONE_CODE_INVALID/i.test(msg)) return 'Невірний код з Telegram';
  if (/PHONE_CODE_EXPIRED/i.test(msg)) return 'Код прострочено — надішліть новий';
  if (/PASSWORD_HASH_INVALID|PASSWORD_MISSING/i.test(msg)) return 'Невірний пароль 2FA';
  if (/SESSION_PASSWORD_NEEDED/i.test(msg)) return 'Потрібен пароль 2FA';
  if (/SESSION_REVOKED|AUTH_KEY_UNREGISTERED/i.test(msg)) return 'Сесію відкликано — увійдіть знову';
  if (/FLOOD|WAIT/i.test(msg)) return 'Telegram просить зачекати. Спробуйте пізніше';
  if (/API_ID|API_HASH/i.test(msg)) return 'Невірні API ID або API Hash';
  return 'Помилка Telegram. Перевірте дані й спробуйте ще раз';
}

function needsPassword(err) {
  const msg = String(err?.errorMessage || err?.message || err?.name || '');
  return /SESSION_PASSWORD_NEEDED/i.test(msg) || /SessionPasswordNeeded/i.test(msg);
}

export function setUpdateHandler(fn) {
  updateHandler = fn;
}

export function getTelegramConfig() {
  return settings.getTelegramConfig();
}

function makeClient(sessionString = '') {
  const cfg = settings.getTelegramConfig();
  if (!cfg.apiId || !cfg.apiHash) {
    throw new ValidationError('Спочатку збережіть API ID і API Hash');
  }
  return new TelegramClient(new StringSession(sessionString || ''), cfg.apiId, cfg.apiHash, {
    connectionRetries: 5,
    autoReconnect: true,
  });
}

async function mapIncoming(event) {
  const message = event.message;
  if (!message) return null;
  const chat = await event.getChat().catch(() => null);
  const sender = await event.getSender().catch(() => null);
  const chatId = String(event.chatId || message.chatId || chat?.id || '');
  if (!chatId) return null;
  const isPrivate = !!event.isPrivate;
  return {
    message: {
      message_id: message.id,
      text: message.text || message.message || '',
      chat: {
        id: chatId,
        type: isPrivate ? 'private' : (event.isChannel ? 'channel' : 'group'),
        title: chat?.title || [chat?.firstName, chat?.lastName].filter(Boolean).join(' ') || null,
        username: chat?.username || null,
        first_name: chat?.firstName || null,
        last_name: chat?.lastName || null,
      },
      from: {
        id: sender?.id != null ? String(sender.id) : undefined,
        username: sender?.username || null,
        first_name: sender?.firstName || null,
      },
    },
  };
}

function attachHandlers(active) {
  active.addEventHandler(async (event) => {
    if (!updateHandler) return;
    try {
      const update = await mapIncoming(event);
      if (update) await updateHandler(update);
    } catch (err) {
      console.error('[telegram] update error:', err.message);
    }
  }, new NewMessage({ incoming: true }));
}

export async function disconnectClient() {
  const current = client;
  client = null;
  starting = null;
  if (!current) return;
  try {
    await current.disconnect();
  } catch {
    /* ignore */
  }
}

export async function ensureClient() {
  const cfg = settings.getTelegramConfig();
  if (!cfg.enabled || !cfg.apiId || !cfg.apiHash || !cfg.session) return null;
  if (client?.connected) return client;
  if (starting) return starting;
  starting = (async () => {
    const next = makeClient(cfg.session);
    await next.connect();
    const ok = await next.checkAuthorization().catch(() => false);
    if (!ok) {
      await next.disconnect().catch(() => {});
      throw new ValidationError('Сесія Telegram недійсна. Увійдіть знову');
    }
    attachHandlers(next);
    client = next;
    return next;
  })().finally(() => { starting = null; });
  return starting;
}

export async function startClient() {
  try {
    return await ensureClient();
  } catch (err) {
    console.error('[telegram] start:', err.message);
    return null;
  }
}

export async function restartClient() {
  await disconnectClient();
  return startClient();
}

export async function sendLoginCode(phone) {
  const raw = String(phone || '').replace(/[^\d+]/g, '');
  if (raw.length < 8) throw new ValidationError('Вкажіть номер у форматі +380…');
  const cfg = settings.getTelegramConfig();
  if (!cfg.apiId || !cfg.apiHash) {
    throw new ValidationError('Спочатку збережіть API ID і API Hash');
  }
  if (loginState?.client) {
    await loginState.client.disconnect().catch(() => {});
  }
  const pending = makeClient('');
  await pending.connect();
  try {
    const sent = await sendCode(
      pending,
      { apiId: cfg.apiId, apiHash: cfg.apiHash },
      raw,
    );
    loginState = {
      phone: raw,
      phoneCodeHash: sent.phoneCodeHash,
      client: pending,
      viaApp: !!sent.isCodeViaApp,
    };
    settings.saveTelegramSettings({ phone: raw });
    return {
      ok: true,
      viaApp: !!sent.isCodeViaApp,
      phoneMasked: settings.getTelegramSettingsPublic().phoneMasked,
    };
  } catch (err) {
    await pending.disconnect().catch(() => {});
    loginState = null;
    throw new ValidationError(publicErr(err));
  }
}

async function finishLogin(active) {
  const session = active.session.save();
  settings.saveTelegramSettings({ session, phone: loginState?.phone });
  if (loginState?.client && loginState.client !== active) {
    await loginState.client.disconnect().catch(() => {});
  }
  loginState = null;
  await disconnectClient();
  client = active;
  attachHandlers(active);
  return settings.getTelegramSettingsPublic();
}

export async function confirmLogin({ code, password } = {}) {
  if (!loginState?.client || !loginState.phoneCodeHash) {
    throw new ValidationError('Спочатку надішліть код на телефон');
  }
  const pending = loginState.client;
  const cfg = settings.getTelegramConfig();
  try {
    if (password) {
      await signInWithPassword(
        pending,
        { apiId: cfg.apiId, apiHash: cfg.apiHash },
        {
          password: async () => String(password),
          onError: async () => true,
        },
      );
    } else {
      const phoneCode = String(code || '').trim();
      if (!phoneCode) throw new ValidationError('Введіть код з Telegram');
      try {
        await pending.invoke(new Api.auth.SignIn({
          phoneNumber: loginState.phone,
          phoneCodeHash: loginState.phoneCodeHash,
          phoneCode,
        }));
      } catch (err) {
        if (needsPassword(err)) {
          return { ok: false, needsPassword: true, message: 'Увімкнено 2FA — введіть пароль' };
        }
        throw err;
      }
    }
    const publicSettings = await finishLogin(pending);
    return { ok: true, settings: publicSettings };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(publicErr(err));
  }
}

export async function logoutAccount() {
  try {
    const active = client || loginState?.client;
    if (active) await active.logOut?.().catch(() => {});
  } catch {
    /* ignore */
  }
  await disconnectClient();
  if (loginState?.client) {
    await loginState.client.disconnect().catch(() => {});
    loginState = null;
  }
  settings.saveTelegramSettings({ session: '' });
  return settings.getTelegramSettingsPublic();
}

function mapDialog(dialog) {
  const id = dialog.id != null ? String(dialog.id) : '';
  const entity = dialog.entity || {};
  const type = dialog.isUser ? 'private' : (dialog.isChannel && !dialog.isGroup ? 'channel' : 'group');
  return {
    id,
    title: dialog.title || dialog.name || entity.title || [entity.firstName, entity.lastName].filter(Boolean).join(' ') || id,
    type,
    username: entity.username || null,
  };
}

export async function listAccountDialogs() {
  const active = await ensureClient();
  if (!active) throw new ValidationError('Спочатку увійдіть у Telegram-акаунт');
  const dialogs = await active.getDialogs({ limit: 80, ignoreMigrated: true });
  return [...dialogs]
    .map(mapDialog)
    .filter((d) => d.id)
    .slice(0, 80);
}

export async function sendMessage(chatId, text) {
  const active = await ensureClient();
  if (!active) return { ok: false, error: 'no-session' };
  try {
    const msg = await active.sendMessage(String(chatId), {
      message: String(text || '').slice(0, 4000),
    });
    return { ok: true, result: { message_id: msg?.id } };
  } catch (err) {
    return { ok: false, error: publicErr(err) };
  }
}

export async function getUpdates() {
  return { ok: false, error: 'mtproto' };
}

export async function answerCallbackQuery() {
  return { ok: true };
}
