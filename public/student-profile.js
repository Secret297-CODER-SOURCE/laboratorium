import { api, getUser, requireAuthAsync, handleSessionError, initTheme } from '/auth.js';
import { icon } from '/icons.js';
import { initSiteHeader } from '/site-header.js';
import { renderAchievementCard } from '/achievement-cards.js';

if (!(await requireAuthAsync())) throw new Error('auth');
initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });

const params = new URLSearchParams(location.search);
const handle = params.get('handle');
const loading = document.getElementById('profile-loading');
const error = document.getElementById('profile-error');
const article = document.getElementById('student-profile');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderProfile(profile) {
  const currentUser = getUser();
  const isOwnProfile = profile.isOwnProfile === true
    || (currentUser?.role === 'student' && currentUser.handle === profile.handle);
  const joined = profile.joinedAt
    ? new Date(`${profile.joinedAt.replace(' ', 'T')}Z`).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
    : '';
  document.title = `${profile.name} (@${profile.handle}) — laboratorium.`;
  const categoryLabels = {
    osint: 'OSINT', web: 'Web', network: 'Network', pwn: 'Pwn',
    crypto: 'Crypto', forensics: 'Forensics', reverse: 'Reverse', misc: 'Інше',
  };
  const awardsHtml = profile.awards.length
    ? `<div class="student-profile-award-grid">${profile.awards.map(award => `
        <div class="student-profile-award-wrap">
          ${renderAchievementCard(award)}
          ${isOwnProfile && profile.hiddenAwards?.includes(award.id) ? '<span class="student-profile-hidden-label">Не показується іншим</span>' : ''}
        </div>`).join('')}</div>`
    : '<p class="empty-state">Нагороди з’являться тут у міру навчального прогресу.</p>';
  article.innerHTML = `
    <section class="student-profile-hero">
      <div class="student-profile-identity">
        <div class="student-profile-avatar" aria-hidden="true">${escapeHtml(profile.name.trim().charAt(0).toUpperCase() || '?')}</div>
        <div class="student-profile-heading">
          <span class="section-tag">// учнівський профіль</span>
          <h1>${escapeHtml(profile.name)}</h1>
          <p class="student-profile-handle">@${escapeHtml(profile.handle)}</p>
          <span class="tier-badge">${escapeHtml(profile.tier)}</span>
        </div>
      </div>
      <div class="student-profile-score">
        <span class="student-profile-score-value">${Number(profile.points).toLocaleString('uk-UA')}</span>
        <span>bounty points</span>
        <span class="student-profile-rank">#${Number(profile.rank)} у рейтингу</span>
      </div>
      ${isOwnProfile ? '<a class="btn btn--primary btn--sm student-profile-invite" href="/dashboard.html#student-referral-panel">Запросити друга</a>' : ''}
      ${profile.bio ? `<p class="student-profile-bio">${escapeHtml(profile.bio)}</p>` : ''}
      ${joined ? `<p class="student-profile-joined">У спільноті з ${escapeHtml(joined)}</p>` : ''}
    </section>
    <section class="student-profile-stats" aria-label="Навчальний прогрес">
      <div class="student-profile-stat"><strong>${Number(profile.stats.completedTasks)}</strong><span>Завершено завдань</span></div>
      <div class="student-profile-stat"><strong>${Number(profile.stats.completedChallenges)}</strong><span>Пройдено challenges</span></div>
      <div class="student-profile-stat"><strong>${Number(profile.stats.passedQuizzes)}</strong><span>Складено тестів</span></div>
    </section>
    <section class="student-profile-awards">
      <div class="student-profile-section-head">
        <span class="section-tag">// досягнення</span>
        <h2>Нагороди та прогрес</h2>
      </div>
      ${awardsHtml}
    </section>`;
  article.insertAdjacentHTML('beforeend', `
    <section class="student-profile-section">
      <div class="student-profile-section-head">
        <span class="section-tag">// навички за напрямами</span>
        <h2>Практичний прогрес</h2>
      </div>
      ${profile.skillsByDirection?.length ? `<div class="student-profile-skill-grid">${profile.skillsByDirection.map((skill) => `
        <article class="student-profile-skill">
          <h3>${escapeHtml(skill.direction)}</h3>
          ${skill.completedTasks ? `<p>${Number(skill.completedTasks)} зарахованих практичних завдань</p>` : ''}
          <div class="student-profile-skill-tags">
            ${Object.entries(skill.ctfCategories || {}).map(([category, count]) => `
              <span class="student-profile-skill-tag">${escapeHtml(categoryLabels[category] || category)} · ${Number(count)} CTF</span>`).join('')}
          </div>
          ${!skill.completedTasks && !Object.keys(skill.ctfCategories || {}).length ? '<p>Підтверджених практичних робіт поки немає.</p>' : ''}
        </article>`).join('')}</div>` : '<p class="empty-state">Підтверджені практичні результати з’являться після виконання завдань.</p>'}
    </section>
    <section class="student-profile-section">
      <div class="student-profile-section-head">
        <span class="section-tag">// CTF</span>
        <h2>Пройдені завдання</h2>
      </div>
      ${profile.completedCtf?.length ? `<div class="student-profile-ctf-list">${profile.completedCtf.map((challenge) => `
        <article class="student-profile-ctf-item">
          <div><h3>${escapeHtml(challenge.title)}</h3>
            <p>${escapeHtml(categoryLabels[challenge.category] || challenge.category || 'CTF')}
              ${challenge.direction_name || challenge.program_name ? ` · ${escapeHtml(challenge.direction_name || challenge.program_name)}` : ''}</p>
          </div>
          <time>${escapeHtml(new Date(`${challenge.completed_at.replace(' ', 'T')}Z`).toLocaleDateString('uk-UA'))}</time>
        </article>`).join('')}</div>` : '<p class="empty-state">Завершені CTF-завдання з’являться тут.</p>'}
    </section>
    ${profile.sharedSolutions?.length ? `<section class="student-profile-section">
      <div class="student-profile-section-head">
        <span class="section-tag">// дозволені автором роботи</span>
        <h2>Як виконані завдання</h2>
        <p class="student-profile-section-note">Показуються лише роботи, якими учень дозволив поділитися.</p>
      </div>
      <div class="student-profile-solutions">${profile.sharedSolutions.map((solution) => `
        <article class="student-profile-solution">
          <h3>${escapeHtml(solution.title)}</h3>
          <time>${solution.completedAt ? escapeHtml(new Date(`${solution.completedAt.replace(' ', 'T')}Z`).toLocaleDateString('uk-UA')) : ''}</time>
          ${solution.note ? `<p>${escapeHtml(solution.note).replace(/\n/g, '<br>')}</p>` : ''}
          ${(solution.files || []).map((file) => `<a class="btn btn--outline btn--sm" href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer">${icon('notes', 'ico ico--sm')}${escapeHtml(file.name)}</a>`).join('')}
        </article>`).join('')}</div>
    </section>` : ''}
  `);
  loading.hidden = true;
  article.hidden = false;
}

async function loadProfile() {
  if (!handle || !/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
    throw new Error('Профіль не знайдено або він прихований власником.');
  }
  const { profile } = await api(`/students/${encodeURIComponent(handle)}/profile`);
  renderProfile(profile);
}

loadProfile().catch((err) => {
  loading.hidden = true;
  error.textContent = err.message === 'Профіль не знайдено'
    ? 'Цей профіль не знайдено або власник приховав його.'
    : err.message || 'Не вдалося завантажити профіль.';
  error.hidden = false;
});
