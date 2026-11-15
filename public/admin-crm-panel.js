import { api } from '/auth.js';
import { icon } from '/icons.js';
import { showPrompt } from '/dialog.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value, currency = 'UAH') {
  const n = Number(value) || 0;
  return `${n.toLocaleString('uk-UA')} ${currency}`;
}

const INTENT_LABELS = {
  individual: 'Індивідуально',
  corporate: 'Корпоратив',
  team: 'Команда',
};

let crmCache = null;
let crmView = 'pipeline';
let selectedOppId = null;
let lastStageChange = null;
let undoTimer = null;

export async function loadCrmData() {
  const [board, companies, contacts] = await Promise.all([
    api('/admin/crm/board'),
    api('/admin/crm/companies'),
    api('/admin/crm/contacts'),
  ]);
  crmCache = {
    ...board,
    companies: companies.companies || [],
    contacts: contacts.contacts || [],
  };
  return crmCache;
}

function renderStats(stats = {}) {
  return `<div class="crm-stats">
    <div class="crm-stat"><span class="crm-stat-val">${stats.open || 0}</span><span class="crm-stat-label">Відкриті угоди</span></div>
    <div class="crm-stat"><span class="crm-stat-val">${money(stats.pipeline_value)}</span><span class="crm-stat-label">Вартість воронки</span></div>
    <div class="crm-stat"><span class="crm-stat-val">${stats.companies || 0}</span><span class="crm-stat-label">Компанії</span></div>
    <div class="crm-stat"><span class="crm-stat-val">${stats.contacts || 0}</span><span class="crm-stat-label">Контакти</span></div>
    <div class="crm-stat"><span class="crm-stat-val">${stats.won_30d || 0}</span><span class="crm-stat-label">Виграно / 30д</span></div>
  </div>`;
}

function stageOptions(current) {
  return (crmCache?.stages || []).map((s) => (
    `<option value="${s}" ${s === current ? 'selected' : ''}>${esc(crmCache.stageLabels?.[s] || s)}</option>`
  )).join('');
}

function renderCard(opp) {
  return `<article class="crm-card" draggable="true" data-opp-id="${opp.id}" data-stage="${esc(opp.stage)}">
    <button type="button" class="crm-card-open" data-opp-id="${opp.id}">
      <strong>${esc(opp.title)}</strong>
      <span class="crm-card-meta">${esc(opp.company_name || opp.contact_name || 'Без компанії')}</span>
      <span class="crm-card-meta">${esc(opp.contact_email || opp.program || '—')}</span>
      <div class="crm-card-footer">
        <span class="crm-pill">${esc(INTENT_LABELS[opp.intent] || opp.intent || 'lead')}</span>
        <span class="crm-card-value">${money(opp.value, opp.currency)}</span>
      </div>
    </button>
    <label class="crm-card-stage">
      <span class="visually-hidden">Етап</span>
      <select class="crm-card-stage-select" data-opp-id="${opp.id}" data-prev-stage="${esc(opp.stage)}" aria-label="Змінити етап угоди">
        ${stageOptions(opp.stage)}
      </select>
    </label>
  </article>`;
}

function renderPipeline(data) {
  const stages = (data.stages || []).filter((s) => s !== 'won' && s !== 'lost');
  return `<div class="crm-board" role="list">
    ${stages.map((stage) => {
      const items = data.columns?.[stage] || [];
      return `<section class="crm-column" data-stage="${stage}" role="listitem">
        <header class="crm-column-head">
          <h3>${esc(data.stageLabels?.[stage] || stage)}</h3>
          <span class="crm-count">${items.length}</span>
        </header>
        <div class="crm-column-body" data-drop-stage="${stage}">
          ${items.map((opp) => renderCard(opp)).join('') || `
            <p class="crm-empty">Порожньо</p>
            <button type="button" class="btn btn--ghost btn--sm crm-empty-cta" data-stage="${stage}">
              ${icon('plus', 'ico ico--sm')}Створити угоду
            </button>`}
        </div>
      </section>`;
    }).join('')}
  </div>`;
}

function renderCompanies(companies) {
  return `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th>Компанія</th><th>Галузь</th><th>Розмір</th><th>Контакти</th><th>Угоди</th><th>Сайт</th></tr></thead>
    <tbody>
      ${companies.map((c) => `<tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(c.industry || '—')}</td>
        <td>${esc(c.size_band || '—')}</td>
        <td>${c.contacts_count || 0}</td>
        <td>${c.open_deals || 0}</td>
        <td>${c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website)}</a>` : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Додайте першу компанію</td></tr>'}
    </tbody>
  </table></div>`;
}

function renderContacts(contacts) {
  return `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th>Контакт</th><th>Email</th><th>Телефон</th><th>Посада</th><th>Компанія</th></tr></thead>
    <tbody>
      ${contacts.map((c) => `<tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
        <td>${c.phone ? `<a href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : '—'}</td>
        <td>${esc(c.job_title || '—')}</td>
        <td>${esc(c.company_name || '—')}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty-state">Контактів поки немає</td></tr>'}
    </tbody>
  </table></div>`;
}

function renderDetail(detail) {
  if (!detail) return '';
  const { opportunity: o, activities = [], contact, company } = detail;
  return `<aside class="crm-drawer" id="crm-drawer">
    <header class="crm-drawer-head">
      <div>
        <span class="section-tag">угода #${o.id}</span>
        <h3>${esc(o.title)}</h3>
      </div>
      <button type="button" class="btn btn--ghost btn--sm" id="crm-drawer-close">${icon('x', 'ico ico--sm')}</button>
    </header>
    <div class="crm-drawer-grid">
      <label>Етап
        <select id="crm-stage-select" data-opp-id="${o.id}" data-prev-stage="${esc(o.stage)}">
          ${stageOptions(o.stage)}
        </select>
      </label>
      <label>Вартість
        <input type="number" id="crm-value-input" data-opp-id="${o.id}" value="${Number(o.value) || 0}" min="0" step="100">
      </label>
      <label>Намір
        <select id="crm-intent-select" data-opp-id="${o.id}">
          ${Object.entries(INTENT_LABELS).map(([k, v]) => `<option value="${k}" ${o.intent === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label>Очікуване закриття
        <input type="date" id="crm-close-input" data-opp-id="${o.id}" value="${esc((o.expected_close || '').slice(0, 10))}">
      </label>
    </div>
    <div class="crm-drawer-meta">
      <p><strong>Контакт:</strong> ${esc(contact?.name || '—')} · ${esc(contact?.email || '')}</p>
      <p><strong>Компанія:</strong> ${esc(company?.name || '—')}</p>
      <p><strong>Програма:</strong> ${esc(o.program || '—')}</p>
      <p><strong>Джерело:</strong> ${esc(o.source || '—')}</p>
    </div>
    <form class="crm-activity-form" id="crm-activity-form" data-opp-id="${o.id}">
      <select name="type">
        <option value="note">Нотатка</option>
        <option value="call">Дзвінок</option>
        <option value="email">Email</option>
        <option value="meeting">Зустріч</option>
        <option value="task">Задача</option>
      </select>
      <textarea name="body" rows="3" required placeholder="Що зроблено / що далі…"></textarea>
      <button type="submit" class="btn btn--primary btn--sm">${icon('plus', 'ico ico--sm')}Додати</button>
    </form>
    <div class="crm-timeline">
      ${activities.map((a) => `<article class="crm-timeline-item">
        <span class="crm-pill">${esc(a.type)}</span>
        <p>${esc(a.body)}</p>
        <time>${esc(a.created_at)} · ${esc(a.author_name || 'система')}</time>
      </article>`).join('') || '<p class="empty-state">Поки немає активностей</p>'}
    </div>
  </aside>`;
}

export function renderCrmPanel(data, detail = null) {
  crmCache = data;
  return `<section class="admin-panel admin-panel--wide crm-panel">
    <div class="admin-panel-head crm-panel-head">
      <div>
        <h2>${icon('target', 'ico ico--md')}CRM · воронка заявок</h2>
        <p class="crm-panel-sub">Компанії, контакти та угоди з заявок сайту — у стилі сучасної CRM.</p>
      </div>
      <div class="crm-toolbar">
        <div class="crm-view-switch" role="tablist">
          <button type="button" class="crm-view-btn${crmView === 'pipeline' ? ' active' : ''}" data-crm-view="pipeline">Воронка</button>
          <button type="button" class="crm-view-btn${crmView === 'companies' ? ' active' : ''}" data-crm-view="companies">Компанії</button>
          <button type="button" class="crm-view-btn${crmView === 'contacts' ? ' active' : ''}" data-crm-view="contacts">Контакти</button>
        </div>
        <button type="button" class="btn btn--outline btn--sm" id="crm-add-company">${icon('plus', 'ico ico--sm')}Компанія</button>
        <button type="button" class="btn btn--primary btn--sm" id="crm-add-deal">${icon('plus', 'ico ico--sm')}Угода</button>
      </div>
    </div>
    ${renderStats(data.stats)}
    <div id="crm-undo-bar" class="crm-undo-bar" hidden>
      <span id="crm-undo-text"></span>
      <button type="button" class="btn btn--ghost btn--sm" id="crm-undo-btn">Скасувати</button>
    </div>
    <div class="crm-body">
      <div class="crm-main">
        ${crmView === 'pipeline' ? renderPipeline(data) : ''}
        ${crmView === 'companies' ? renderCompanies(data.companies || []) : ''}
        ${crmView === 'contacts' ? renderContacts(data.contacts || []) : ''}
      </div>
      ${detail ? renderDetail(detail) : ''}
    </div>
  </section>`;
}

async function refresh(showToast, load) {
  const data = await loadCrmData();
  let detail = null;
  if (selectedOppId) {
    try {
      detail = await api(`/admin/crm/opportunities/${selectedOppId}`);
    } catch {
      selectedOppId = null;
    }
  }
  const el = document.getElementById('admin-content');
  if (!el) return load();
  const nav = el.querySelector('.admin-sidebar')?.outerHTML || '';
  el.innerHTML = `<div class="admin-layout">${nav}<div class="admin-workspace">${renderCrmPanel(data, detail)}</div></div>`;
  bindCrmPanelEvents(showToast, load);
  el.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.set('tab', btn.dataset.tab);
      history.replaceState(null, '', url);
      load();
    });
  });
}

function showUndoBar(prevStage, nextStage) {
  const bar = document.getElementById('crm-undo-bar');
  const text = document.getElementById('crm-undo-text');
  if (!bar || !text || !lastStageChange) return;
  const labels = crmCache?.stageLabels || {};
  text.textContent = `Етап: ${labels[prevStage] || prevStage} → ${labels[nextStage] || nextStage}`;
  bar.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    bar.hidden = true;
    lastStageChange = null;
  }, 8000);
}

export function bindCrmPanelEvents(showToast, load) {
  document.querySelectorAll('[data-crm-view]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      crmView = btn.dataset.crmView;
      await refresh(showToast, load);
    });
  });

  const createDeal = async (stage = 'lead') => {
    const title = await showPrompt('Назва угоди (напр. Acme — AppSec команда)');
    if (!title) return;
    try {
      const { opportunity } = await api('/admin/crm/opportunities', {
        method: 'POST',
        body: JSON.stringify({ title, stage, intent: 'corporate', source: 'manual' }),
      });
      selectedOppId = opportunity.id;
      crmView = 'pipeline';
      showToast('Угоду створено');
      await refresh(showToast, load);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('crm-add-company')?.addEventListener('click', async () => {
    const name = await showPrompt('Назва компанії');
    if (!name) return;
    try {
      await api('/admin/crm/companies', { method: 'POST', body: JSON.stringify({ name }) });
      showToast('Компанію створено');
      crmView = 'companies';
      await refresh(showToast, load);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('crm-add-deal')?.addEventListener('click', () => createDeal('lead'));
  document.querySelectorAll('.crm-empty-cta').forEach((btn) => {
    btn.addEventListener('click', () => createDeal(btn.dataset.stage || 'lead'));
  });

  document.querySelectorAll('.crm-card-open').forEach((btn) => {
    btn.addEventListener('click', async () => {
      selectedOppId = Number(btn.dataset.oppId);
      await refresh(showToast, load);
    });
  });

  document.getElementById('crm-drawer-close')?.addEventListener('click', async () => {
    selectedOppId = null;
    await refresh(showToast, load);
  });

  const patchOpp = async (id, body, { withUndo = false, prevStage = null } = {}) => {
    try {
      await api(`/admin/crm/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      if (withUndo && prevStage && body.stage && body.stage !== prevStage) {
        lastStageChange = { id: Number(id), prevStage, nextStage: body.stage };
        showToast('Етап оновлено');
        await refresh(showToast, load);
        showUndoBar(prevStage, body.stage);
        return;
      }
      showToast('Угоду оновлено');
      await refresh(showToast, load);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('crm-undo-btn')?.addEventListener('click', async () => {
    if (!lastStageChange) return;
    const { id, prevStage } = lastStageChange;
    lastStageChange = null;
    document.getElementById('crm-undo-bar').hidden = true;
    await patchOpp(id, { stage: prevStage });
    showToast('Етап повернуто');
  });

  const onStageChange = (e) => {
    const prev = e.target.dataset.prevStage;
    patchOpp(e.target.dataset.oppId, { stage: e.target.value }, { withUndo: true, prevStage: prev });
  };

  document.getElementById('crm-stage-select')?.addEventListener('change', onStageChange);
  document.querySelectorAll('.crm-card-stage-select').forEach((sel) => {
    sel.addEventListener('change', onStageChange);
    sel.addEventListener('click', (e) => e.stopPropagation());
  });

  document.getElementById('crm-value-input')?.addEventListener('change', (e) => {
    patchOpp(e.target.dataset.oppId, { value: Number(e.target.value) || 0 });
  });
  document.getElementById('crm-intent-select')?.addEventListener('change', (e) => {
    patchOpp(e.target.dataset.oppId, { intent: e.target.value });
  });
  document.getElementById('crm-close-input')?.addEventListener('change', (e) => {
    patchOpp(e.target.dataset.oppId, { expected_close: e.target.value || null });
  });

  document.getElementById('crm-activity-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/admin/crm/activities', {
        method: 'POST',
        body: JSON.stringify({
          opportunity_id: Number(e.target.dataset.oppId),
          type: fd.get('type'),
          body: fd.get('body'),
        }),
      });
      showToast('Активність додано');
      await refresh(showToast, load);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  let dragId = null;
  let dragPrevStage = null;
  document.querySelectorAll('.crm-card').forEach((card) => {
    card.addEventListener('dragstart', () => {
      dragId = card.dataset.oppId;
      dragPrevStage = card.dataset.stage;
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
  });
  document.querySelectorAll('[data-drop-stage]').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-drop-target');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('is-drop-target');
      if (!dragId) return;
      await patchOpp(dragId, { stage: zone.dataset.dropStage }, {
        withUndo: true,
        prevStage: dragPrevStage,
      });
      dragId = null;
      dragPrevStage = null;
    });
  });
}
