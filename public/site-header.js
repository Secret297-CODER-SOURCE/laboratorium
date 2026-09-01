import { updateNavAuth, initBurger, clearSession } from '/auth.js';
import { LOGO_SVG, renderLogo } from '/logo.js';
import { renderAppNavLinks, setAppNavActive, refreshAppNav } from '/app-nav.js';
import { t, renderLangSwitch, bindLangSwitch } from '/i18n.js';
import { initNotificationBell } from '/notifications.js';

export { LOGO_SVG, renderLogo, setAppNavActive, refreshAppNav };

const MAIN_LINKS = [
  { anchor: 'about', label: 'Про школу' },
  { anchor: 'programs', label: 'Програми' },
  { anchor: 'bounty', label: 'Bounty' },
  { anchor: 'contact', label: 'Контакти' },
];

export function renderMainNavLinks({ hashAnchors = false } = {}) {
  const prefix = hashAnchors ? '#' : '/#';
  return `<ul class="nav-links">
    ${MAIN_LINKS.map(l => `<li><a href="${prefix}${l.anchor}">${t(l.label)}</a></li>`).join('')}
  </ul>`;
}

/**
 * @param {object} opts
 * @param {string} [opts.logoHref]
 * @param {boolean} [opts.showEnroll]
 * @param {boolean} [opts.showLogout]
 * @param {string} [opts.extraActions]
 * @param {boolean} [opts.hashAnchors]
 * @param {'marketing'|'app'} [opts.navMode]
 * @param {string} [opts.activePath]
 */
export function renderSiteHeader({
  logoHref = '/portal.html',
  showEnroll = false,
  showLogout = false,
  hashAnchors = false,
  extraActions = '',
  navMode = 'marketing',
  activePath = '',
} = {}) {
  const navBlock = navMode === 'app'
    ? renderAppNavLinks({ activePath })
    : renderMainNavLinks({ hashAnchors });

  return `<nav class="nav container${navMode === 'app' ? ' nav--app' : ''}">
    ${renderLogo(logoHref)}
    ${navBlock}
    <div class="nav-actions">
      <span class="nav-extra-slot">${extraActions}</span>
      ${navMode === 'app' ? '<span id="notif-bell-mount"></span>' : ''}
      ${renderLangSwitch()}
      <div id="auth-nav" class="auth-nav"></div>
      ${showEnroll ? `<a href="${hashAnchors ? '#contact' : '/#contact'}" class="btn btn--outline btn--sm hide-mobile nav-enroll-btn">${t('Записатися')}</a>` : '<span class="nav-enroll-slot hide-mobile" aria-hidden="true"></span>'}
      ${showLogout
    ? `<button type="button" id="logout-btn" class="btn btn--ghost btn--sm ico-inline nav-logout-btn" data-nav-icon="logout">${t('Вийти')}</button>`
    : '<span class="nav-logout-slot" aria-hidden="true"></span>'}
      <button type="button" class="burger" aria-label="${t('Меню')}" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>`;
}

export function initSiteHeader(options = {}) {
  const el = document.getElementById('site-header');
  if (!el) return;
  el.innerHTML = renderSiteHeader(options);
  updateNavAuth();
  initBurger();
  bindLangSwitch(document);
  el.classList.add('is-ready');

  const notifMount = document.getElementById('notif-bell-mount');
  if (notifMount) initNotificationBell(notifMount);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', () => {
      clearSession();
      window.location.href = '/';
    });
  }

  window.addEventListener('localechange', () => {
    el.innerHTML = renderSiteHeader(options);
    updateNavAuth();
    initBurger();
    bindLangSwitch(document);
    const btn = document.getElementById('logout-btn');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        clearSession();
        window.location.href = '/';
      });
    }
  });
}
