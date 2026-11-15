import { request } from 'undici';
import * as settings from './settings.service.js';

const API = 'https://api.telegram.org';

export function getTelegramConfig() {
  return settings.getTelegramConfig();
}

async function call(method, payload = {}) {
  const cfg = getTelegramConfig();
  if (!cfg.botToken) return { ok: false, error: 'no-token' };
  const url = `${API}/bot${cfg.botToken}/${method}`;
  const res = await request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.body.json();
  if (!data.ok) {
    return { ok: false, error: data.description || 'telegram-error', data };
  }
  return { ok: true, result: data.result };
}

export async function sendMessage(chatId, text, extra = {}) {
  return call('sendMessage', {
    chat_id: chatId,
    text: String(text || '').slice(0, 4000),
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function getUpdates(offset, timeout = 25) {
  return call('getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message', 'callback_query'],
  });
}

export async function answerCallbackQuery(id, text = '') {
  return call('answerCallbackQuery', { callback_query_id: id, text });
}
