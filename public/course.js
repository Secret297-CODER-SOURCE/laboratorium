import { api, isLoggedIn } from '/auth.js';
import { icon } from '/icons.js';
import { initSiteHeader } from '/site-header.js';
import { renderPage } from '/content-render.js';
import { dirAccent, dirIcon, levelSegments } from '/programs-section.js';
import { initI18n, t } from '/i18n.js';

initI18n();

initSiteHeader({
  logoHref: '/',
  hashAnchors: true,
  showEnroll: !isLoggedIn(),
  showLogout: isLoggedIn(),
  navMode: 'marketing',
});

const params = new URLSearchParams(location.search);
const programId = parseInt(params.get('id'), 10);
const root = document.getElementById('course-view');

function levelMeterHtml(level) {
  const segs = levelSegments(level);
  return `<span class="course-level" title="${t('Рівень: {level}', { level })}">
    ${[1, 2, 3].map(n => `<span class="course-level-seg${n <= segs ? ' is-on' : ''}"></span>`).join('')}
  </span>`;
}

function renderNotFound() {
  root.innerHTML = `
    <div class="course-hero course-hero--empty">
      <div class="container course-hero-inner">
        <span class="section-tag">${t('404 / ціль втрачена')}</span>
        <h1 class="course-title">${t('Курс не знайдено')}</h1>
        <p class="course-lede">${t('Такої програми немає або її зняли з набору.')}</p>
        <a href="/#programs" class="btn btn--primary btn--sm">${icon('chevron-left', 'ico ico--sm')}${t('Усі програми')}</a>
      </div>
    </div>`;
}

async function load() {
  if (!programId) return renderNotFound();

  let data;
  try {
    data = await api(`/programs/${programId}/page`);
  } catch {
    return renderNotFound();
  }

  const { program: p, direction: dir, page } = data;
  document.title = `${p.name} — laboratorium.`;

  const accent = dirAccent(dir);
  const ctaHref = isLoggedIn() ? '/dashboard.html' : '/login.html';
  const ctaLabel = isLoggedIn() ? t('Записатися на курс') : t('Увійти та записатися');
  const tags = p.tags || [];

  root.innerHTML = `
    <header class="course-hero" style="--prog-accent:${accent}">
      <div class="container course-hero-inner">
        <a href="/#programs" class="course-back">${icon('chevron-left', 'ico ico--sm')}${t('Усі програми')}</a>
        <div class="course-hero-top">
          <div class="course-icon">${icon(dirIcon(dir), 'ico ico--lg')}</div>
          <div>
            <p class="course-eyebrow">${dir ? dir.name : t('Програма курсу')} · TGT://${p.slug}</p>
            <h1 class="course-title">${p.name}</h1>
          </div>
        </div>
        ${p.description ? `<p class="course-lede">${p.description}</p>` : ''}
        <div class="course-stats">
          <div class="course-stat">
            <span class="course-stat-label">${t('Рівень')}</span>
            <span class="course-stat-value">${levelMeterHtml(p.level)}${p.level}</span>
          </div>
          <div class="course-stat">
            <span class="course-stat-label">${t('Тривалість')}</span>
            <span class="course-stat-value ico-inline">${icon('calendar', 'ico ico--sm')}${p.duration}</span>
          </div>
          <div class="course-stat">
            <span class="course-stat-label">Bounty</span>
            <span class="course-stat-value ico-inline">${icon('chart', 'ico ico--sm')}+${p.bounty_reward}</span>
          </div>
        </div>
        ${tags.length ? `
          <div class="course-arsenal">
            <span class="dossier-arsenal-label">${t('Арсенал')}</span>
            <ul>${tags.map(tag => `<li>${tag}</li>`).join('')}</ul>
          </div>` : ''}
        <div class="course-actions">
          <a href="${ctaHref}" class="btn btn--primary">${ctaLabel}</a>
        </div>
      </div>
    </header>
    ${page ? `<div class="container course-content">${renderPage(page, { hero: false })}</div>` : `
      <div class="container course-content course-content--empty">
        <p class="empty-state">${t('Детальна програма курсу готується — слідкуйте за оновленнями.')}</p>
      </div>`}
  `;
}

load();

window.addEventListener('localechange', load);
