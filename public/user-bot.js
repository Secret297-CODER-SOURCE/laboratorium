import { api, getUser } from '/auth.js';
import { icon } from '/icons.js';
import { isAdminUser } from '/roles.js';
import { t } from '/i18n.js';

const STUDENT_ACTIONS = [
  { href: '/dashboard.html', label: 'Кабінет', hint: 'Профіль, задачі, розклад' },
  { href: '/dashboard.html?tab=lab', label: 'Інструменти', hint: 'Workbench: JWT, hashes, IOC' },
  { href: '/dashboard.html?tab=ctf', label: 'CTF', hint: 'Завдання та стенди' },
  { href: '/conferences.html', label: 'Конференції', hint: 'Заняття в реальному часі' },
  { href: '/groups-chat.html', label: 'Чати груп', hint: 'Повідомлення викладача' },
  { href: '/manuals.html', label: 'Мануали', hint: 'Навчальні матеріали' },
  { href: '/recordings.html', label: 'Записи', hint: 'Перегляд уроків' },
];

const ADMIN_ACTIONS = [
  { href: '/admin.html?tab=overview', label: 'Огляд', hint: 'Користувачі, заявки, конференції' },
  { href: '/admin.html?tab=telegram', label: 'User-bot / Telegram', hint: 'Моніторинг і команди' },
  { href: '/admin.html?tab=errors', label: 'Журнал помилок', hint: 'Останні збої сайту' },
  { href: '/admin.html?tab=users', label: 'Користувачі', hint: 'Акаунти та пошта' },
  { href: '/admin.html?tab=billing', label: 'Оплата', hint: 'Білінг учнів' },
  { href: '/admin.html?tab=ctf', label: 'CTF адмінка', hint: 'Завдання й флаги' },
];

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function answerFor(q, staff) {
  const s = q.toLowerCase();
  if (s.includes('ctf') || s.includes('флаг')) return { text: 'CTF: кабінет → вкладка CTF. Стенд запускається з картки завдання.', href: '/dashboard.html?tab=ctf' };
  if (s.includes('jwt') || s.includes('hash') || s.includes('інструмент') || s.includes('tool')) {
    return { text: 'Інструменти workbench: хеші, JWT, IOC, HTTP, Unicode — без мережевих сканів.', href: '/dashboard.html?tab=lab' };
  }
  if (s.includes('конфер') || s.includes('урок') || s.includes('zoom')) {
    return { text: 'Конференції: розклад і кімната. Чат згортається кнопкою справа, тайли не повинні налізати.', href: '/conferences.html' };
  }
  if (s.includes('чат')) return { text: 'Групові чати — окрема сторінка. Доступ лише до своїх груп.', href: '/groups-chat.html' };
  if (s.includes('оплат') || s.includes('рахунок')) return { text: 'Статус оплати видно в кабінеті. Нагадування також приходять у Telegram user-bot.' };
  if (staff && (s.includes('монітор') || s.includes('помилк') || s.includes('error'))) {
    return { text: 'Моніторинг сайту — в адмінці Telegram і команді /monitor у адмін-боті.', href: '/admin.html?tab=telegram' };
  }
  return { text: 'Можу відкрити кабінет, інструменти, CTF, конференції або чати. Напишіть, що шукаєте.' };
}

export function initUserBot({ mode } = {}) {
  if (mode !== 'app' || document.getElementById('user-bot')) return;
  if (typeof location !== 'undefined' && /\/room\.html$/i.test(location.pathname)) return;
  const staff = isAdminUser(getUser());
  const actions = staff ? [...ADMIN_ACTIONS, ...STUDENT_ACTIONS.slice(0, 3)] : STUDENT_ACTIONS;
  const root = document.createElement('div');
  root.id = 'user-bot';
  root.className = 'user-bot';
  root.innerHTML = `
    <button type="button" class="user-bot__fab" aria-expanded="false" aria-controls="user-bot-panel" title="${t('Асистент')}">
      ${icon('chat', 'ico ico--sm')}<span>${staff ? 'Ops' : 'Lab'}</span>
    </button>
    <div class="user-bot__panel" id="user-bot-panel" hidden>
      <header class="user-bot__head">
        <strong>${staff ? t('User-bot · моніторинг') : t('User-bot · асистент')}</strong>
        <button type="button" class="user-bot__close" aria-label="${t('Закрити')}">${icon('x', 'ico ico--sm')}</button>
      </header>
      <p class="user-bot__lead">${staff
    ? t('Адмін-команди лишаються в Telegram-боті. Тут — швидкі стрибки й стан сайту.')
    : t('Допомога по платформі: інструменти, CTF, уроки. Адмін бачить окремий бот.')}</p>
      <div class="user-bot__monitor" id="user-bot-monitor" hidden></div>
      <div class="user-bot__actions">
        ${actions.map((a) => `<a class="user-bot__chip" href="${esc(a.href)}"><strong>${esc(t(a.label))}</strong><span>${esc(t(a.hint))}</span></a>`).join('')}
      </div>
      <form class="user-bot__form" id="user-bot-form">
        <label class="visually-hidden" for="user-bot-q">${t('Запитати')}</label>
        <input id="user-bot-q" type="search" maxlength="160" placeholder="${t('Куди перейти? jwt, ctf, чат…')}" autocomplete="off">
        <button type="submit" class="btn btn--primary btn--sm">${t('Знайти')}</button>
      </form>
      <p class="user-bot__out" id="user-bot-out" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(root);

  const fab = root.querySelector('.user-bot__fab');
  const panel = root.querySelector('#user-bot-panel');
  const close = root.querySelector('.user-bot__close');
  const setOpen = (open) => {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
    if (open && staff) loadMonitor();
  };
  fab.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));

  root.querySelector('#user-bot-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = root.querySelector('#user-bot-q').value.trim();
    const out = root.querySelector('#user-bot-out');
    if (!q) { out.textContent = ''; return; }
    const ans = answerFor(q, staff);
    out.innerHTML = `${esc(ans.text)}${ans.href ? ` <a href="${esc(ans.href)}">${esc(t('Відкрити'))}</a>` : ''}`;
  });

  async function loadMonitor() {
    const box = root.querySelector('#user-bot-monitor');
    try {
      const data = await api('/admin/telegram/monitor');
      const m = data.monitor || {};
      box.hidden = false;
      box.innerHTML = `
        <div class="user-bot__stats">
          <span><em>${t('Користувачі')}</em><strong>${m.users ?? '—'}</strong></span>
          <span><em>${t('Помилки 24h')}</em><strong>${m.errors24h ?? 0}</strong></span>
          <span><em>Telegram</em><strong>${m.botEnabled ? t('он') : t('оф')}</strong></span>
          <span><em>${t('Live')}</em><strong>${m.liveConferences ?? 0}</strong></span>
        </div>`;
    } catch {
      box.hidden = true;
    }
  }
}
