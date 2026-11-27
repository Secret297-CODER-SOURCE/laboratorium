import { getUser, initBurger } from '/auth.js';
import { icon } from '/icons.js';
import { isAdminUser, isRestrictedUser } from '/roles.js';
import { canAccessTab, pageAllowed } from '/tab-access.js';
import { t } from '/i18n.js';

const ADMIN_LINKS = [
  { href: '/portal.html', label: 'Головна', icon: 'home' },
  { href: '/admin.html', label: 'Панель', icon: 'grid', roles: ['teacher', 'owner', 'developer'] },
  { href: '/dashboard.html', label: 'Кабінет', icon: 'book', roles: ['teacher', 'owner', 'developer', 'student'] },
  { href: '/dashboard.html?tab=lab', label: 'Інструменти', icon: 'shield', tab: 'lab' },
  { href: '/manuals.html', label: 'Мануали', icon: 'notes' },
  { href: '/conferences.html', label: 'Конференції', icon: 'calendar' },
  { href: '/recordings.html', label: 'Записи', icon: 'video' },
  { href: '/groups-chat.html', label: 'Чати', icon: 'chat', roles: ['student', 'teacher', 'owner', 'developer'] },
];

const STUDENT_LINKS = [
  { href: '/portal.html', label: 'Головна', icon: 'home' },
  { href: '/dashboard.html', label: 'Кабінет', icon: 'book' },
  { href: '/dashboard.html?tab=lab', label: 'Інструменти', icon: 'shield', tab: 'lab' },
  { href: '/manuals.html', label: 'Мануали', icon: 'notes' },
  { href: '/conferences.html', label: 'Конференції', icon: 'calendar' },
  { href: '/recordings.html', label: 'Записи', icon: 'video' },
  { href: '/groups-chat.html', label: 'Чати', icon: 'chat' },
];

const MOBILE_PRIMARY = ['/portal.html', '/dashboard.html', '/dashboard.html?tab=lab', '/groups-chat.html', '/conferences.html'];

function linkAllowed(href) {
  if (!href || href === '/portal.html' || href === '/admin.html') return true;
  if (href === '/dashboard.html') return canAccessTab('dash.home');
  if (href.startsWith('/dashboard.html?tab=lab')) return canAccessTab('dash.lab');
  if (href === '/conferences.html') return pageAllowed('page.conferences');
  if (href === '/recordings.html') return pageAllowed('page.recordings');
  if (href === '/groups-chat.html') return pageAllowed('page.groups_chat');
  return true;
}

function linkIsActive(link, path, search) {
  const hrefPath = link.href.split('?')[0];
  if (link.tab === 'lab') {
    return path === '/dashboard.html' && new URLSearchParams(search).get('tab') === 'lab';
  }
  if (hrefPath === '/dashboard.html') {
    return path === '/dashboard.html' && new URLSearchParams(search).get('tab') !== 'lab';
  }
  return path === hrefPath;
}

export function getAppNavLinks(user = getUser()) {
  if (isRestrictedUser(user)) {
    return STUDENT_LINKS.filter(link => link.href === '/dashboard.html');
  }
  const role = user?.role || 'student';
  const pool = isAdminUser(user) ? ADMIN_LINKS : STUDENT_LINKS;
  return pool.filter(link => {
    if (link.roles && !link.roles.includes(role)) return false;
    if (role === 'student' && link.href === '/admin.html') return false;
    return linkAllowed(link.href);
  });
}

function ensureNavIndicator(list) {
  let indicator = list.querySelector('.app-nav-indicator');
  if (!indicator) {
    indicator = document.createElement('li');
    indicator.className = 'app-nav-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    list.prepend(indicator);
  }
  return indicator;
}

export function moveNavIndicatorTo(list, target, { instant = false } = {}) {
  if (!list) return;
  const indicator = ensureNavIndicator(list);
  if (!target) {
    indicator.style.opacity = '0';
    return;
  }
  const listRect = list.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const x = rect.left - listRect.left + list.scrollLeft - list.clientLeft;
  const y = rect.top - listRect.top + list.scrollTop - list.clientTop;
  if (instant) indicator.classList.add('is-instant');
  indicator.style.width = `${Math.round(rect.width)}px`;
  indicator.style.height = `${Math.round(rect.height)}px`;
  indicator.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  indicator.style.opacity = '1';
  if (instant) {
    requestAnimationFrame(() => indicator.classList.remove('is-instant'));
  }
}

export function moveNavIndicator(list, activeSelector = '.app-nav-link.active') {
  if (!list) return;
  moveNavIndicatorTo(list, list.querySelector(activeSelector));
}

function bindNavIndicatorHover(list) {
  if (!list || list.dataset.indicatorBound === '1') return;
  list.dataset.indicatorBound = '1';
  list.addEventListener('pointerover', (e) => {
    const link = e.target.closest('.app-nav-link');
    if (link && list.contains(link)) moveNavIndicatorTo(list, link);
  });
  list.addEventListener('pointerleave', () => moveNavIndicator(list));
  list.addEventListener('focusin', (e) => {
    const link = e.target.closest('.app-nav-link');
    if (link) moveNavIndicatorTo(list, link);
  });
  list.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!list.contains(document.activeElement)) moveNavIndicator(list);
    });
  });
  list.addEventListener('scroll', () => moveNavIndicator(list), { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => moveNavIndicator(list)).observe(list);
  }
}

export function syncAppNavIndicator(root = document) {
  root.querySelectorAll('.app-nav-links').forEach((list) => {
    bindNavIndicatorHover(list);
    moveNavIndicatorTo(list, list.querySelector('.app-nav-link.active'), { instant: true });
  });
}

export function renderAppNavLinks({ activePath = '', user = getUser() } = {}) {
  const path = activePath || (typeof location !== 'undefined' ? location.pathname : '');
  const search = typeof location !== 'undefined' ? location.search : '';
  const links = getAppNavLinks(user);
  return `<ul class="nav-links app-nav-links">
    <li class="app-nav-indicator" aria-hidden="true"></li>
    ${links.map(link => {
      const active = linkIsActive(link, path, search) ? ' active' : '';
      return `<li><a href="${link.href}" class="app-nav-link${active}">${icon(link.icon, 'ico ico--sm')}<span class="app-nav-label">${t(link.label)}</span></a></li>`;
    }).join('')}
  </ul>`;
}

export function renderAppBottomNav({ activePath = '', user = getUser() } = {}) {
  if (typeof document === 'undefined') return;
  const path = activePath || location.pathname;
  const search = location.search;
  const links = getAppNavLinks(user);
  const primary = links.filter((l) => MOBILE_PRIMARY.includes(l.href)).slice(0, 5);
  const rest = links.filter((l) => !MOBILE_PRIMARY.includes(l.href));
  let bar = document.getElementById('app-bottom-nav');
  if (!bar) {
    bar = document.createElement('nav');
    bar.id = 'app-bottom-nav';
    bar.className = 'app-bottom-nav';
    bar.setAttribute('aria-label', t('Основна навігація'));
    document.body.appendChild(bar);
  }
  bar.innerHTML = primary.map((link) => {
    const active = linkIsActive(link, path, search) ? ' active' : '';
    return `<a href="${link.href}" class="app-bottom-nav__item${active}">${icon(link.icon, 'ico ico--sm')}<span>${t(link.label)}</span></a>`;
  }).join('') + (rest.length
    ? `<button type="button" class="app-bottom-nav__item app-bottom-nav__more" data-open-menu>
        ${icon('grid', 'ico ico--sm')}<span>${t('Ще')}</span>
      </button>`
    : '');
  bar.querySelector('[data-open-menu]')?.addEventListener('click', () => {
    document.querySelector('.burger')?.click();
  });
}

export function setAppNavActive(activePath = location.pathname) {
  const search = location.search;
  document.querySelectorAll('.app-nav-links .app-nav-link').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const tab = href.includes('tab=lab') ? 'lab' : undefined;
    a.classList.toggle('active', linkIsActive({ href, tab }, activePath, search));
  });
  syncAppNavIndicator();
}

export function refreshAppNav({ activePath = '', user = getUser() } = {}) {
  const nav = document.querySelector('.nav--app');
  if (!nav) return;
  const oldLinks = nav.querySelector('.nav-links');
  if (!oldLinks) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = renderAppNavLinks({ activePath: activePath || location.pathname, user });
  oldLinks.replaceWith(wrap.firstElementChild);
  initBurger();
  requestAnimationFrame(() => syncAppNavIndicator());
}
