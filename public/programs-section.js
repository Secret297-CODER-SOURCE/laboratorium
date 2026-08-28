import { api, isLoggedIn } from '/auth.js';
import { icon } from '/icons.js';

let directionsData = [];

const DIR_ACCENTS = {
  cybersecurity: '#00e5ff',
  cpp: '#4da6ff',
  python: '#00ff88',
  csharp: '#b44dff',
  sysadmin: '#ffaa00',
  offensive: '#ff3344',
  defensive: '#4da6ff',
  development: '#00ff88',
  reverse: '#b44dff',
  web: '#ffaa00',
};

const DIR_ICONS = {
  cybersecurity: 'shield',
  cpp: 'code',
  python: 'code',
  csharp: 'grid',
  sysadmin: 'server',
  offensive: 'shield',
  defensive: 'server',
  development: 'code',
  reverse: 'code',
  web: 'grid',
};

function dirAccent(dir) {
  return DIR_ACCENTS[dir?.slug] || 'var(--accent)';
}

function dirIcon(dir) {
  return DIR_ICONS[dir?.slug] || 'book';
}

function levelClass(level) {
  const l = String(level || '').toLowerCase();
  if (l.includes('advanced')) return 'program-level--hard';
  if (l.includes('intermediate')) return 'program-level--mid';
  return 'program-level--easy';
}

function renderProgramCard(p, dir) {
  const tags = (p.tags || []).map(t => `<li>${t}</li>`).join('');
  const accent = dirAccent(dir);
  const featured = p.is_featured ? '<span class="program-badge">Популярне</span>' : '';
  const ctaHref = isLoggedIn() ? '/dashboard.html' : '/login.html';
  const ctaLabel = isLoggedIn() ? 'Записатися' : 'Увійти та записатися';

  return `<article class="program-card${p.is_featured ? ' program-card--featured' : ''}" style="--prog-accent:${accent}">
    <div class="program-card-glow" aria-hidden="true"></div>
    <div class="program-card-top">
      <div class="program-icon">${icon(dirIcon(dir), 'ico ico--lg')}</div>
      <div class="program-meta-badges">
        ${featured}
        <span class="program-level ${levelClass(p.level)}">${p.level}</span>
      </div>
    </div>
    <h3>${p.name}</h3>
    <p>${p.description || ''}</p>
    <ul class="program-tags">${tags}</ul>
    ${p.has_content ? `<a href="/content.html?type=program&id=${p.id}" class="program-details-link">Детальніше про курс →</a>` : ''}
    <div class="program-footer">
      <div class="program-meta">
        <span class="program-duration">${icon('calendar', 'ico ico--sm')}${p.duration}</span>
        <span class="program-bounty">${icon('chart', 'ico ico--sm')}+${p.bounty_reward} bounty</span>
      </div>
      <a href="${ctaHref}" class="btn btn--outline btn--sm program-cta">${ctaLabel}</a>
    </div>
  </article>`;
}

function renderPrograms(directionId) {
  const grid = document.getElementById('programs-grid');
  if (!grid) return;
  const dir = directionsData.find(d => d.id === directionId);
  const programs = dir?.programs || [];
  if (!programs.length) {
    grid.innerHTML = '<p class="empty-state">Програми для цього напрямку ще не додані</p>';
    return;
  }
  grid.innerHTML = programs.map(p => renderProgramCard(p, dir)).join('');
  grid.querySelectorAll('.program-card').forEach(el => {
    el.classList.add('reveal');
    new IntersectionObserver(([e]) => { if (e.isIntersecting) e.target.classList.add('visible'); }, { threshold: 0.15 }).observe(el);
  });
}

function updateTrackIndicator(activeBtn) {
  const indicator = document.getElementById('track-switch-indicator');
  const slider = document.getElementById('direction-slider');
  if (!indicator || !slider || !activeBtn) return;

  const sliderRect = slider.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const accent = activeBtn.style.getPropertyValue('--dir-accent') || 'var(--accent)';

  indicator.style.width = `${btnRect.width}px`;
  indicator.style.height = `${btnRect.height}px`;
  indicator.style.transform = `translate(${btnRect.left - sliderRect.left}px, ${btnRect.top - sliderRect.top}px)`;
  indicator.style.borderColor = `color-mix(in srgb, ${accent} 45%, var(--border))`;
  indicator.style.background = `linear-gradient(135deg, color-mix(in srgb, ${accent} 18%, transparent), var(--bg-card))`;
  indicator.style.boxShadow = `0 0 28px color-mix(in srgb, ${accent} 25%, transparent)`;
}

function selectDirection(id) {
  let activeBtn = null;
  document.querySelectorAll('.track-switch-btn').forEach(btn => {
    const active = parseInt(btn.dataset.id, 10) === id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) activeBtn = btn;
  });

  const dir = directionsData.find(d => d.id === id);
  const hint = document.getElementById('direction-active-hint');
  if (hint && dir) hint.textContent = dir.description || '';

  requestAnimationFrame(() => updateTrackIndicator(activeBtn));
  renderPrograms(id);
  window.__showDirectionContentLink?.(id);
}

export async function initProgramsSection() {
  const slider = document.getElementById('direction-slider');
  const contactSelect = document.getElementById('contact-direction');
  if (!slider) return;

  try {
    const { directions } = await api('/directions');
    directionsData = directions || [];
    if (!directionsData.length) {
      slider.innerHTML = '<p class="empty-state">Напрямки скоро з\'являться</p>';
      return;
    }

    slider.innerHTML = `<div class="track-switch-indicator" id="track-switch-indicator" aria-hidden="true"></div>`
      + directionsData.map((d, i) => `
      <button type="button" class="track-switch-btn${i === 0 ? ' active' : ''}" role="tab"
        data-id="${d.id}" data-slug="${d.slug}" aria-selected="${i === 0 ? 'true' : 'false'}"
        style="--dir-accent:${dirAccent(d)}">
        <span class="track-switch-btn-icon">${icon(dirIcon(d), 'ico ico--sm')}</span>
        <span class="track-switch-btn-label">${d.name}</span>
      </button>
    `).join('');

    const hint = document.getElementById('direction-active-hint');
    if (hint && directionsData[0]) hint.textContent = directionsData[0].description || '';

    const contentLinks = document.getElementById('direction-content-links');
    if (contentLinks) {
      contentLinks.innerHTML = directionsData.map(d => d.has_content ? `
        <a href="/content.html?type=direction&id=${d.id}" class="direction-content-link" data-dir="${d.id}" hidden>
          Детальніше про напрямок →
        </a>` : '').join('');
      const showLink = (dirId) => {
        contentLinks.querySelectorAll('.direction-content-link').forEach(a => {
          a.hidden = parseInt(a.dataset.dir, 10) !== dirId;
        });
      };
      window.__showDirectionContentLink = showLink;
      showLink(directionsData[0].id);
    }

    slider.querySelectorAll('.track-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => selectDirection(parseInt(btn.dataset.id, 10)));
    });

    if (contactSelect) {
      contactSelect.innerHTML = '<option value="" disabled selected>Оберіть напрямок</option>'
        + directionsData.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    }

    const statNums = document.querySelectorAll('.stat-num[data-count]');
    if (statNums[0]) statNums[0].dataset.count = String(directionsData.length);

    selectDirection(directionsData[0].id);

    window.addEventListener('resize', () => {
      const active = slider.querySelector('.track-switch-btn.active');
      if (active) updateTrackIndicator(active);
    });
  } catch {
    const grid = document.getElementById('programs-grid');
    if (grid) grid.innerHTML = '<p class="empty-state">Не вдалося завантажити програми</p>';
  }
}
