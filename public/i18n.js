// Lightweight runtime i18n. Ukrainian is the source language and lives directly
// in the code/markup as the lookup key, so untranslated strings degrade safely
// to Ukrainian instead of breaking. Adding a language = adding one dictionary file.

import { en } from '/i18n-en.js';
import { ru } from '/i18n-ru.js';

export const LOCALES = [
  { code: 'uk', label: 'UA', name: 'Українська' },
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'ru', label: 'RU', name: 'Русский' },
];

const STORAGE_KEY = 'lab_locale';
const DEFAULT_LOCALE = 'uk';
const SUPPORTED = LOCALES.map(l => l.code);

const DICTS = { en, ru };

export function registerStrings(locale, entries) {
  if (!DICTS[locale]) DICTS[locale] = {};
  Object.assign(DICTS[locale], entries);
}

function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch { /* localStorage unavailable */ }
  return DEFAULT_LOCALE;
}

let currentLocale = detectLocale();

export function getLocale() {
  return currentLocale;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), str);
}

/**
 * Translate a Ukrainian source string. Falls back to the Ukrainian source
 * itself if no translation exists for the current locale yet.
 */
export function t(source, vars) {
  if (currentLocale === DEFAULT_LOCALE) return interpolate(source, vars);
  const dict = DICTS[currentLocale];
  const translated = dict && dict[source];
  return interpolate(translated || source, vars);
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  // Rich elements (inline markup like <br>/<span>): key is a short slug,
  // not the Ukrainian source. Original markup is cached and restored for 'uk'.
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    if (el.dataset.i18nOrig === undefined) el.dataset.i18nOrig = el.innerHTML;
    const dict = DICTS[currentLocale];
    const html = dict && dict[el.dataset.i18nHtml];
    el.innerHTML = html || el.dataset.i18nOrig;
  });
}

export function setLocale(locale) {
  if (!SUPPORTED.includes(locale) || locale === currentLocale) return;
  currentLocale = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* ignore */ }
  document.documentElement.lang = locale;
  applyTranslations();
  window.dispatchEvent(new CustomEvent('localechange', { detail: { locale } }));
}

export function renderLangSwitch() {
  return `<select class="lang-switch" id="lang-switch" aria-label="Мова / Language / Язык">
    ${LOCALES.map(l => `<option value="${l.code}"${l.code === currentLocale ? ' selected' : ''}>${l.label}</option>`).join('')}
  </select>`;
}

export function bindLangSwitch(root = document) {
  const el = root.getElementById ? root.getElementById('lang-switch') : root.querySelector('#lang-switch');
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.value = currentLocale;
  el.addEventListener('change', () => setLocale(el.value));
}

export function initI18n() {
  document.documentElement.lang = currentLocale;
  applyTranslations();
}
