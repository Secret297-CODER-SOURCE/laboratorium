import { initTheme as startThemes, getAccentColor } from '/theme-engine.js';
import { isAdminUser } from '/roles.js';

const TOKEN_KEY = 'lab_token';
const USER_KEY = 'lab_user';

export { isAdminUser };

/** Сторінки без авторизації */
export const PUBLIC_PAGES = [
  '/',
  '/index.html',
  '/login.html',
  '/forgot-password.html',
  '/reset-password.html',
  '/register.html',
];

export function isPublicPage(path = window.location.pathname) {
  const normalized = !path || path === '/' ? '/' : path;
  if (normalized === '/' || normalized === '/index.html') return true;
  return PUBLIC_PAGES.some(p => path === p || path.endsWith(p));
}

export function isMarketingHome(path = window.location.pathname) {
  const normalized = !path || path === '/' ? '/' : path;
  return normalized === '/' || normalized === '/index.html';
}

/** @deprecated Використовуйте requireAuth() на закритих сторінках */
export function guardSite() {
  if (isPublicPage()) return true;
  if (!isLoggedIn()) {
    const next = window.location.pathname + window.location.search;
    window.location.replace('/login.html?next=' + encodeURIComponent(next));
    return false;
  }
  return true;
}

export function logout() {
  clearSession();
  window.location.href = '/';
}

export function isAuthError(err) {
  return err?.status === 401;
}

export function isPaymentError(err) {
  return err?.status === 402 && err?.code === 'PAYMENT_REQUIRED';
}

export function redirectToLogin() {
  if (window.location.pathname.endsWith('/login.html')) return;
  const next = window.location.pathname + window.location.search;
  const target = isMarketingHome()
    ? '/login.html'
    : '/login.html?next=' + encodeURIComponent(next);
  window.location.replace(target);
}

/** Скидає сесію лише при 401; інші помилки не викидають на login */
export function handleSessionError(err) {
  if (isPaymentError(err) || err?.authRedirect === false) return;
  if (!isAuthError(err)) return;
  clearSession();
  redirectToLogin();
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

/** Перевіряє токен на сервері; оновлює профіль або очищає прострочену сесію */
export async function validateSession() {
  const token = getToken();
  if (!token) return false;
  try {
    const data = await api('/auth/me');
    if (data?.user) {
      setSession(token, data.user);
      return true;
    }
  } catch (err) {
    if (isAuthError(err)) clearSession();
  }
  return false;
}

export async function requireAuthAsync() {
  if (!getToken()) {
    redirectToLogin();
    return false;
  }
  if (await validateSession()) return true;
  redirectToLogin();
  return false;
}

export function getSiteHome() {
  return '/portal.html';
}

/** Куди вести після входу: кабінет для учнів, адмінка для staff */
export function getHomeForRole(role) {
  if (role === 'owner' || role === 'developer') return '/admin.html';
  if (role === 'teacher') return '/admin.html';
  return '/dashboard.html';
}

/** Після логіну не повертаємо на маркетингові сторінки — лише в кабінет/адмінку */
export function resolveLoginRedirect(next, role) {
  const home = getHomeForRole(role);
  if (!next) return home;
  try {
    const path = new URL(next, window.location.origin).pathname;
    if (isMarketingHome(path) || path === '/login.html' || path === '/register.html') return home;
    return next;
  } catch {
    return home;
  }
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    let msg = data.error || 'Помилка запиту';
    if (res.status === 401 && (path.startsWith('/auth/forgot') || path.startsWith('/auth/reset'))) {
      msg = 'Сервер застарілий або не запущений. У терміналі: cd /Users/worker/websites/laboratorium && npm run restart';
    } else if (res.status === 401 && (msg.includes('Требуется') || msg.includes('авторизац'))) {
      msg = 'Запустіть актуальний сервер: npm run restart у папці laboratorium';
    } else if (res.status === 402 && data.code === 'PAYMENT_REQUIRED' && !path.startsWith('/billing/status')) {
      if (!isPublicPage() && !window.location.pathname.endsWith('/payment-blocked.html')) {
        window.location.replace('/payment-blocked.html');
      }
      const payErr = new Error(msg);
      payErr.status = 402;
      payErr.code = data.code;
      payErr.authRedirect = false;
      throw payErr;
    }
    const err = new Error(msg);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/** Перевірка що працює новий сервер (для login / forgot-password) */
export async function checkServerReady() {
  try {
    const res = await fetch('/api/auth/status');
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok && data.publicAuth;
  } catch {
    return false;
  }
}

export function requireAuth() {
  if (!isLoggedIn()) {
    redirectToLogin();
    return false;
  }
  return true;
}

export function updateNavAuth() {
  const slot = document.getElementById('auth-nav');
  if (!slot) return;

  const user = getUser();
  const logo = document.querySelector('a.logo');
  const marketingHome = isMarketingHome();
  if (user) {
    const isAdmin = isAdminUser(user);
    const home = getHomeForRole(user.role);
    const onAdminPage = window.location.pathname.endsWith('/admin.html');
    if (logo) logo.setAttribute('href', marketingHome ? '/' : getSiteHome());
    const adminHtml = isAdmin && !onAdminPage
      ? '<a href="/admin.html" class="btn btn--ghost btn--sm nav-admin-link">Адмін</a>'
      : '';
    const pts = (user.bounty_points ?? 0).toLocaleString('uk-UA');
    slot.innerHTML = `
      ${adminHtml}
      <a href="${home}" class="btn btn--outline btn--sm nav-user" title="@${user.handle} · ${pts} pts">
        <span class="nav-handle">@${user.handle}</span>
        <span class="nav-pts"><span class="nav-pts-val">${pts}</span> pts</span>
      </a>
    `;
  } else {
    if (logo) logo.setAttribute('href', '/');
    slot.innerHTML = `
      <a href="/login.html" class="btn btn--ghost btn--sm nav-login-btn">Увійти</a>
    `;
  }
}

export function initTheme() {
  startThemes();
}

export { getAccentColor };

export function initBurger() {
  const burger = document.querySelector('.burger');
  const navLinks = document.querySelector('.nav-links');
  if (!burger || !navLinks) return;

  let mobileMenu = document.querySelector('.mobile-menu');
  if (!mobileMenu) {
    mobileMenu = document.createElement('nav');
    mobileMenu.className = 'mobile-menu';
    document.body.appendChild(mobileMenu);
  }

  mobileMenu.innerHTML = navLinks.innerHTML;
  const authClone = document.getElementById('auth-nav')?.cloneNode(true);
  if (authClone) {
    authClone.id = 'auth-nav-mobile';
    mobileMenu.appendChild(authClone);
  }

  if (!burger.dataset.bound) {
    burger.dataset.bound = '1';
    burger.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
    });
  }

  mobileMenu.querySelectorAll('a').forEach(link => {
    if (link.dataset.bound) return;
    link.dataset.bound = '1';
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });
}
