import { api, getUser, requireAuthAsync, handleSessionError, initTheme } from '/auth.js';
import { icon } from '/icons.js';
import { initSiteHeader } from '/site-header.js';
import { renderPage } from '/content-render.js';

if (!(await requireAuthAsync())) throw new Error('auth');

initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });

const params = new URLSearchParams(location.search);
const slug = params.get('slug');
const root = document.getElementById('manual-view');
const user = getUser();
let activeManualId = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

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
  activeManualId = manual.id;
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
    <section class="container manual-comments" aria-labelledby="manual-comments-title">
      <div class="manual-comments-head">
        <div>
          <span class="section-tag">// community</span>
          <h2 id="manual-comments-title">Обговорення мануала</h2>
        </div>
        <p>Залишайте запитання та корисні уточнення по темі.</p>
      </div>
      <div id="manual-comments-list" class="manual-comments-list" aria-live="polite"></div>
      <form id="manual-comment-form" class="manual-comment-form">
        <label for="manual-comment-input">Ваш коментар</label>
        <textarea id="manual-comment-input" name="body" maxlength="2000" rows="4" required placeholder="Поділіться запитанням або доповненням…"></textarea>
        <div class="manual-comment-submit">
          <span>До 2000 символів</span>
          <button class="btn btn--primary btn--sm" type="submit">Опублікувати</button>
        </div>
      </form>
    </section>
  `;
  await loadComments(manual.id);
}

function renderComments(comments, manualId) {
  const list = document.getElementById('manual-comments-list');
  if (!comments.length) {
    list.innerHTML = '<p class="manual-comments-empty">Поки немає коментарів — почніть обговорення.</p>';
    return;
  }
  list.innerHTML = comments.map((comment) => {
    const canDelete = comment.user_id === user?.id || ['owner', 'developer', 'teacher'].includes(user?.role);
    return `
      <article class="manual-comment">
        <div class="manual-comment-meta">
          <strong>${comment.handle ? `@${esc(comment.handle)}` : 'Видалений користувач'}</strong>
          <time datetime="${esc(comment.created_at)}">${new Date(`${comment.created_at}Z`).toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </div>
        <p>${esc(comment.body)}</p>
        ${canDelete ? `<button type="button" class="manual-comment-delete" data-comment-id="${comment.id}" aria-label="Видалити свій коментар">Видалити</button>` : ''}
      </article>`;
  }).join('');
  list.querySelectorAll('.manual-comment-delete').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api(`/manual-comments/${button.dataset.commentId}`, { method: 'DELETE' });
        await loadComments(manualId);
      } catch (error) {
        showCommentError(error.message);
      }
    });
  });
}

function showCommentError(message) {
  let notice = document.getElementById('manual-comment-error');
  if (!notice) {
    notice = document.createElement('p');
    notice.id = 'manual-comment-error';
    notice.className = 'manual-comment-error';
    document.getElementById('manual-comment-form')?.prepend(notice);
  }
  notice.textContent = message;
}

async function loadComments(manualId) {
  const list = document.getElementById('manual-comments-list');
  list.innerHTML = '<p class="manual-comments-empty">Завантаження обговорення…</p>';
  const { comments } = await api(`/manuals/${manualId}/comments`);
  renderComments(comments, manualId);
}

document.getElementById('manual-view').addEventListener('submit', async (event) => {
  if (event.target.id !== 'manual-comment-form') return;
  event.preventDefault();
  const input = document.getElementById('manual-comment-input');
  const button = event.target.querySelector('button[type="submit"]');
  const body = input.value.trim();
  if (!body || !activeManualId) return;
  button.disabled = true;
  try {
    await api(`/manuals/${activeManualId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    input.value = '';
    await loadComments(activeManualId);
  } catch (error) {
    showCommentError(error.message);
  } finally {
    button.disabled = false;
  }
});

load().catch(handleSessionError);
