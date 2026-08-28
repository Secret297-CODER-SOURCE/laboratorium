import { api, requireAuthAsync, initTheme } from '/auth.js';
import { renderPage } from '/content-render.js';
import { initSiteHeader } from '/site-header.js';

initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });

if (!(await requireAuthAsync())) throw new Error('auth');

const params = new URLSearchParams(location.search);
const targetType = params.get('type');
const targetId = parseInt(params.get('id'), 10);
const draft = params.get('draft') === '1';

if (!['direction', 'group', 'program'].includes(targetType) || !targetId) {
  location.href = '/dashboard.html';
}

async function load() {
  const qs = draft ? '?draft=1' : '';
  const { page, meta } = await api(`/content/${targetType}/${targetId}${qs}`);
  document.title = `${page.title || meta.name} — laboratorium.`;
  document.getElementById('content-view').innerHTML = renderPage(page);
}

load().catch((err) => {
  document.getElementById('content-view').innerHTML = `<p class="empty-state" style="padding:80px 20px;text-align:center">${err.message}</p>`;
});
