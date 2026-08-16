import {
  api, getUser, clearSession, requireAuthAsync, handleSessionError, isAuthError, isPaymentError,
  initTheme,
} from '/auth.js';
import { isAdminUser } from '/roles.js';
import { icon, initNavIcons } from '/icons.js';
import { initSiteHeader, refreshAppNav } from '/site-header.js';
import { loadTabAccess, portalHrefAllowed, setAllowedTabs } from '/tab-access.js';

if (!(await requireAuthAsync())) throw new Error('auth');

initTheme();
initSiteHeader({ showLogout: true, navMode: 'app' });
initNavIcons();

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Доброго ранку';
  if (h < 18) return 'Доброго дня';
  return 'Доброго вечора';
}

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

function fmtConfTime(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtScheduleDate(iso) {
  const d = new Date(iso.includes('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('uk-UA', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function renderHero(data) {
  const { user, rank, tier, nextTier, stats } = data;

  document.getElementById('portal-greeting').textContent = greeting();
  document.getElementById('portal-name').textContent = user.name;
  document.getElementById('portal-handle').textContent = `@${user.handle}`;
  document.getElementById('portal-tier').textContent = user.tier;
  document.getElementById('portal-rank').textContent = `#${rank} у рейтингу`;

  document.getElementById('tier-current').textContent = tier.name;
  if (nextTier) {
    const remaining = nextTier.min - user.bounty_points;
    document.getElementById('tier-next-label').textContent = `до ${nextTier.name}: ${remaining} pts`;
    const range = nextTier.min - tier.min;
    const progress = ((user.bounty_points - tier.min) / range) * 100;
    document.getElementById('tier-progress').style.width = `${Math.min(100, progress)}%`;
  } else {
    document.getElementById('tier-next-label').textContent = 'максимальний ранг';
    document.getElementById('tier-progress').style.width = '100%';
  }

  const kpiEl = document.getElementById('portal-kpi');
  kpiEl.innerHTML = `
    <div class="portal-kpi-card">
      <span class="portal-kpi-val accent">${user.bounty_points.toLocaleString('uk-UA')}</span>
      <span class="portal-kpi-label">bounty pts</span>
    </div>
    <div class="portal-kpi-card">
      <span class="portal-kpi-val">${stats.tasks_in_progress + stats.tasks_available}</span>
      <span class="portal-kpi-label">активних задач</span>
    </div>
    <div class="portal-kpi-card">
      <span class="portal-kpi-val">${stats.challenges_completed}/${stats.challenges_total}</span>
      <span class="portal-kpi-label">challenges</span>
    </div>
    <div class="portal-kpi-card">
      <span class="portal-kpi-val">${stats.quizzes_available}</span>
      <span class="portal-kpi-label">тестів доступно</span>
    </div>
  `;
}

function renderActions(user) {
  const isAdmin = isAdminUser(user);
  const actions = [
    { href: '/dashboard.html', icon: 'home', title: 'Кабінет', desc: 'Задачі, профіль, програми' },
    { href: '/dashboard.html?tab=ctf', icon: 'shield', title: 'CTF', desc: 'Захоплення прапорів' },
    { href: '/dashboard.html?tab=tests', icon: 'notes', title: 'Тести', desc: 'Квізи та перевірка знань' },
    { href: '/dashboard.html?tab=lab', icon: 'server', title: 'Лабораторія', desc: 'VM та Docker' },
    { href: '/conferences.html', icon: 'video', title: 'Конференції', desc: 'Онлайн-заняття' },
    { href: '/groups-chat.html', icon: 'chat', title: 'Чати груп', desc: 'Спілкування з одногрупниками' },
  ];

  if (isAdmin) {
    actions.unshift({
      href: '/admin.html', icon: 'settings', title: 'Адмін', desc: 'Панель керування',
    });
  }

  const slice = actions.filter(a => portalHrefAllowed(a.href)).slice(0, isAdmin ? 6 : actions.length);
  document.getElementById('portal-actions').innerHTML = slice.map(a => `
    <a href="${a.href}" class="portal-action">
      <div class="portal-action-icon">${icon(a.icon, 'ico')}</div>
      <span class="portal-action-title">${esc(a.title)}</span>
      <span class="portal-action-desc">${esc(a.desc)}</span>
    </a>
  `).join('');
}

function renderPrograms(enrollments) {
  const el = document.getElementById('portal-programs');
  if (!enrollments.length) {
    el.innerHTML = '<p class="empty-state">Ще не записані на програму. <a href="/dashboard.html" class="ico-inline" style="color:var(--accent)">Записатися ' + icon('chevron-right', 'ico ico--sm') + '</a></p>';
    return;
  }
  el.innerHTML = enrollments.slice(0, 4).map(e => `
    <div class="portal-program">
      <strong>${esc(e.program_name || e.name)}</strong>
      <span>${esc(e.level || e.duration || '')}</span>
    </div>
  `).join('');
}

function renderActivity(bountyLog) {
  const el = document.getElementById('portal-activity');
  const recent = (bountyLog || []).slice(0, 5);
  if (!recent.length) {
    el.innerHTML = '<p class="empty-state">Поки немає активності. Виконайте перше завдання!</p>';
    return;
  }
  el.innerHTML = recent.map(entry => `
    <div class="portal-activity-item">
      <span class="portal-activity-pts">+${entry.points}</span>
      <div class="portal-activity-text">
        <strong>${esc(entry.reason)}</strong>
        <div>${new Date(entry.created_at + 'Z').toLocaleDateString('uk-UA')}</div>
      </div>
    </div>
  `).join('');
}

async function loadConferences() {
  const el = document.getElementById('portal-conferences');
  try {
    const { conferences } = await api('/conferences/upcoming');
    const list = (conferences || []).slice(0, 3);
    if (!list.length) {
      el.innerHTML = '<p class="empty-state">Немає запланованих конференцій</p>';
      return;
    }
    el.innerHTML = list.map(c => {
      const isLive = c.status === 'live';
      return `
        <div class="portal-item">
          <div class="portal-item-main">
            <strong>${esc(c.title)}</strong>
            <div class="portal-item-meta">${icon('clock', 'ico ico--sm')}${fmtConfTime(c.scheduled_at)} · ${c.duration_minutes} хв</div>
          </div>
          <a href="/room.html?id=${c.id}" class="btn ${isLive ? 'btn--primary' : 'btn--outline'} btn--sm">
            ${isLive ? 'LIVE' : 'Увійти'}
          </a>
        </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<p class="empty-state">Не вдалося завантажити</p>';
  }
}

async function loadSchedule() {
  const el = document.getElementById('portal-schedule');
  if (!el) return;
  el.innerHTML = '<p class="empty-state">Завантаження...</p>';
  try {
    const { lessons } = await api('/schedule');
    const upcoming = (lessons || []).filter(l => {
      const end = new Date(l.lesson_at);
      end.setMinutes(end.getMinutes() + (l.duration_minutes || 90));
      return end > new Date();
    }).slice(0, 4);

    if (!upcoming.length) {
      el.innerHTML = '<p class="empty-state">Немає запланованих занять</p>';
      return;
    }

    el.innerHTML = upcoming.map(l => `
      <div class="portal-item">
        <div class="portal-item-main">
          <strong>${esc(l.title)}</strong>
          <div class="portal-item-meta">${fmtScheduleDate(l.lesson_at)} · ${esc(l.group_name)}</div>
        </div>
      </div>
    `).join('');
  } catch {
    el.innerHTML = '<p class="empty-state">Не вдалося завантажити</p>';
  }
}

function renderBillingBanner(billing) {
  const el = document.getElementById('billing-banner');
  if (!el || !billing || billing.status === 'paid' || billing.status === 'exempt') {
    if (el) el.hidden = true;
    return;
  }

  const graceUntil = billing.graceUntil
    ? new Date(billing.graceUntil).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
    : '';

  if (billing.status === 'grace') {
    el.className = 'billing-banner billing-banner--grace';
    el.innerHTML = `<strong>Грейс-період оплати.</strong> Доступ до ${graceUntil}. Будь ласка, оплатіть курс за ${billing.periodLabel || 'поточний місяць'}.`;
    el.hidden = false;
    return;
  }

  if (billing.status === 'pending') {
    el.className = 'billing-banner billing-banner--warn';
    el.innerHTML = `<strong>Нагадування про оплату.</strong> Дедлайн — ${billing.billingDay || 1}-е число. Період: ${billing.periodLabel || ''}.`;
    el.hidden = false;
    return;
  }

  el.hidden = true;
}

async function init() {
  await loadTabAccess();
  refreshAppNav();
  const data = await api('/dashboard');
  setAllowedTabs(data.tabAccess);
  renderBillingBanner(data.billing);
  renderHero(data);
  renderActions(data.user);
  renderPrograms(data.enrollments || []);
  renderActivity(data.bountyLog || []);
  await Promise.all([loadConferences(), loadSchedule()]);
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  clearSession();
  window.location.href = '/';
});

init().catch((err) => {
  handleSessionError(err);
  if (!isAuthError(err) && !isPaymentError(err)) {
    document.getElementById('portal-hero').innerHTML =
      '<p class="empty-state">Помилка завантаження. Спробуйте оновити сторінку.</p>';
  }
});
