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
  const { rules = [], tabs = [], directions = [], policyMeta = null } = data;

  return `${renderPolicyPanel(policyMeta)}
  <section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('shield', 'ico ico--md')}Доступ до вкладок</h2>
      <button type="button" class="btn btn--outline btn--sm" id="access-add-rule">${icon('plus', 'ico ico--sm')}Додати правило</button>
    </div>
    <p class="empty-state" style="padding:0 0 16px;text-align:left">
      Приховує вкладки, кнопки та напрямки в кабінеті/порталі для обраних ролей або користувачів. API-доступ до цих розділів також блокується.
      Приховування напрямку тут діє лише для нового запису (кому саме недоступний вибір) — щоб закрити напрямок геть для всіх, вимкніть «Активний» у вкладці «Напрямки»; існуючі групи й мануали цього напрямку в обох випадках продовжують працювати як раніше.
      Власник і розробник завжди мають повний доступ.
    </p>
    <div id="access-rules-list" class="access-rules-list">
      ${rules.length ? rules.map((r, idx) => renderRuleCard(r, tabs, directions, idx)).join('') : '<p class="empty-state">Правил поки немає — усі вкладки доступні</p>'}
    </div>
    <div class="admin-form-actions">
      <button type="button" class="btn btn--primary btn--sm" id="access-save-btn">${icon('check', 'ico ico--sm')}Зберегти правила</button>
    </div>
  </section>`;
}

function selectOptions(enums, labels, value) {
  return (enums || []).map((id) =>
    `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(labels?.[id] || id)}</option>`).join('');
}

function renderPolicyPanel(meta) {
  if (!meta?.policy) {
    return `<section class="admin-panel admin-panel--wide"><p class="empty-state">Не вдалося завантажити політику ізоляції</p></section>`;
  }
  const p = meta.policy;
  const L = meta.labels || {};
  const E = meta.enums || {};

  return `<section class="admin-panel admin-panel--wide" id="access-policy-panel">
    <div class="admin-panel-head">
      <h2>${icon('shield', 'ico ico--md')}Політика ізоляції та форматів доступу</h2>
      <button type="button" class="btn btn--ghost btn--sm" id="access-policy-reset">Скинути</button>
    </div>
    <p class="empty-state" style="padding:0 0 16px;text-align:left">
      Гнучкі правила: хто бачить конференції, рейтинг, DM, записи та індивідуальні pods.
      Зміни діють одразу для учнів / викладачів. Owner і developer завжди мають повний доступ.
    </p>
    <div class="admin-grid" style="gap:16px">
      <div class="admin-panel" style="margin:0">
        <h3>Конференції</h3>
        <label class="access-label">Видимість для учнів
          <select class="admin-inp" data-policy="conferences.studentScope">
            ${selectOptions(E.conferences?.studentScope, L.conferences?.studentScope, p.conferences.studentScope)}
          </select>
        </label>
        <label class="admin-check"><input type="checkbox" data-policy="conferences.ungroupedVisibleToStudents" ${p.conferences.ungroupedVisibleToStudents ? 'checked' : ''}> ${esc(L.conferences?.ungroupedVisibleToStudents)}</label>
        <label class="admin-check"><input type="checkbox" data-policy="conferences.teacherRequiresGroup" ${p.conferences.teacherRequiresGroup ? 'checked' : ''}> ${esc(L.conferences?.teacherRequiresGroup)}</label>
        <label class="admin-check"><input type="checkbox" data-policy="conferences.roomCodeRequiresMembership" ${p.conferences.roomCodeRequiresMembership ? 'checked' : ''}> ${esc(L.conferences?.roomCodeRequiresMembership)}</label>
      </div>
      <div class="admin-panel" style="margin:0">
        <h3>Рейтинг / leaderboard</h3>
        <label class="access-label">Учні
          <select class="admin-inp" data-policy="leaderboard.studentMode">
            ${selectOptions(E.leaderboard?.studentMode, L.leaderboard?.studentMode, p.leaderboard.studentMode)}
          </select>
        </label>
        <label class="access-label">Гості (публічна сторінка)
          <select class="admin-inp" data-policy="leaderboard.guestMode">
            ${selectOptions(E.leaderboard?.guestMode, L.leaderboard?.guestMode, p.leaderboard.guestMode)}
          </select>
        </label>
        <label class="admin-check"><input type="checkbox" data-policy="leaderboard.teacherSeesGlobal" ${p.leaderboard.teacherSeesGlobal ? 'checked' : ''}> ${esc(L.leaderboard?.teacherSeesGlobal)}</label>
        <label class="admin-check"><input type="checkbox" data-policy="ranking.showGlobalPointsInGroup" ${p.ranking.showGlobalPointsInGroup ? 'checked' : ''}> ${esc(L.ranking?.showGlobalPointsInGroup)}</label>
      </div>
      <div class="admin-panel" style="margin:0">
        <h3>Особисті повідомлення (DM)</h3>
        <label class="access-label">Учні між собою
          <select class="admin-inp" data-policy="dm.studentMode">
            ${selectOptions(E.dm?.studentMode, L.dm?.studentMode, p.dm.studentMode)}
          </select>
        </label>
      </div>
      <div class="admin-panel" style="margin:0">
        <h3>Індивідуальні pods</h3>
        <label class="admin-check"><input type="checkbox" data-policy="individualPods.enabled" ${p.individualPods.enabled ? 'checked' : ''}> ${esc(L.individualPods?.enabled)}</label>
        <label class="admin-check"><input type="checkbox" data-policy="individualPods.allowTeacherCreate" ${p.individualPods.allowTeacherCreate ? 'checked' : ''}> ${esc(L.individualPods?.allowTeacherCreate)}</label>
        <label class="access-label">${esc(L.individualPods?.maxMembers)}
          <input class="admin-inp" type="number" min="1" max="5" data-policy="individualPods.maxMembers" value="${p.individualPods.maxMembers}">
        </label>
      </div>
      <div class="admin-panel" style="margin:0">
        <h3>Записи конференцій</h3>
        <label class="admin-check"><input type="checkbox" data-policy="recordings.groupMembersCanView" ${p.recordings.groupMembersCanView ? 'checked' : ''}> ${esc(L.recordings?.groupMembersCanView)}</label>
      </div>
    </div>
    <div class="admin-form-actions" style="margin-top:16px">
      <button type="button" class="btn btn--primary btn--sm" id="access-policy-save">${icon('check', 'ico ico--sm')}Зберегти політику</button>
    </div>
  </section>`;
}

function collectPolicy() {
  const policy = {
    conferences: {},
    leaderboard: {},
    ranking: {},
    dm: {},
    individualPods: {},
    recordings: {},
  };
  document.querySelectorAll('[data-policy]').forEach((el) => {
    const path = el.dataset.policy.split('.');
    let cur = policy;
    for (let i = 0; i < path.length - 1; i++) {
      if (!cur[path[i]]) cur[path[i]] = {};
      cur = cur[path[i]];
    }
    const key = path[path.length - 1];
    if (el.type === 'checkbox') cur[key] = el.checked;
    else if (el.type === 'number') cur[key] = parseInt(el.value, 10);
    else cur[key] = el.value;
  });
  return policy;
}

function renderRuleCard(rule, tabs, directions, idx) {
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
    ${directions.length ? `
      <div class="access-tab-group">
        <span class="access-label" title="Забороняє запис на програми цього напрямку для обраних ролей/користувачів. Уже записані учні й існуючі групи не постраждають.">Напрямки — приховати запис</span>
        <div class="access-checks access-checks--tabs">
          ${directions.map(d => `
            <label class="admin-check"><input type="checkbox" data-field="deny" value="direction:${d.id}" ${rule.deny?.includes(`direction:${d.id}`) ? 'checked' : ''}> ${esc(d.name)}${d.is_active ? '' : ' (неактивний)'}</label>
          `).join('')}
        </div>
      </div>` : ''}
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
  const [tabs, policyMeta] = await Promise.all([
    api('/admin/settings/tab-access'),
    api('/admin/settings/access-policy'),
  ]);
  return { ...tabs, policyMeta };
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

  document.getElementById('access-policy-save')?.addEventListener('click', async () => {
    try {
      await api('/admin/settings/access-policy', {
        method: 'PATCH',
        body: JSON.stringify({ policy: collectPolicy() }),
      });
      showToast('Політику ізоляції збережено');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('access-policy-reset')?.addEventListener('click', async () => {
    try {
      await api('/admin/settings/access-policy/reset', { method: 'POST' });
      showToast('Політику скинуто');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('access-add-rule')?.addEventListener('click', async () => {
    const data = await loadAccessAdminData();
    const rules = collectRules();
    rules.push({ id: `rule-${rules.length + 1}`, name: `Правило ${rules.length + 1}`, roles: ['student'], userIds: [], deny: [] });
    document.getElementById('access-rules-list').innerHTML = rules.map((r, idx) => renderRuleCard(r, data.tabs, data.directions, idx)).join('');
    bindAccessPanelEvents(showToast, reload);
  });

  document.querySelectorAll('.access-rule-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const data = await loadAccessAdminData();
      const rules = collectRules();
      rules.splice(parseInt(btn.dataset.idx, 10), 1);
      document.getElementById('access-rules-list').innerHTML = rules.length
        ? rules.map((r, idx) => renderRuleCard(r, data.tabs, data.directions, idx)).join('')
        : '<p class="empty-state">Правил поки немає — усі вкладки доступні</p>';
      bindAccessPanelEvents(showToast, reload);
    });
  });
}
