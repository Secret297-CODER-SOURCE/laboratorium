import { api, requireAuthAsync, handleSessionError, initTheme } from '/auth.js';
import { icon } from '/icons.js';
import { initSiteHeader } from '/site-header.js';
import { renderPage } from '/content-render.js';

if (!(await requireAuthAsync())) throw new Error('auth');

initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });

const params = new URLSearchParams(location.search);
const slug = params.get('slug');
const root = document.getElementById('manual-view');

function renderNotFound() {
  root.innerHTML = `
    <div class="course-hero course-hero--empty">
      <div class="container course-hero-inner">
        <span class="section-tag">404 / ціль втрачена</span>
        <h1 class="course-title">Мануал не знайдено</h1>
        <p class="course-lede">Такого мануала немає або його ще не опублікували.</p>
        <a href="/manuals.html" class="btn btn--primary btn--sm">${icon('chevron-left', 'ico ico--sm')}Усі мануали</a>
      </div>
    </div>`;
}

async function load() {
  if (!slug) return renderNotFound();

  let data;
  try {
    data = await api(`/manuals/${encodeURIComponent(slug)}`);
  } catch {
    return renderNotFound();
  }

  const { manual, page } = data;
  document.title = `${manual.title} — laboratorium.`;

  root.innerHTML = `
    <header class="course-hero">
      <div class="container course-hero-inner">
        <a href="/manuals.html" class="course-back">${icon('chevron-left', 'ico ico--sm')}Усі мануали</a>
        <div class="course-hero-top">
          <div class="course-icon">${icon('notes', 'ico ico--lg')}</div>
          <div>
            ${manual.direction_name ? `<p class="course-eyebrow">${manual.direction_name}</p>` : ''}
            <h1 class="course-title">${manual.title}</h1>
          </div>
        </div>
      </div>
    </header>
    ${page ? `<div class="container course-content">${renderPage(page, { hero: false })}</div>` : `
      <div class="container course-content course-content--empty">
        <p class="empty-state">Вміст цього мануала ще готується.</p>
      </div>`}
  `;
}

load().catch(handleSessionError);
