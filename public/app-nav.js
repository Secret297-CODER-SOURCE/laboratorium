import { getUser } from '/auth.js';
import { icon } from '/icons.js';
import { isAdminUser } from '/roles.js';
import { canAccessTab, pageAllowed } from '/tab-access.js';
import { t } from '/i18n.js';

const ADMIN_LINKS = [
  { href: '/portal.html', label: 'Головна', icon: 'home' },
  { href: '/admin.html', label: 'Панель', icon: 'grid', roles: ['teacher', 'owner', 'developer'] },
  { href: '/dashboard.html', label: 'Кабінет', icon: 'book', roles: ['teacher', 'owner', 'developer', 'student'] },
  { href: '/conferences.html', label: 'Конференції', icon: 'calendar' },
  { href: '/recordings.html', label: 'Записи', icon: 'video' },
  { href: '/groups-chat.html', label: 'Чати', icon: 'chat', roles: ['student', 'teacher', 'owner', 'developer'] },
];

const STUDENT_LINKS = [
  { href: '/portal.html', label: 'Головна', icon: 'home' },
  { href: '/dashboard.html', label: 'Кабінет', icon: 'book' },
  { href: '/conferences.html', label: 'Конференції', icon: 'calendar' },
  { href: '/recordings.html', label: 'Записи', icon: 'video' },
  { href: '/groups-chat.html', label: 'Чати', icon: 'chat' },
];

function linkAllowed(href) {
  if (!href || href === '/portal.html' || href === '/admin.html') return true;
  if (href === '/dashboard.html') return canAccessTab('dash.home');
  if (href === '/conferences.html') return pageAllowed('page.conferences');
  if (href === '/recordings.html') return pageAllowed('page.recordings');
  if (href === '/groups-chat.html') return pageAllowed('page.groups_chat');
  return true;
}

export function getAppNavLinks(user = getUser()) {
  const role = user?.role || 'student';
  const pool = isAdminUser(user) ? ADMIN_LINKS : STUDENT_LINKS;
  return pool.filter(link => {
    if (link.roles && !link.roles.includes(role)) return false;
    if (role === 'student' && link.href === '/admin.html') return false;
    return linkAllowed(link.href);
  });
}

export function renderAppNavLinks({ activePath = '', user = getUser() } = {}) {
  const path = activePath || (typeof location !== 'undefined' ? location.pathname : '');
  const links = getAppNavLinks(user);
  return `<ul class="nav-links app-nav-links">
    ${links.map(link => {
      const active = path === link.href ? ' active' : '';
      return `<li><a href="${link.href}" class="app-nav-link${active}">${icon(link.icon, 'ico ico--sm')}${t(link.label)}</a></li>`;
    }).join('')}
  </ul>`;
}

export function setAppNavActive(activePath = location.pathname) {
  document.querySelectorAll('.app-nav-links .app-nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === activePath);
  });
}

export function refreshAppNav({ activePath = '', user = getUser() } = {}) {
  const nav = document.querySelector('.nav--app');
  if (!nav) return;
  const oldLinks = nav.querySelector('.nav-links');
  if (!oldLinks) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = renderAppNavLinks({ activePath: activePath || location.pathname, user });
  oldLinks.replaceWith(wrap.firstElementChild);
}
