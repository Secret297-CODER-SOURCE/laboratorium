import { updateNavAuth, initBurger, clearSession } from '/auth.js';
import { LOGO_SVG, renderLogo } from '/logo.js';
import { renderAppNavLinks, setAppNavActive, refreshAppNav } from '/app-nav.js';
import { t, renderLangSwitch, bindLangSwitch } from '/i18n.js';
import { icon } from '/icons.js';
import { initNotificationBell } from '/notifications.js';

export { LOGO_SVG, renderLogo, setAppNavActive, refreshAppNav };

const MAIN_LINKS = [
  { anchor: 'about', label: 'Про школу' },
  { anchor: 'programs', label: 'Програми' },
  { anchor: 'bounty', label: 'Bounty' },
  { anchor: 'faq', label: 'FAQ' },
  { anchor: 'contact', label: 'Контакти' },
];

const TYPE_LABELS = {
  program: 'Програма',
  direction: 'Напрямок',
  manual: 'Мануал',
  'spy-soft': 'spy-soft',
  digitalocean: 'DigitalOcean',
};

export function renderMainNavLinks({ hashAnchors = false } = {}) {
  const prefix = hashAnchors ? '#' : '/#';
  return `<ul class="nav-links">
    ${MAIN_LINKS.map((l) => `<li><a href="${prefix}${l.anchor}">${t(l.label)}</a></li>`).join('')}
  </ul>`;
}

function shortcutHint() {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '');
  return mac ? '⌘K' : 'Ctrl K';
}

function renderSearchBlock() {
  return `<div class="site-search site-search--collapsible" id="site-search">
      <button type="button" class="site-search-toggle" id="site-search-toggle"
        aria-expanded="false" aria-controls="site-search-panel" title="${t('Пошук')} (${shortcutHint()})">
        ${icon('search', 'ico ico--sm')}
        <span class="site-search-toggle__label">${t('Пошук')}</span>
        <kbd class="site-search-toggle__kbd" aria-hidden="true">${shortcutHint()}</kbd>
      </button>
      <div class="site-search-panel" id="site-search-panel" hidden>
        <span class="site-search-panel__icon" aria-hidden="true">${icon('search', 'ico ico--sm')}</span>
        <label class="visually-hidden" for="site-search-input">${t('Пошук')}</label>
        <input type="search" id="site-search-input" class="site-search-input"
          placeholder="${t('Шукати програми, мануали…')}" autocomplete="off" maxlength="80" enterkeyhint="search">
        <button type="button" class="site-search-close" id="site-search-close"
          title="${t('Згорнути')}" aria-label="${t('Згорнути')}">
          ${icon('x', 'ico ico--sm')}
        </button>
        <div class="site-search-results" id="site-search-results" hidden role="listbox"></div>
      </div>
    </div>`;
}

/**
 * @param {object} opts
 * @param {string} [opts.logoHref]
 * @param {boolean} [opts.showEnroll]
 * @param {boolean} [opts.showLogout]
 * @param {string} [opts.extraActions]
 * @param {boolean} [opts.hashAnchors]
 * @param {'marketing'|'app'} [opts.navMode]
 * @param {boolean} [opts.showSearch] — default: only app pages (never marketing landing)
 * @param {string} [opts.activePath]
 */
export function renderSiteHeader({
  logoHref = '/portal.html',
  showEnroll = false,
  showLogout = false,
  hashAnchors = false,
  extraActions = '',
  navMode = 'marketing',
  showSearch,
  activePath = '',
} = {}) {
  const navBlock = navMode === 'app'
    ? renderAppNavLinks({ activePath })
    : renderMainNavLinks({ hashAnchors });

  // Landing / marketing: no site search. App cabinets: collapsible search.
  const searchEnabled = showSearch === undefined ? navMode === 'app' : Boolean(showSearch);
  const searchBlock = searchEnabled ? renderSearchBlock() : '';

  return `<nav class="nav container${navMode === 'app' ? ' nav--app' : ''}">
    ${renderLogo(logoHref)}
    ${navBlock}
    <div class="nav-actions">
      ${searchBlock}
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

function bindSiteSearch(root) {
  const wrap = root.querySelector('#site-search');
  const input = root.querySelector('#site-search-input');
  const box = root.querySelector('#site-search-results');
  const toggle = root.querySelector('#site-search-toggle');
  const panel = root.querySelector('#site-search-panel');
  const closeBtn = root.querySelector('#site-search-close');
  if (!wrap || !input || !box || input.dataset.bound) return;
  input.dataset.bound = '1';
  let timer = null;
  let lastQ = '';
  let activeIndex = -1;

  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const items = () => [...box.querySelectorAll('.site-search-item')];

  const setActive = (idx) => {
    const list = items();
    activeIndex = idx;
    list.forEach((el, i) => el.classList.toggle('is-active', i === idx));
    if (idx >= 0 && list[idx]) list[idx].scrollIntoView({ block: 'nearest' });
  };

  const hideResults = () => {
    box.hidden = true;
    box.innerHTML = '';
    activeIndex = -1;
  };

  const collapse = () => {
    if (!panel || !toggle) return;
    panel.hidden = true;
    wrap.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    hideResults();
    input.value = '';
    lastQ = '';
  };

  const expand = () => {
    if (!panel || !toggle) return;
    panel.hidden = false;
    wrap.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => input.focus());
  };

  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrap.classList.contains('is-open')) collapse();
    else expand();
  });
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    collapse();
  });

  const render = (payload) => {
    const results = payload?.results || [];
    if (!results.length) {
      box.innerHTML = `<div class="site-search-empty">
        <span class="site-search-empty__title">${t('Нічого не знайдено')}</span>
        <span class="site-search-empty__hint">${t('Спробуйте інший запит')}</span>
      </div>`;
      box.hidden = false;
      activeIndex = -1;
      return;
    }
    box.innerHTML = results.map((r) => {
      const ext = r.external ? ' target="_blank" rel="noopener noreferrer"' : '';
      const typeKey = r.type || '';
      const typeLabel = TYPE_LABELS[typeKey] || typeKey;
      return `
      <a class="site-search-item${r.external ? ' site-search-item--external' : ''}" role="option" href="${esc(r.href)}"${ext}>
        <span class="site-search-item__type">${esc(t(typeLabel) || typeLabel)}</span>
        <strong class="site-search-item__title">${esc(r.title)}</strong>
        <span class="site-search-item__sub">${esc(r.subtitle || '')}</span>
      </a>`;
    }).join('');
    box.hidden = false;
    activeIndex = -1;
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) {
      hideResults();
      return;
    }
    timer = setTimeout(async () => {
      if (q === lastQ) return;
      lastQ = q;
      box.innerHTML = `<div class="site-search-empty site-search-empty--loading">${t('Шукаємо…')}</div>`;
      box.hidden = false;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('search failed');
        if (input.value.trim() !== q) return;
        render(await res.json());
      } catch {
        box.innerHTML = `<div class="site-search-empty">${t('Помилка пошуку')}</div>`;
        box.hidden = false;
      }
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    const list = items();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!box.hidden && list.length) hideResults();
      else collapse();
      return;
    }
    if (e.key === 'ArrowDown' && list.length) {
      e.preventDefault();
      setActive(activeIndex < list.length - 1 ? activeIndex + 1 : 0);
    } else if (e.key === 'ArrowUp' && list.length) {
      e.preventDefault();
      setActive(activeIndex > 0 ? activeIndex - 1 : list.length - 1);
    } else if (e.key === 'Enter' && activeIndex >= 0 && list[activeIndex]) {
      e.preventDefault();
      list[activeIndex].click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target) && wrap.classList.contains('is-open')) collapse();
  });

  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
    if (!document.body.contains(wrap)) return;
    e.preventDefault();
    if (wrap.classList.contains('is-open')) {
      input.focus();
    } else {
      expand();
    }
  });
}

export function initSiteHeader(options = {}) {
  const el = document.getElementById('site-header');
  if (!el) return;
  const mount = () => {
    el.innerHTML = renderSiteHeader(options);
    updateNavAuth();
    initBurger();
    bindLangSwitch(document);
    bindSiteSearch(el);
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
  };

  mount();
  window.addEventListener('localechange', mount);
}
