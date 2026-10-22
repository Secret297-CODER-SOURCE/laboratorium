import { api } from '/auth.js';

const DEVICE_LABELS = { pc: 'ПК', android: 'Android', ios: 'iOS', tablet: 'Планшет', other: 'Інше' };
const EVENT_LABELS = {
  page_view: 'Перегляд', click: 'Перехід', login: 'Вхід',
  registration: 'Реєстрація', application_submitted: 'Заявка',
};
const PALETTE = ['#a855f7', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#fb923c', '#94a3b8'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}
const num = value => Number(value || 0).toLocaleString('uk-UA');
const label = (map, key) => map?.[key] || key;

export function renderTrafficPanel() {
  return `<section class="admin-panel traffic-insights" aria-labelledby="traffic-title">
    <div class="admin-panel-head">
      <h3 id="traffic-title">Відвідування, пристрої та джерела</h3>
      <div class="traffic-head-actions">
        <select class="admin-inp admin-inp--sm" id="traffic-days" aria-label="Період діаграм">
          <option value="7">7 днів</option><option value="30" selected>30 днів</option><option value="90">90 днів</option>
        </select>
        <button type="button" class="btn btn--primary btn--sm" id="traffic-open">Таблиця входів і переходів</button>
      </div>
    </div>
    <p class="marketing-note">Журнал зберігає IP-адресу, тип пристрою, браузер, сторінку та джерело переходу кожної події. Дані бачить лише власник; записи автоматично видаляються через 90 днів. Повідомте відвідувачів про це в політиці конфіденційності.</p>
    <div id="traffic-charts" class="traffic-charts" aria-live="polite"><p class="empty-state">Завантаження…</p></div>
  </section>`;
}

function donut(items) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return '<p class="empty-state">Поки немає даних</p>';
  let acc = 0;
  const stops = items.map((item, i) => {
    const from = (acc / total) * 100;
    acc += item.value;
    return `${PALETTE[i % PALETTE.length]} ${from}% ${(acc / total) * 100}%`;
  }).join(', ');
  return `<div class="traffic-donut-wrap">
    <div class="traffic-donut" style="background:conic-gradient(${stops})" role="img" aria-label="Розподіл за пристроями"><span>${num(total)}</span></div>
    <ul class="traffic-legend">${items.map((item, i) => `<li><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(item.name)}<b>${num(item.value)}</b></li>`).join('')}</ul>
  </div>`;
}

function bars(items) {
  if (!items.length) return '<p class="empty-state">Поки немає даних</p>';
  const max = Math.max(1, ...items.map(item => item.value));
  return `<ul class="traffic-bars">${items.map((item, i) => `<li>
    <span class="traffic-bar-name" title="${esc(item.name)}">${esc(item.name)}</span>
    <span class="traffic-bar-track"><span style="width:${Math.max(3, (item.value / max) * 100)}%;background:${PALETTE[i % PALETTE.length]}"></span></span>
    <b>${num(item.value)}</b></li>`).join('')}</ul>`;
}

function lineChart(daily) {
  if (!daily.length) return '<p class="empty-state">Поки немає даних</p>';
  const w = 640; const h = 170; const pad = 24;
  const max = Math.max(1, ...daily.map(d => d.total));
  const x = i => pad + (daily.length === 1 ? (w - pad * 2) / 2 : (i / (daily.length - 1)) * (w - pad * 2));
  const y = v => h - pad - (v / max) * (h - pad * 2);
  const pts = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.total).toFixed(1)}`);
  const uniq = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.unique_ips).toFixed(1)}`);
  return `<svg class="traffic-line" viewBox="0 0 ${w} ${h}" role="img" aria-label="Події та унікальні IP по днях">
    <defs><linearGradient id="trafficFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a855f7" stop-opacity=".45"/><stop offset="1" stop-color="#a855f7" stop-opacity="0"/></linearGradient></defs>
    <line x1="${pad}" x2="${w - pad}" y1="${h - pad}" y2="${h - pad}" class="traffic-axis"/>
    <polygon points="${pad},${h - pad} ${pts.join(' ')} ${x(daily.length - 1).toFixed(1)},${h - pad}" fill="url(#trafficFill)"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linejoin="round"/>
    <polyline points="${uniq.join(' ')}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>
    <text x="${pad}" y="14" class="traffic-axis-label">макс. ${num(max)}</text>
    <text x="${pad}" y="${h - 6}" class="traffic-axis-label">${esc(daily[0].day)}</text>
    <text x="${w - pad}" y="${h - 6}" text-anchor="end" class="traffic-axis-label">${esc(daily[daily.length - 1].day)}</text>
  </svg>
  <p class="traffic-line-legend"><i style="background:#a855f7"></i>Усі події <i style="background:#22d3ee"></i>Унікальні IP</p>`;
}

function renderStats(stats) {
  const t = stats.totals || {};
  const toItems = (rows, map) => (rows || []).map(row => ({ name: label(map, row.label), value: row.value }));
  return `<div class="admin-stats traffic-kpis">
      <div class="admin-stat"><span class="admin-stat-val">${num(t.events)}</span><span class="admin-stat-label">Подій у журналі</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${num(t.unique_ips)}</span><span class="admin-stat-label">Унікальних IP</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${num(t.logins)}</span><span class="admin-stat-label">Входів</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${num(t.page_views)}</span><span class="admin-stat-label">Переглядів</span></div>
    </div>
    <div class="traffic-grid">
      <article class="traffic-card traffic-card--wide"><h4>Активність по днях</h4>${lineChart(stats.daily || [])}</article>
      <article class="traffic-card"><h4>Пристрої</h4>${donut(toItems(stats.devices, DEVICE_LABELS))}</article>
      <article class="traffic-card"><h4>Джерела переходу</h4>${bars(toItems(stats.sources))}</article>
      <article class="traffic-card"><h4>Операційні системи</h4>${bars(toItems(stats.os))}</article>
      <article class="traffic-card"><h4>Браузери</h4>${bars(toItems(stats.browsers))}</article>
      <article class="traffic-card"><h4>Типи подій</h4>${bars(toItems(stats.events, EVENT_LABELS))}</article>
    </div>`;
}

async function loadStats() {
  const target = document.getElementById('traffic-charts');
  if (!target) return;
  const days = document.getElementById('traffic-days')?.value || '30';
  try {
    target.innerHTML = renderStats(await api(`/admin/marketing/access-stats?days=${encodeURIComponent(days)}`));
  } catch (err) {
    target.innerHTML = `<p class="empty-state">${esc(err.message || 'Не вдалося завантажити діаграми')}</p>`;
  }
}

function openLogModal(opener) {
  const state = { page: 1, sort: 'created_at', dir: 'desc', days: '30', device: '', event_type: '', q: '' };
  const overlay = document.createElement('div');
  overlay.className = 'traffic-overlay';
  overlay.innerHTML = `<div class="traffic-modal" role="dialog" aria-modal="true" aria-labelledby="traffic-modal-title">
    <header class="traffic-modal-head">
      <h3 id="traffic-modal-title">Журнал входів і переходів</h3>
      <button type="button" class="btn btn--outline btn--sm" data-close>Закрити</button>
    </header>
    <form class="traffic-filters" id="traffic-filters">
      <input class="admin-inp" type="search" name="q" placeholder="IP, сторінка або джерело…" aria-label="Пошук">
      <select class="admin-inp" name="device" aria-label="Пристрій"><option value="">Усі пристрої</option>${Object.entries(DEVICE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select class="admin-inp" name="event_type" aria-label="Подія"><option value="">Усі події</option>${Object.entries(EVENT_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select class="admin-inp" name="days" aria-label="Період"><option value="7">7 днів</option><option value="30" selected>30 днів</option><option value="90">90 днів</option></select>
    </form>
    <div class="traffic-table-wrap" id="traffic-table"></div>
    <footer class="traffic-pager" id="traffic-pager"></footer>
  </div>`;
  document.body.append(overlay);
  document.body.classList.add('traffic-open');
  const onKey = event => { if (event.key === 'Escape') close(); };
  function close() {
    overlay.remove();
    document.body.classList.remove('traffic-open');
    document.removeEventListener('keydown', onKey);
    clearTimeout(timer);
    opener?.focus();
  }
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-close]').focus();

  const columns = [
    ['created_at', 'Час'], ['event_type', 'Подія'], ['ip', 'IP'], ['device', 'Пристрій'],
    ['browser', 'Браузер / ОС'], ['path', 'Сторінка'], ['source', 'Джерело'],
  ];
  let timer;
  const load = async () => {
    const params = new URLSearchParams({ ...state, pageSize: 25 });
    const table = overlay.querySelector('#traffic-table');
    try {
      const data = await api(`/admin/marketing/access-log?${params}`);
      state.page = data.page;
      table.innerHTML = `<table class="admin-table traffic-table"><thead><tr>${columns.map(([key, title]) => `<th aria-sort="${state.sort === key ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="traffic-sort" data-sort="${key}">${title}${state.sort === key ? (state.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${data.rows.map(row => `<tr>
          <td>${esc(row.created_at)}</td>
          <td><span class="traffic-pill traffic-pill--${esc(row.event_type)}">${esc(label(EVENT_LABELS, row.event_type))}</span></td>
          <td><code>${esc(row.ip || '—')}</code></td>
          <td>${esc(label(DEVICE_LABELS, row.device))}</td>
          <td>${esc(row.browser)} · ${esc(row.os)}</td>
          <td>${esc(row.path)}</td>
          <td>${esc(row.source || 'direct')}${row.medium ? ` / ${esc(row.medium)}` : ''}${row.referrer_host ? `<br><small>${esc(row.referrer_host)}</small>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="empty-state">Записів за цими фільтрами немає</td></tr>'}</tbody></table>`;
      overlay.querySelector('#traffic-pager').innerHTML = `<span>Знайдено: ${num(data.total)} · сторінка ${data.page} з ${data.pages}</span>
        <span><button type="button" class="btn btn--outline btn--sm" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Назад</button>
        <button type="button" class="btn btn--outline btn--sm" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>Далі</button></span>`;
    } catch (err) {
      table.innerHTML = `<p class="empty-state">${esc(err.message || 'Не вдалося завантажити журнал')}</p>`;
    }
  };
  const filters = overlay.querySelector('#traffic-filters');
  filters.addEventListener('input', event => {
    state[event.target.name] = event.target.value;
    state.page = 1;
    clearTimeout(timer);
    timer = setTimeout(load, event.target.name === 'q' ? 300 : 0);
  });
  filters.addEventListener('submit', event => event.preventDefault());
  overlay.addEventListener('click', event => {
    if (event.target === overlay || event.target.closest('[data-close]')) { close(); return; }
    const sort = event.target.closest('[data-sort]');
    if (sort) {
      const key = sort.dataset.sort;
      state.dir = state.sort === key && state.dir === 'desc' ? 'asc' : 'desc';
      state.sort = key;
      state.page = 1;
      load();
    }
    const page = event.target.closest('[data-page]');
    if (page && !page.disabled) { state.page = Number(page.dataset.page); load(); }
  });
  load();
}

export function bindTrafficPanel() {
  const opener = document.getElementById('traffic-open');
  opener?.addEventListener('click', () => openLogModal(opener));
  document.getElementById('traffic-days')?.addEventListener('change', loadStats);
  loadStats();
}
