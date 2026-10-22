const SOURCE_FILTERS = [
  { id: 'all', label: 'Усе' },
  { id: 'lesson', label: 'Заняття' },
  { id: 'conference', label: 'Конференції' },
  { id: 'ctftime', label: 'CTF' },
  { id: 'manual', label: 'Події школи' },
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseIso(iso) {
  return new Date(String(iso).includes('Z') || String(iso).includes('+') ? iso : `${iso}Z`);
}

function safeUrl(value, source) {
  if (source === 'conference') return /^\/room\.html\?id=\d+$/.test(value || '') ? value : '/conferences.html';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function mountUnifiedCalendar(root, { fetchEvents, locale = 'uk-UA', t = (text) => text, showCredit = true, onError } = {}) {
  if (!root) return null;
  const state = { month: dayKey(new Date()).slice(0, 7), events: [], day: '', filter: 'all' };
  const filtered = () => (state.filter === 'all'
    ? state.events
    : state.events.filter((event) => (state.filter === 'manual'
      ? !['lesson', 'conference', 'ctftime'].includes(event.source)
      : event.source === state.filter)));

  function sourceLabel(event) {
    if (event.source === 'ctftime') return 'CTF';
    if (event.source === 'lesson') return `${t('Заняття')} · ${escapeHtml(event.audience_label || '')}`;
    if (event.source === 'conference') return `${t('Конференція')} · ${escapeHtml(event.audience_label || '')}`;
    return t('Подія школи');
  }

  function renderEvents(events) {
    if (!events.length) return `<p class="empty-state">${t('На цю дату подій немає')}</p>`;
    return events.map((event) => {
      const link = safeUrl(event.url, event.source);
      const external = event.source !== 'conference';
      const time = parseIso(event.starts_at).toLocaleString(locale, {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
      return `<details class="student-calendar-event" data-source="${escapeHtml(event.source || '')}">
        <summary>
          <span class="student-calendar-event-time">${escapeHtml(time)}</span>
          <strong>${escapeHtml(event.title)}</strong>
          <span class="student-calendar-source">${sourceLabel(event)}</span>
          ${event.is_exception ? `<span class="student-calendar-source">${t('Змінене заняття')}</span>` : ''}
        </summary>
        <div class="student-calendar-event-details">
          ${event.description ? `<p>${escapeHtml(event.description).replace(/\n/g, '<br>')}</p>` : ''}
          <div class="student-calendar-links">
            ${link ? `<a href="${escapeHtml(link)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${event.source === 'conference' ? t('Відкрити конференцію') : t('Сторінка події')}</a>` : ''}
          </div>
        </div>
      </details>`;
    }).join('');
  }

  function render() {
    const [year, monthNumber] = state.month.split('-').map(Number);
    const first = new Date(year, monthNumber - 1, 1);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
    const byDay = new Map();
    filtered().forEach((event) => {
      const key = dayKey(parseIso(event.starts_at));
      byDay.set(key, [...(byDay.get(key) || []), event]);
    });
    const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(first);
    const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, i + 1)));
    const today = dayKey(new Date());
    const cellsHtml = Array.from({ length: cells }, (_, index) => {
      const day = index - offset + 1;
      if (day < 1 || day > daysInMonth) return '<span class="student-calendar-empty" aria-hidden="true"></span>';
      const key = `${state.month}-${String(day).padStart(2, '0')}`;
      const list = byDay.get(key) || [];
      const classes = ['student-calendar-day'];
      if (key === state.day) classes.push('is-selected');
      if (list.length) classes.push('has-events');
      if (list.some((event) => event.source === 'conference')) classes.push('has-conference');
      return `<button type="button" class="${classes.join(' ')}" data-calendar-day="${key}" aria-pressed="${key === state.day}"${key === today ? ' aria-current="date"' : ''} aria-label="${day}${list.length ? `, ${list.length} ${t('подій')}` : ''}">
        <span>${day}</span>${list.length ? `<i aria-hidden="true">${list.length}</i>` : ''}
      </button>`;
    }).join('');
    const filters = SOURCE_FILTERS.map((item) => `<button type="button" class="student-calendar-filter${item.id === state.filter ? ' is-active' : ''}" data-calendar-filter="${item.id}" aria-pressed="${item.id === state.filter}">${t(item.label)}</button>`).join('');

    root.innerHTML = `<div class="student-calendar-head">
        <div><span class="section-tag">// calendar</span><h3>${escapeHtml(monthLabel)}</h3></div>
        <div class="student-calendar-nav">
          <button type="button" class="btn btn--outline btn--sm student-calendar-today" data-calendar-today>${t('Сьогодні')}</button>
          <button type="button" class="btn btn--outline btn--sm" data-calendar-shift="-1" aria-label="${t('Попередній місяць')}">‹</button>
          <button type="button" class="btn btn--outline btn--sm" data-calendar-shift="1" aria-label="${t('Наступний місяць')}">›</button>
        </div>
      </div>
      <div class="student-calendar-filters" role="group" aria-label="${t('Фільтр подій')}">${filters}</div>
      <div class="student-calendar-layout">
        <div class="student-calendar-month">
          <div class="student-calendar-weekdays" aria-hidden="true">${weekdays.map((day) => `<span>${day}</span>`).join('')}</div>
          <div class="student-calendar-grid">${cellsHtml}</div>
        </div>
        <div class="student-calendar-agenda">
          <h4>${new Date(`${state.day}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
          <div class="student-calendar-event-list">${renderEvents(byDay.get(state.day) || [])}</div>
        </div>
      </div>
      ${showCredit ? `<p class="student-calendar-credit">${t('Події CTF оновлюються раз на місяць. Інформація та посилання ведуть до організаторів.')}</p>` : ''}`;

    root.querySelectorAll('[data-calendar-day]').forEach((button) => button.addEventListener('click', () => {
      state.day = button.dataset.calendarDay;
      render();
    }));
    root.querySelectorAll('[data-calendar-filter]').forEach((button) => button.addEventListener('click', () => {
      state.filter = button.dataset.calendarFilter;
      render();
    }));
    root.querySelectorAll('[data-calendar-shift]').forEach((button) => button.addEventListener('click', () => {
      const next = new Date(year, monthNumber - 1 + Number(button.dataset.calendarShift), 1);
      load(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
    }));
    root.querySelector('[data-calendar-today]')?.addEventListener('click', () => load(today.slice(0, 7), today));
  }

  async function load(month = state.month, preferredDay = '') {
    try {
      state.events = await fetchEvents(month);
      state.month = month;
      const today = dayKey(new Date());
      const days = state.events.map((event) => dayKey(parseIso(event.starts_at)));
      state.day = [preferredDay, today].find((day) => day && day.startsWith(month)) || days[0] || `${month}-01`;
      render();
    } catch (err) {
      if (onError) onError(err);
      root.innerHTML = `<p class="empty-state">${escapeHtml(err.message || t('Не вдалося завантажити календар'))}</p>`;
    }
  }

  return { load, reload: () => load(state.month, state.day) };
}
