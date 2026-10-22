import { api } from '/auth.js';
import { icon } from '/icons.js';
import { renderTrafficPanel, bindTrafficPanel } from '/admin-traffic-panel.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function number(value) {
  return Number(value || 0).toLocaleString('uk-UA');
}

export function renderMarketingPanel(data) {
  const {
    analytics = {}, revenue = {}, campaigns = [], referrals = [], referralSettings = {},
    referralPrograms = { programs: [], students: [] },
  } = data;
  const renderStudentChoices = (selectedIds = []) => (referralPrograms.students || []).map(student => `
    <label class="admin-check referral-student-option" data-student-search="${esc(`@${student.handle} ${student.name}`.toLowerCase())}">
      <input type="checkbox" name="user_ids" value="${student.id}" ${selectedIds.includes(student.id) ? 'checked' : ''}>
      <span>@${esc(student.handle)} · ${esc(student.name)}</span>
    </label>`).join('');
  return `<section class="admin-panel admin-panel--wide marketing-panel">
    <div class="admin-panel-head"><h2>${icon('chart', 'ico ico--md')}SEO, кампанії та аналітика</h2>
      <div class="billing-period-controls">
        <select class="admin-inp admin-inp--sm" id="marketing-month">${Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          return `<option value="${month}" ${month === data.period?.month ? 'selected' : ''}>${new Intl.DateTimeFormat('uk-UA', { month: 'long' }).format(new Date(2024, i, 1))}</option>`;
        }).join('')}</select>
        <input class="admin-inp admin-inp--sm" id="marketing-year" type="number" min="2000" max="2200" value="${esc(data.period?.year || new Date().getFullYear())}">
        <button type="button" class="btn btn--outline btn--sm" id="marketing-refresh">Оновити</button>
      </div>
    </div>
    <p class="marketing-note">Зведені лічильники нижче рахуються по днях без прив'язки до відвідувача. Окремо працює журнал входів і переходів (IP, пристрій, джерело) — він описаний у блоці нижче та доступний лише власнику. Реферальний облік пов'язує запрошення із заявкою для нарахування нагород. Суми наведено за фактично внесеними оплатами; валюта в платіжних записах не задається.</p>
    ${renderTrafficPanel()}
    <div class="admin-stats">
      <div class="admin-stat"><span class="admin-stat-val">${number(analytics.page_views)}</span><span class="admin-stat-label">Перегляди сторінок</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${number(analytics.clicks)}</span><span class="admin-stat-label">Переходи за посиланнями</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${number(analytics.logins)}</span><span class="admin-stat-label">Успішні входи</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${number(analytics.applications)}</span><span class="admin-stat-label">Надіслані заявки</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${number(analytics.registrations)}</span><span class="admin-stat-label">Реєстрації</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${number(revenue.received)}</span><span class="admin-stat-label">Фактично зафіксована сума</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${number(revenue.credit_applied)}</span><span class="admin-stat-label">Застосовано реферальних кредитів</span></div>
      <div class="admin-stat"><span class="admin-stat-val">${number(revenue.payments)}</span><span class="admin-stat-label">Записи оплат</span></div>
    </div>
    <div class="admin-grid">
      <section class="admin-panel">
        <h3>Джерела та кампанії</h3>
        <table class="admin-table"><thead><tr><th>Source / medium</th><th>Кампанія</th><th>Відвідування</th><th>Заявки</th></tr></thead>
          <tbody>${(analytics.sources || []).map(row => `<tr><td>${esc(row.source)} / ${esc(row.medium)}</td><td>${esc(row.campaign)}</td><td>${number(row.visits)}</td><td>${number(row.applications)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">Поки немає даних</td></tr>'}</tbody></table>
      </section>
      <section class="admin-panel">
        <h3>Відомі боти</h3>
        <table class="admin-table"><thead><tr><th>Класифікація</th><th>Запити</th></tr></thead>
          <tbody>${(analytics.bots || []).map(row => `<tr><td>${esc(row.bot_name)}</td><td>${number(row.requests)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">Роботів не виявлено</td></tr>'}</tbody></table>
      </section>
      <section class="admin-panel">
        <h3>Що переглядають</h3>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Сторінка</th><th>Перегляди</th><th>Переходи</th><th>Заявки</th></tr></thead>
          <tbody>${(analytics.pages || []).map(row => `<tr><td>${esc(row.path)}</td><td>${number(row.views)}</td><td>${number(row.clicks)}</td><td>${number(row.applications)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">Поки немає даних</td></tr>'}</tbody></table></div>
      </section>
      <section class="admin-panel">
        <h3>Популярні переходи</h3>
        <table class="admin-table"><thead><tr><th>Посилання або дія</th><th>Кліки</th></tr></thead>
          <tbody>${(analytics.click_targets || []).map(row => `<tr><td>${esc(row.target)}</td><td>${number(row.clicks)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">Поки немає даних</td></tr>'}</tbody></table>
      </section>
      <section class="admin-panel">
        <h3>Орієнтовний час на сторінці</h3>
        <table class="admin-table"><thead><tr><th>Діапазон</th><th>Сторінок</th></tr></thead>
          <tbody>${(analytics.durations || []).map(row => `<tr><td>${({ 'under-10s': 'до 10 секунд', '10-30s': '10–30 секунд', '30-120s': '30 секунд – 2 хвилини', 'over-120s': 'понад 2 хвилини' })[row.bucket] || esc(row.bucket)}</td><td>${number(row.views)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">Поки немає даних</td></tr>'}</tbody></table>
      </section>
    </div>
    <section class="admin-panel marketing-campaigns">
      <div class="admin-panel-head"><h3>Посилання кампаній</h3></div>
      <p class="marketing-note">Лічильники біля окремих посилань — за весь час; загальна аналітика вище відфільтрована за вибраним місяцем.</p>
      <form id="marketing-campaign-form" class="marketing-campaign-form">
        <label>Назва<input class="admin-inp" name="label" required maxlength="100"></label>
        <label>Source<input class="admin-inp" name="source" required maxlength="100" placeholder="instagram"></label>
        <label>Medium<input class="admin-inp" name="medium" required maxlength="100" placeholder="social"></label>
        <label>Campaign<input class="admin-inp" name="campaign" required maxlength="120" placeholder="spring-launch"></label>
        <label>Content<input class="admin-inp" name="content" maxlength="120" placeholder="story-1"></label>
        <label>Сторінка переходу<input class="admin-inp" name="destination" value="/" placeholder="/course.html?id=1"></label>
        <button type="submit" class="btn btn--primary btn--sm">Створити посилання</button>
      </form>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Посилання</th><th>Перегляди</th><th>Заявки</th><th>Статус</th><th></th></tr></thead>
        <tbody>${campaigns.map(c => `<tr><td><strong>${esc(c.label)}</strong><a class="marketing-url" href="${esc(c.url)}" target="_blank" rel="noreferrer">${esc(c.url)}</a></td><td>${number(c.visits)}</td><td>${number(c.applications)}</td><td>${c.is_active ? 'Активне' : 'Вимкнене'}</td><td><button type="button" class="btn btn--outline btn--sm marketing-toggle" data-id="${c.id}" data-active="${c.is_active ? '1' : '0'}">${c.is_active ? 'Вимкнути' : 'Увімкнути'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty-state">Створіть перше посилання</td></tr>'}</tbody></table></div>
    </section>
    <section class="admin-panel marketing-referrals">
      <h3>Базові правила для персональних посилань</h3>
      <p class="marketing-note">Учень ділиться персональним реферальним посиланням, а система зараховує надіслану за ним заявку до його коду. Нагорода нараховується лише після того, як власник схвалить заявку. За одну заявку можна видати бали й кредит одночасно; повторне схвалення тієї самої заявки не створює другу нагороду.</p>
      <form id="marketing-referral-form" class="marketing-referral-form">
        <label class="admin-check"><input type="checkbox" name="enabled" ${referralSettings.enabled ? 'checked' : ''}>Увімкнено
          <small>Якщо вимкнути, нові нагороди не нараховуватимуться. Уже отримані бали та кредит залишаються на рахунку учня.</small>
        </label>
        <label>Бали за схвалену заявку
          <input class="admin-inp" type="number" name="reward_points" min="0" max="100000" value="${Number(referralSettings.reward_points || 0)}">
          <small>Стільки bounty-балів отримає учень, який запросив заявника, після схвалення заявки. 0 — бали не нараховуються.</small>
        </label>
        <label>Кредит за схвалену заявку
          <input class="admin-inp" type="number" name="credit_amount" min="0" step="0.01" value="${Number(referralSettings.credit_amount || 0)}">
          <small>Ця сума додається до доступного кредиту учня та може бути врахована під час внесення оплати. Валюта й умови використання тут автоматично не задаються — поясніть їх учням окремо. 0 — кредит не нараховується.</small>
        </label>
        <label>Ліміт нагород для одного запрошувача
          <input class="admin-inp" type="number" name="max_rewards_per_user" min="0" value="${Number(referralSettings.max_rewards_per_user || 0)}">
          <small>Максимальна кількість схвалених реферальних заявок, за які один учень може отримати нагороду. Ліміт спільний для балів і кредиту; 0 — без обмеження.</small>
        </label>
        <button type="submit" class="btn btn--primary btn--sm">Зберегти правила</button>
      </form>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Учень / код</th><th>Реєстрації учнів</th><th>Заявки</th><th>Прийняті заявки</th><th>Нагороди</th><th>Нараховано балів</th><th>Кредит</th><th>Доступний кредит</th></tr></thead>
        <tbody>${referrals.map(r => `<tr><td>@${esc(r.handle)} · ${esc(r.name)}<br><small>${esc(r.code)}</small></td><td>${number(r.registered_students)}</td><td>${number(r.application_count)}</td><td>${number(r.accepted_count)}</td><td>${number(r.reward_count)}</td><td>${number(r.points_awarded)}</td><td>${number(r.credit_awarded)}</td><td>${number(r.credit_available)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty-state">Учні ще не створили реферальних посилань</td></tr>'}</tbody></table></div>
    </section>
    <section class="admin-panel marketing-referral-programs">
      <div class="admin-panel-head"><h3>Окремі реферальні програми</h3></div>
      <p class="marketing-note">Створюйте кілька кампаній з різними винагородами: наприклад, кредит-знижку на навчання або додаткові bounty-бали. Кожну програму можна призначити всім учням або вибраним окремо; щоб задати особливу нагороду одному учневі, створіть програму лише для нього. Її посилання та результати з’являться в кабінетах призначених учнів.</p>
      <form class="referral-program-form" id="referral-program-create">
        <label>Назва програми<input class="admin-inp" name="name" required maxlength="100" placeholder="Наприклад, Знижка для друга"></label>
        <label>Опис для учня<textarea class="admin-inp" name="description" rows="2" maxlength="500" placeholder="Поясніть умови винагороди та знижки"></textarea></label>
        <label>Бали за схвалену заявку<input class="admin-inp" type="number" name="reward_points" min="0" max="100000" value="0"></label>
        <label>Кредит-знижка на навчання<input class="admin-inp" type="number" name="credit_amount" min="0" max="10000000" step="0.01" value="0"><small>Додається до кредитного балансу учня; під час запису оплати owner може застосувати його як знижку.</small></label>
        <label>Ліміт нагород на учня<input class="admin-inp" type="number" name="max_rewards_per_user" min="0" value="0"><small>0 — без обмеження; рахується окремо в межах цієї програми.</small></label>
        <label class="admin-check"><input type="checkbox" name="apply_to_all">Призначити всім учням</label>
        <div class="referral-program-students">
          <details class="referral-student-picker">
            <summary>Або виберіть учнів (${referralPrograms.students?.length || 0})</summary>
            <input class="admin-inp referral-student-search" type="search" placeholder="Знайти учня…" aria-label="Знайти учня">
            <div class="referral-student-options">${renderStudentChoices()}</div>
          </details>
        </div>
        <button type="submit" class="btn btn--primary btn--sm">Створити програму</button>
      </form>
      <div class="referral-program-list">
        ${(referralPrograms.programs || []).map(program => `
          <form class="referral-program-form referral-program-card" data-program-id="${program.id}">
            <div class="referral-program-card-head"><strong>${esc(program.name)}</strong><span class="status-pill ${program.is_active ? 'approved' : 'pending'}">${program.is_active ? 'Активна' : 'Вимкнена'}</span></div>
            <label>Назва програми<input class="admin-inp" name="name" required maxlength="100" value="${esc(program.name)}"></label>
            <label>Опис для учня<textarea class="admin-inp" name="description" rows="2" maxlength="500">${esc(program.description)}</textarea></label>
            <label>Бали за схвалену заявку<input class="admin-inp" type="number" name="reward_points" min="0" max="100000" value="${Number(program.reward_points)}"></label>
            <label>Кредит-знижка<input class="admin-inp" type="number" name="credit_amount" min="0" max="10000000" step="0.01" value="${Number(program.credit_amount)}"></label>
            <label>Ліміт нагород на учня<input class="admin-inp" type="number" name="max_rewards_per_user" min="0" value="${Number(program.max_rewards_per_user)}"><small>0 — без обмеження.</small></label>
            <label class="admin-check"><input type="checkbox" name="apply_to_all" ${program.apply_to_all ? 'checked' : ''}>Призначити всім учням</label>
            <div class="referral-program-students">
              <details class="referral-student-picker">
                <summary>Вибрані учні (${program.user_ids.length})</summary>
                <input class="admin-inp referral-student-search" type="search" placeholder="Знайти учня…" aria-label="Знайти учня">
                <div class="referral-student-options">${renderStudentChoices(program.user_ids)}</div>
                <small>Якщо не для всіх — призначте одного або кількох учнів.</small>
              </details>
            </div>
            <label class="admin-check"><input type="checkbox" name="is_active" ${program.is_active ? 'checked' : ''}>Програма активна</label>
            <button type="submit" class="btn btn--outline btn--sm">Зберегти зміни</button>
          </form>`).join('') || '<p class="empty-state">Ще не створено окремих реферальних програм.</p>'}
      </div>
    </section>
  </section>`;
}

export async function loadMarketingData() {
  const params = new URLSearchParams({
    year: document.getElementById('marketing-year')?.value || String(new Date().getFullYear()),
    month: document.getElementById('marketing-month')?.value || String(new Date().getMonth() + 1),
  });
  return api(`/admin/marketing?${params}`);
}

export function bindMarketingPanelEvents(showToast, reload) {
  bindTrafficPanel();
  const refresh = () => reload();
  document.getElementById('marketing-refresh')?.addEventListener('click', refresh);
  document.getElementById('marketing-month')?.addEventListener('change', refresh);
  document.getElementById('marketing-year')?.addEventListener('change', refresh);
  document.getElementById('marketing-campaign-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/admin/marketing/campaigns', { method: 'POST', body: JSON.stringify(values) });
      showToast('Посилання кампанії створено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });
  document.querySelectorAll('.marketing-toggle').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await api(`/admin/marketing/campaigns/${button.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: button.dataset.active !== '1' }),
        });
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
  document.querySelectorAll('.referral-student-search').forEach(input => {
    input.addEventListener('input', () => {
      const query = input.value.trim().toLocaleLowerCase();
      input.parentElement.querySelectorAll('.referral-student-option').forEach(option => {
        option.hidden = !!query && !option.dataset.studentSearch.includes(query);
      });
    });
  });
  document.getElementById('marketing-referral-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      enabled: form.has('enabled'),
      reward_points: Number(form.get('reward_points')),
      credit_amount: Number(form.get('credit_amount')),
      max_rewards_per_user: Number(form.get('max_rewards_per_user')),
    };
    try {
      await api('/admin/marketing/referrals', { method: 'PATCH', body: JSON.stringify(payload) });
      showToast('Правила реферальної програми збережено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });
  document.querySelectorAll('.referral-program-form').forEach(formElement => {
    formElement.addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = {
        name: form.get('name'),
        description: form.get('description'),
        reward_points: Number(form.get('reward_points')),
        credit_amount: Number(form.get('credit_amount')),
        max_rewards_per_user: Number(form.get('max_rewards_per_user')),
        apply_to_all: form.has('apply_to_all'),
        user_ids: form.getAll('user_ids').map(Number),
        is_active: formElement.id === 'referral-program-create' || form.has('is_active'),
      };
      const programId = formElement.dataset.programId;
      try {
        await api(programId
          ? `/admin/marketing/referral-programs/${programId}`
          : '/admin/marketing/referral-programs', {
          method: programId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        showToast(programId ? 'Реферальну програму оновлено' : 'Реферальну програму створено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}
