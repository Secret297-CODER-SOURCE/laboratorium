import { api, getUser, requireAuthAsync, initTheme } from '/auth.js';
import { icon } from '/icons.js';
import { initSiteHeader } from '/site-header.js';
import { renderAchievementCard } from '/achievement-cards.js';
import { showAlert } from '/dialog.js';

if (!(await requireAuthAsync())) throw new Error('auth');
initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });

const params = new URLSearchParams(location.search);
const handle = params.get('handle');
const loading = document.getElementById('profile-loading');
const error = document.getElementById('profile-error');
const article = document.getElementById('student-profile');

let profileCache = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderActions(profile) {
  if (profile.isOwnProfile) {
    return `<div class="student-profile-actions">
      <a class="btn btn--primary btn--sm" href="/dashboard.html#student-referral-panel">${icon('users', 'ico ico--sm')}Запросити друга</a>
      <a class="btn btn--outline btn--sm" href="/dashboard.html">${icon('edit', 'ico ico--sm')}Редагувати профіль</a>
      <span class="student-profile-follow-meta">${Number(profile.followerCount || 0)} підписників · ${Number(profile.followingCount || 0)} підписок</span>
    </div>`;
  }

  const followLabel = profile.isFollowing ? 'Відписатися' : 'Підписатися';
  const followClass = profile.isFollowing ? 'btn btn--outline btn--sm' : 'btn btn--primary btn--sm';
  const followIcon = profile.isFollowing ? 'check' : 'plus';
  const msgDisabled = !profile.canMessage;
  const msgTitle = msgDisabled
    ? 'Написати можна після підписки або якщо ви в одній групі'
    : `Написати @${profile.handle}`;

  return `<div class="student-profile-actions">
    <button type="button" class="${followClass}" id="profile-follow-btn" aria-pressed="${profile.isFollowing ? 'true' : 'false'}">
      ${icon(followIcon, 'ico ico--sm')}${followLabel}
    </button>
    <button type="button" class="btn btn--outline btn--sm" id="profile-dm-btn"
      ${msgDisabled ? 'disabled' : ''} title="${escapeHtml(msgTitle)}">
      ${icon('chat', 'ico ico--sm')}Написати
    </button>
    <span class="student-profile-follow-meta" id="profile-follow-meta">
      ${Number(profile.followerCount || 0)} підписників · ${Number(profile.followingCount || 0)} підписок
    </span>
  </div>`;
}

function renderProfile(profile) {
  profileCache = profile;
  const joined = profile.joinedAt
    ? new Date(`${profile.joinedAt.replace(' ', 'T')}Z`).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
    : '';
  document.title = `${profile.name} (@${profile.handle}) — laboratorium.`;
  const categoryLabels = {
    osint: 'OSINT', web: 'Web', network: 'Network', pwn: 'Pwn',
    crypto: 'Crypto', forensics: 'Forensics', reverse: 'Reverse', misc: 'Інше',
  };
  const awardsHtml = profile.awards.length
    ? `<div class="student-profile-award-grid">${profile.awards.map((award) => `
        <div class="student-profile-award-wrap">
          ${renderAchievementCard(award)}
          ${profile.isOwnProfile && profile.hiddenAwards?.includes(award.id) ? '<span class="student-profile-hidden-label">Не показується іншим</span>' : ''}
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
      ${renderActions(profile)}
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

  bindProfileActions();
  loading.hidden = true;
  article.hidden = false;
}

function bindProfileActions() {
  const followBtn = document.getElementById('profile-follow-btn');
  followBtn?.addEventListener('click', async () => {
    if (!profileCache) return;
    followBtn.disabled = true;
    try {
      const method = profileCache.isFollowing ? 'DELETE' : 'POST';
      await api(`/students/${encodeURIComponent(profileCache.handle)}/follow`, { method });
      const { profile } = await api(`/students/${encodeURIComponent(profileCache.handle)}/profile`);
      renderProfile(profile);
    } catch (err) {
      await showAlert(err.message || 'Не вдалося змінити підписку');
      followBtn.disabled = false;
    }
  });

  document.getElementById('profile-dm-btn')?.addEventListener('click', async () => {
    if (!profileCache?.id) return;
    if (!profileCache.canMessage) {
      await showAlert('Спочатку підпишіться або переконайтесь, що ви в одній навчальній групі.');
      return;
    }
    window.location.href = `/groups-chat.html?dm=${profileCache.id}`;
  });
}

async function loadProfile() {
  if (!handle || !/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
    throw new Error('Профіль не знайдено або він прихований власником.');
  }
  const me = getUser();
  if (me?.handle && me.handle.toLowerCase() === handle.toLowerCase() && me.role !== 'student') {
    // teachers/owners may not have student profile — still try API
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
