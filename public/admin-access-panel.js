import { api } from '/auth.js';
import { icon } from '/icons.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const ROLES = [
  { id: 'student', label: 'Учень' },
  { id: 'teacher', label: 'Викладач' },
  { id: 'owner', label: 'Власник' },
];

export function renderAccessPanel(data = {}) {
  const { rules = [], tabs = [] } = data;
  const groups = [...new Set(tabs.map(t => t.group))];

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('shield', 'ico ico--md')}Доступ до вкладок</h2>
      <button type="button" class="btn btn--outline btn--sm" id="access-add-rule">${icon('plus', 'ico ico--sm')}Додати правило</button>
    </div>
    <p class="empty-state" style="padding:0 0 16px;text-align:left">
      Приховує вкладки та кнопки в кабінеті/порталі для обраних ролей або користувачів. API-доступ до цих розділів також блокується.
      Власник і розробник завжди мають повний доступ.
    </p>
    <div id="access-rules-list" class="access-rules-list">
      ${rules.length ? rules.map((r, idx) => renderRuleCard(r, tabs, idx)).join('') : '<p class="empty-state">Правил поки немає — усі вкладки доступні</p>'}
    </div>
    <div class="admin-form-actions">
      <button type="button" class="btn btn--primary btn--sm" id="access-save-btn">${icon('check', 'ico ico--sm')}Зберегти правила</button>
    </div>
  </section>`;
}

function renderRuleCard(rule, tabs, idx) {
  const groups = [...new Set(tabs.map(t => t.group))];
  return `<article class="access-rule-card" data-rule-idx="${idx}">
    <div class="access-rule-head">
      <input class="admin-inp" data-field="name" value="${esc(rule.name)}" placeholder="Назва правила">
      <button type="button" class="btn btn--ghost btn--sm access-rule-del" data-idx="${idx}">${icon('trash', 'ico ico--sm')}</button>
    </div>
    <div class="access-rule-grid">
      <div>
        <span class="access-label">Ролі</span>
        <div class="access-checks">
          ${ROLES.map(r => `<label class="admin-check"><input type="checkbox" data-field="role" value="${r.id}" ${rule.roles?.includes(r.id) ? 'checked' : ''}> ${r.label}</label>`).join('')}
        </div>
      </div>
      <div>
        <span class="access-label">Користувачі (ID через кому)</span>
        <input class="admin-inp" data-field="userIds" value="${esc((rule.userIds || []).join(', '))}" placeholder="12, 34">
      </div>
    </div>
    ${groups.map(g => `
      <div class="access-tab-group">
        <span class="access-label">${esc(g)} — приховати</span>
        <div class="access-checks access-checks--tabs">
          ${tabs.filter(t => t.group === g).map(t => `
            <label class="admin-check"><input type="checkbox" data-field="deny" value="${t.key}" ${rule.deny?.includes(t.key) ? 'checked' : ''}> ${esc(t.label)}</label>
          `).join('')}
        </div>
      </div>`).join('')}
  </article>`;
}

function collectRules() {
  return [...document.querySelectorAll('.access-rule-card')].map((card, idx) => {
    const roles = [...card.querySelectorAll('[data-field="role"]:checked')].map(el => el.value);
    const userIds = (card.querySelector('[data-field="userIds"]')?.value || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(Number.isFinite);
    const deny = [...card.querySelectorAll('[data-field="deny"]:checked')].map(el => el.value);
    return {
      id: `rule-${idx + 1}`,
      name: card.querySelector('[data-field="name"]')?.value?.trim() || `Правило ${idx + 1}`,
      roles,
      userIds,
      deny,
    };
  });
}

export async function loadAccessAdminData() {
  return api('/admin/settings/tab-access');
}

export function bindAccessPanelEvents(showToast, reload) {
  document.getElementById('access-save-btn')?.addEventListener('click', async () => {
    try {
      await api('/admin/settings/tab-access', {
        method: 'PATCH',
        body: JSON.stringify({ rules: collectRules() }),
      });
      showToast('Правила доступу збережено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('access-add-rule')?.addEventListener('click', async () => {
    const data = await loadAccessAdminData();
    const rules = collectRules();
    rules.push({ id: `rule-${rules.length + 1}`, name: `Правило ${rules.length + 1}`, roles: ['student'], userIds: [], deny: [] });
    document.getElementById('access-rules-list').innerHTML = rules.map((r, idx) => renderRuleCard(r, data.tabs, idx)).join('');
    bindAccessPanelEvents(showToast, reload);
  });

  document.querySelectorAll('.access-rule-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const data = await loadAccessAdminData();
      const rules = collectRules();
      rules.splice(parseInt(btn.dataset.idx, 10), 1);
      document.getElementById('access-rules-list').innerHTML = rules.length
        ? rules.map((r, idx) => renderRuleCard(r, data.tabs, idx)).join('')
        : '<p class="empty-state">Правил поки немає — усі вкладки доступні</p>';
      bindAccessPanelEvents(showToast, reload);
    });
  });
}
