import {
  api, requireAuthAsync, initTheme, getUser,
} from '/auth.js';
import {
  BLOCK_PALETTE, renderBlock, renderPage, esc,
} from '/content-render.js';
import { icon } from '/icons.js';
import { showConfirm } from '/dialog.js';

initTheme();

if (!(await requireAuthAsync())) throw new Error('auth');

const STAFF_ROLES = ['owner', 'developer', 'teacher'];
const user = getUser();
const isStaff = STAFF_ROLES.includes(user?.role);
const fallbackHref = isStaff ? '/admin.html' : '/manuals.html';

const params = new URLSearchParams(location.search);
const targetType = params.get('type');
const targetId = parseInt(params.get('id'), 10);

if (!['direction', 'group', 'program', 'manual'].includes(targetType) || !targetId) {
  location.href = fallbackHref;
}

let state = { page: null, meta: null };
let selected = { sectionIdx: null, blockIdx: null };
let activeSectionIdx = 0;
let canvasBound = false;

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast--${type}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

function defaultBlock(type) {
  const defaults = {
    heading: { level: 2, text: 'Заголовок' },
    text: { text: 'Текст параграфу...' },
    list: { style: 'bullet', items: ['Пункт 1', 'Пункт 2'] },
    image: { url: '', caption: '', alt: '' },
    video: { url: '' },
    link: { url: '', label: 'Дізнатись більше', style: 'primary' },
    divider: {},
    quote: { text: 'Цитата', author: '' },
    callout: { variant: 'info', title: 'Підказка', text: '' },
    steps: { items: [{ title: 'Крок 1', text: 'Опис кроку' }] },
    cards: { items: [{ title: 'Картка', text: 'Опис', emoji: 'pin-card' }] },
  };
  return { block_type: type, data: JSON.parse(JSON.stringify(defaults[type] || {})) };
}

function ensureSections() {
  if (!state.page.sections?.length) {
    state.page.sections = [{ title: 'Основний розділ', icon: 'book', blocks: [] }];
  }
}

function getSelectedBlock() {
  const { sectionIdx, blockIdx } = selected;
  if (sectionIdx === null || blockIdx === null) return null;
  return state.page.sections[sectionIdx]?.blocks?.[blockIdx] || null;
}

function paletteIconMarkup(name) {
  return icon(name, 'ico ico--sm') || esc(name);
}

function renderPalette() {
  document.getElementById('builder-palette').innerHTML = BLOCK_PALETTE.map(b => `
    <button type="button" class="palette-btn" data-type="${b.type}" title="${esc(b.label)}">
      <span class="palette-icon">${paletteIconMarkup(b.icon)}</span>
      <span>${esc(b.label)}</span>
    </button>`).join('');
}

function refreshBlockPreview(sectionIdx, blockIdx) {
  const block = state.page.sections[sectionIdx]?.blocks?.[blockIdx];
  const el = document.querySelector(
    `.builder-block[data-sidx="${sectionIdx}"][data-bidx="${blockIdx}"] .builder-block-preview`,
  );
  if (el && block) {
    el.innerHTML = renderBlock(block, { preview: true });
  }
}

function renderCanvas() {
  ensureSections();
  const canvas = document.getElementById('builder-canvas');
  canvas.innerHTML = state.page.sections.map((section, sIdx) => `
    <article class="builder-section${activeSectionIdx === sIdx ? ' active' : ''}" data-sidx="${sIdx}">
      <header class="builder-section-head">
        <input class="builder-inp builder-section-title" data-sidx="${sIdx}" value="${esc(section.title)}" placeholder="Назва розділу">
        <input class="builder-inp builder-section-icon" data-sidx="${sIdx}" value="${esc(section.icon || '')}" placeholder="book" style="width:48px;text-align:center" title="Іконка (назва з icons.js)">
        <div class="builder-section-tools">
          <button type="button" class="btn btn--ghost btn--sm section-up" data-sidx="${sIdx}" ${sIdx === 0 ? 'disabled' : ''} title="Вгору">↑</button>
          <button type="button" class="btn btn--ghost btn--sm section-down" data-sidx="${sIdx}" ${sIdx === state.page.sections.length - 1 ? 'disabled' : ''} title="Вниз">↓</button>
          <button type="button" class="btn btn--ghost btn--sm section-del" data-sidx="${sIdx}" title="Видалити">×</button>
        </div>
      </header>
      <div class="builder-blocks">
        ${(section.blocks || []).length ? section.blocks.map((block, bIdx) => `
          <div class="builder-block${selected.sectionIdx === sIdx && selected.blockIdx === bIdx ? ' selected' : ''}"
               data-sidx="${sIdx}" data-bidx="${bIdx}">
            <div class="builder-block-toolbar">
              <span class="builder-block-type">${BLOCK_PALETTE.find(p => p.type === block.block_type)?.label || block.block_type}</span>
              <button type="button" class="btn btn--ghost btn--sm block-up" data-sidx="${sIdx}" data-bidx="${bIdx}" ${bIdx === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn btn--ghost btn--sm block-down" data-sidx="${sIdx}" data-bidx="${bIdx}" ${bIdx === section.blocks.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="btn btn--ghost btn--sm block-del" data-sidx="${sIdx}" data-bidx="${bIdx}">×</button>
            </div>
            <div class="builder-block-preview">${renderBlock(block, { preview: true })}</div>
          </div>`).join('') : '<p class="builder-blocks-empty">Додайте блоки з панелі зліва</p>'}
      </div>
    </article>`).join('');
}

function renderStepsEditor(items = []) {
  const rows = items.length ? items : [{ title: '', text: '' }];
  return `
    <div class="builder-items-editor" data-kind="steps">
      ${rows.map((item, i) => `
        <div class="builder-item-row" data-idx="${i}">
          <input class="builder-inp prop-step-title" placeholder="Заголовок кроку" value="${esc(item.title || '')}">
          <textarea class="builder-inp prop-step-text" rows="2" placeholder="Опис">${esc(item.text || '')}</textarea>
          <button type="button" class="btn btn--ghost btn--sm item-del" ${rows.length <= 1 ? 'disabled' : ''}>×</button>
        </div>`).join('')}
      <button type="button" class="btn btn--outline btn--sm item-add">+ Крок</button>
    </div>`;
}

function renderCardsEditor(items = []) {
  const rows = items.length ? items : [{ title: '', text: '', emoji: 'pin-card' }];
  return `
    <div class="builder-items-editor" data-kind="cards">
      ${rows.map((item, i) => `
        <div class="builder-item-row" data-idx="${i}">
          <input class="builder-inp prop-card-emoji" placeholder="pin-card" value="${esc(item.emoji || 'pin-card')}" style="width:72px" title="Іконка картки">
          <input class="builder-inp prop-card-title" placeholder="Заголовок" value="${esc(item.title || '')}">
          <textarea class="builder-inp prop-card-text" rows="2" placeholder="Текст">${esc(item.text || '')}</textarea>
          <button type="button" class="btn btn--ghost btn--sm item-del" ${rows.length <= 1 ? 'disabled' : ''}>×</button>
        </div>`).join('')}
      <button type="button" class="btn btn--outline btn--sm item-add">+ Картка</button>
    </div>`;
}

function levelSelected(d, lvl) {
  return String(d.level ?? 2) === String(lvl) ? 'selected' : '';
}

function renderProps() {
  const empty = document.getElementById('props-empty');
  const form = document.getElementById('props-form');
  const block = getSelectedBlock();

  if (!block) {
    empty.hidden = false;
    form.hidden = true;
    return;
  }

  empty.hidden = true;
  form.hidden = false;
  const d = block.data || {};

  let html = '';
  switch (block.block_type) {
    case 'heading':
      html = `
        <label>Рівень<select class="builder-inp prop-inp" data-key="level">
          <option value="1" ${levelSelected(d, 1)}>H1</option>
          <option value="2" ${levelSelected(d, 2)}>H2</option>
          <option value="3" ${levelSelected(d, 3)}>H3</option>
        </select></label>
        <label>Текст<textarea class="builder-inp prop-inp" data-key="text" rows="2">${esc(d.text || '')}</textarea></label>`;
      break;
    case 'text':
    case 'quote':
      html = `
        <label>Текст<textarea class="builder-inp prop-inp" data-key="text" rows="5">${esc(d.text || '')}</textarea></label>
        ${block.block_type === 'quote' ? `<label>Автор<input class="builder-inp prop-inp" data-key="author" value="${esc(d.author || '')}"></label>` : ''}`;
      break;
    case 'list':
      html = `
        <label>Стиль<select class="builder-inp prop-inp" data-key="style">
          <option value="bullet" ${d.style === 'bullet' ? 'selected' : ''}>Маркери</option>
          <option value="number" ${d.style === 'number' ? 'selected' : ''}>Нумерація</option>
        </select></label>
        <label>Пункти (кожен з нового рядка)<textarea class="builder-inp prop-items" rows="6">${esc((d.items || []).join('\n'))}</textarea></label>`;
      break;
    case 'image':
      html = `
        <label>URL<input class="builder-inp prop-inp" data-key="url" value="${esc(d.url || '')}" placeholder="https://..."></label>
        <label>Підпис<input class="builder-inp prop-inp" data-key="caption" value="${esc(d.caption || '')}"></label>
        <label>Alt<input class="builder-inp prop-inp" data-key="alt" value="${esc(d.alt || '')}"></label>`;
      break;
    case 'video':
      html = `<label>YouTube URL<input class="builder-inp prop-inp" data-key="url" value="${esc(d.url || '')}" placeholder="https://youtube.com/watch?v=..."></label>`;
      break;
    case 'link':
      html = `
        <label>URL<input class="builder-inp prop-inp" data-key="url" value="${esc(d.url || '')}"></label>
        <label>Текст кнопки<input class="builder-inp prop-inp" data-key="label" value="${esc(d.label || '')}"></label>
        <label>Стиль<select class="builder-inp prop-inp" data-key="style">
          <option value="primary" ${d.style === 'primary' ? 'selected' : ''}>Primary</option>
          <option value="outline" ${d.style === 'outline' ? 'selected' : ''}>Outline</option>
        </select></label>`;
      break;
    case 'callout':
      html = `
        <label>Тип<select class="builder-inp prop-inp" data-key="variant">
          <option value="info" ${d.variant === 'info' ? 'selected' : ''}>Інфо</option>
          <option value="tip" ${d.variant === 'tip' ? 'selected' : ''}>Порада</option>
          <option value="warn" ${d.variant === 'warn' ? 'selected' : ''}>Увага</option>
        </select></label>
        <label>Заголовок<input class="builder-inp prop-inp" data-key="title" value="${esc(d.title || '')}"></label>
        <label>Текст<textarea class="builder-inp prop-inp" data-key="text" rows="4">${esc(d.text || '')}</textarea></label>`;
      break;
    case 'steps':
      html = `<label>Кроки</label>${renderStepsEditor(d.items)}`;
      break;
    case 'cards':
      html = `<label>Картки</label>${renderCardsEditor(d.items)}`;
      break;
    default:
      html = '<p class="builder-hint">Немає додаткових налаштувань</p>';
  }

  form.innerHTML = html;
  bindPropEvents();
}

function updateBlockFromProps() {
  const { sectionIdx, blockIdx } = selected;
  if (sectionIdx === null || blockIdx === null) return;
  refreshBlockPreview(sectionIdx, blockIdx);
}

function bindPropEvents() {
  const block = getSelectedBlock();
  if (!block) return;
  const { sectionIdx, blockIdx } = selected;

  document.querySelectorAll('#props-form .prop-inp').forEach(el => {
    const handler = () => {
      const key = el.dataset.key;
      let val = el.tagName === 'SELECT' ? el.value : el.value;
      if (key === 'level') val = parseInt(val, 10) || 2;
      block.data[key] = val;
      updateBlockFromProps();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  const itemsEl = document.querySelector('#props-form .prop-items');
  if (itemsEl) {
    itemsEl.addEventListener('input', () => {
      block.data.items = itemsEl.value.split('\n').map(s => s.trim()).filter(Boolean);
      updateBlockFromProps();
    });
  }

  const stepsEditor = document.querySelector('#props-form .builder-items-editor[data-kind="steps"]');
  if (stepsEditor) {
    const syncSteps = () => {
      block.data.items = [...stepsEditor.querySelectorAll('.builder-item-row')].map(row => ({
        title: row.querySelector('.prop-step-title')?.value?.trim() || '',
        text: row.querySelector('.prop-step-text')?.value?.trim() || '',
      })).filter(i => i.title || i.text);
      if (!block.data.items.length) block.data.items = [{ title: 'Крок 1', text: '' }];
      updateBlockFromProps();
    };
    stepsEditor.addEventListener('input', syncSteps);
    stepsEditor.addEventListener('click', (e) => {
      if (e.target.closest('.item-add')) {
        block.data.items.push({ title: `Крок ${block.data.items.length + 1}`, text: '' });
        renderProps();
        updateBlockFromProps();
      }
      if (e.target.closest('.item-del')) {
        const row = e.target.closest('.builder-item-row');
        const rows = [...stepsEditor.querySelectorAll('.builder-item-row')];
        const idx = rows.indexOf(row);
        if (idx < 0 || rows.length <= 1) return;
        const items = rows.map(r => ({
          title: r.querySelector('.prop-step-title')?.value?.trim() || '',
          text: r.querySelector('.prop-step-text')?.value?.trim() || '',
        }));
        items.splice(idx, 1);
        block.data.items = items.length ? items : [{ title: 'Крок 1', text: '' }];
        renderProps();
        updateBlockFromProps();
      }
    });
  }

  const cardsEditor = document.querySelector('#props-form .builder-items-editor[data-kind="cards"]');
  if (cardsEditor) {
    const syncCards = () => {
      block.data.items = [...cardsEditor.querySelectorAll('.builder-item-row')].map(row => ({
        emoji: row.querySelector('.prop-card-emoji')?.value?.trim() || 'pin-card',
        title: row.querySelector('.prop-card-title')?.value?.trim() || '',
        text: row.querySelector('.prop-card-text')?.value?.trim() || '',
      })).filter(i => i.title || i.text);
      if (!block.data.items.length) block.data.items = [{ title: 'Картка', text: '', emoji: 'pin-card' }];
      updateBlockFromProps();
    };
    cardsEditor.addEventListener('input', syncCards);
    cardsEditor.addEventListener('click', (e) => {
      if (e.target.closest('.item-add')) {
        block.data.items.push({ title: 'Нова картка', text: '', emoji: 'pin-card' });
        renderProps();
        updateBlockFromProps();
      }
      if (e.target.closest('.item-del')) {
        const row = e.target.closest('.builder-item-row');
        const rows = [...cardsEditor.querySelectorAll('.builder-item-row')];
        const idx = rows.indexOf(row);
        if (idx < 0 || rows.length <= 1) return;
        const items = rows.map(r => ({
          emoji: r.querySelector('.prop-card-emoji')?.value?.trim() || 'pin-card',
          title: r.querySelector('.prop-card-title')?.value?.trim() || '',
          text: r.querySelector('.prop-card-text')?.value?.trim() || '',
        }));
        items.splice(idx, 1);
        block.data.items = items.length ? items : [{ title: 'Картка', text: '', emoji: 'pin-card' }];
        renderProps();
        updateBlockFromProps();
      }
    });
  }
}

function addBlock(type) {
  ensureSections();
  state.page.sections[activeSectionIdx].blocks.push(defaultBlock(type));
  selected = { sectionIdx: activeSectionIdx, blockIdx: state.page.sections[activeSectionIdx].blocks.length - 1 };
  renderCanvas();
  renderProps();
}

function bindCanvasDelegation() {
  if (canvasBound) return;
  canvasBound = true;

  const canvas = document.getElementById('builder-canvas');
  canvas.addEventListener('click', async (e) => {
    const section = e.target.closest('.builder-section');
    if (!section) return;

    if (e.target.closest('.section-up')) {
      e.stopPropagation();
      const i = parseInt(e.target.closest('.section-up').dataset.sidx, 10);
      [state.page.sections[i - 1], state.page.sections[i]] = [state.page.sections[i], state.page.sections[i - 1]];
      if (activeSectionIdx === i) activeSectionIdx = i - 1;
      else if (activeSectionIdx === i - 1) activeSectionIdx = i;
      renderCanvas();
      return;
    }
    if (e.target.closest('.section-down')) {
      e.stopPropagation();
      const i = parseInt(e.target.closest('.section-down').dataset.sidx, 10);
      [state.page.sections[i], state.page.sections[i + 1]] = [state.page.sections[i + 1], state.page.sections[i]];
      if (activeSectionIdx === i) activeSectionIdx = i + 1;
      else if (activeSectionIdx === i + 1) activeSectionIdx = i;
      renderCanvas();
      return;
    }
    if (e.target.closest('.section-del')) {
      e.stopPropagation();
      const i = parseInt(e.target.closest('.section-del').dataset.sidx, 10);
      if (state.page.sections.length <= 1) return showToast('Має залишитись хоча б один розділ', 'error');
      if (!(await showConfirm('Видалити розділ?', { danger: true }))) return;
      state.page.sections.splice(i, 1);
      selected = { sectionIdx: null, blockIdx: null };
      activeSectionIdx = 0;
      renderCanvas();
      renderProps();
      return;
    }
    if (e.target.closest('.block-up')) {
      e.stopPropagation();
      const btn = e.target.closest('.block-up');
      const s = parseInt(btn.dataset.sidx, 10);
      const b = parseInt(btn.dataset.bidx, 10);
      const blocks = state.page.sections[s].blocks;
      [blocks[b - 1], blocks[b]] = [blocks[b], blocks[b - 1]];
      selected = { sectionIdx: s, blockIdx: b - 1 };
      renderCanvas();
      renderProps();
      return;
    }
    if (e.target.closest('.block-down')) {
      e.stopPropagation();
      const btn = e.target.closest('.block-down');
      const s = parseInt(btn.dataset.sidx, 10);
      const b = parseInt(btn.dataset.bidx, 10);
      const blocks = state.page.sections[s].blocks;
      [blocks[b], blocks[b + 1]] = [blocks[b + 1], blocks[b]];
      selected = { sectionIdx: s, blockIdx: b + 1 };
      renderCanvas();
      renderProps();
      return;
    }
    if (e.target.closest('.block-del')) {
      e.stopPropagation();
      const btn = e.target.closest('.block-del');
      const s = parseInt(btn.dataset.sidx, 10);
      const b = parseInt(btn.dataset.bidx, 10);
      state.page.sections[s].blocks.splice(b, 1);
      selected = { sectionIdx: null, blockIdx: null };
      renderCanvas();
      renderProps();
      return;
    }

    const blockEl = e.target.closest('.builder-block');
    if (blockEl) {
      if (e.target.closest('button')) return;
      selected = {
        sectionIdx: parseInt(blockEl.dataset.sidx, 10),
        blockIdx: parseInt(blockEl.dataset.bidx, 10),
      };
      activeSectionIdx = selected.sectionIdx;
      renderCanvas();
      renderProps();
      return;
    }

    if (e.target.closest('button, input, textarea')) return;
    activeSectionIdx = parseInt(section.dataset.sidx, 10);
    renderCanvas();
  });

  canvas.addEventListener('input', (e) => {
    if (e.target.classList.contains('builder-section-title')) {
      state.page.sections[parseInt(e.target.dataset.sidx, 10)].title = e.target.value;
    }
    if (e.target.classList.contains('builder-section-icon')) {
      state.page.sections[parseInt(e.target.dataset.sidx, 10)].icon = e.target.value;
    }
  });
}

async function save() {
  const prevSelected = { ...selected };
  state.page.title = document.getElementById('page-title').value;
  state.page.subtitle = document.getElementById('page-subtitle').value;
  state.page.cover_gradient = document.getElementById('page-gradient').value;
  state.page.is_published = document.getElementById('builder-published').checked;

  const btn = document.getElementById('builder-save-btn');
  btn.disabled = true;
  try {
    const res = await api(`/content/${targetType}/${targetId}`, {
      method: 'PUT',
      body: JSON.stringify(state.page),
    });
    state.page = res.page;
    selected = prevSelected;
    if (selected.sectionIdx !== null) {
      const sec = state.page.sections[selected.sectionIdx];
      if (!sec || selected.blockIdx >= (sec.blocks?.length || 0)) {
        selected = { sectionIdx: null, blockIdx: null };
      }
    }
    renderCanvas();
    renderProps();
    updateManualStatusUi();
    showToast(res.message || 'Збережено');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

let manualMeta = null;

function updateManualStatusUi() {
  if (targetType !== 'manual') return;
  const pill = document.getElementById('builder-review-pill');
  const publishField = document.getElementById('builder-publish-field');
  const submitBtn = document.getElementById('builder-submit-review-btn');

  if (isStaff) {
    publishField.hidden = false;
    submitBtn.hidden = true;
    pill.hidden = true;
    return;
  }

  // Self-service author: no direct publish toggle — status pill + a
  // "submit for review" action instead, matching the server-side gate in
  // content.service.js (savePage forces is_published for non-staff editors).
  publishField.hidden = true;
  submitBtn.hidden = !!state.page.is_published;
  pill.hidden = false;
  if (state.page.is_published) {
    pill.className = 'status-pill running';
    pill.textContent = 'Опубліковано';
  } else if (manualMeta?.review_status === 'submitted') {
    pill.className = 'status-pill pending';
    pill.textContent = 'На перевірці';
  } else {
    pill.className = 'status-pill none';
    pill.textContent = 'Чернетка';
  }
}

async function submitForReview() {
  const btn = document.getElementById('builder-submit-review-btn');
  btn.disabled = true;
  try {
    await save();
    const res = await api(`/manuals/${targetId}/submit`, { method: 'POST' });
    manualMeta = res.manual;
    updateManualStatusUi();
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function loadDirectionOptions(selectedId) {
  const select = document.getElementById('page-manual-direction');
  select.hidden = false;
  try {
    const { directions } = await api('/directions');
    select.innerHTML = '<option value="">Напрямок: не вибрано</option>'
      + directions.map(d => `<option value="${d.id}" ${String(d.id) === String(selectedId) ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  } catch { /* directions optional */ }
}

function showPreview() {
  const modal = document.getElementById('preview-modal');
  const page = {
    ...state.page,
    title: document.getElementById('page-title').value,
    subtitle: document.getElementById('page-subtitle').value,
    cover_gradient: document.getElementById('page-gradient').value,
  };
  document.getElementById('preview-content').innerHTML = renderPage(page, { preview: true });
  modal.hidden = false;
}

async function load() {
  const data = await api(`/content/${targetType}/${targetId}/editor`);
  state = data;
  state.page = state.page || {
    title: state.meta.name,
    subtitle: '',
    cover_gradient: 'accent',
    is_published: false,
    sections: [{ title: 'Основний розділ', icon: 'book', blocks: [] }],
  };

  document.getElementById('builder-target-tag').textContent = state.meta.label;
  document.getElementById('builder-title').textContent = state.meta.name;
  document.getElementById('builder-back').href = targetType === 'group'
    ? '/admin.html?tab=groups'
    : targetType === 'manual'
      ? (isStaff ? '/admin.html?tab=manuals' : '/manuals.html')
      : '/admin.html?tab=directions';

  document.getElementById('page-title').value = state.page.title || state.meta.name;
  document.getElementById('page-subtitle').value = state.page.subtitle || '';
  document.getElementById('page-gradient').value = state.page.cover_gradient || 'accent';
  document.getElementById('builder-published').checked = !!state.page.is_published;

  if (targetType === 'manual') {
    manualMeta = await api(`/manuals/${targetId}`).then(r => r.manual).catch(() => null);
    await loadDirectionOptions(manualMeta?.direction_id || '');
    updateManualStatusUi();
  }

  renderPalette();
  renderCanvas();
  bindCanvasDelegation();
}

document.getElementById('page-manual-direction')?.addEventListener('change', async (e) => {
  try {
    const res = await api(`/manuals/${targetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ direction_id: e.target.value || null }),
    });
    manualMeta = res.manual;
    showToast('Напрямок оновлено');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('builder-submit-review-btn')?.addEventListener('click', submitForReview);

document.getElementById('builder-palette').addEventListener('click', (e) => {
  const btn = e.target.closest('.palette-btn');
  if (!btn) return;
  addBlock(btn.dataset.type);
});

document.getElementById('add-section-btn').addEventListener('click', () => {
  ensureSections();
  state.page.sections.push({ title: `Розділ ${state.page.sections.length + 1}`, icon: 'notes', blocks: [] });
  activeSectionIdx = state.page.sections.length - 1;
  renderCanvas();
});

document.getElementById('builder-save-btn').addEventListener('click', save);
document.getElementById('builder-preview-btn').addEventListener('click', showPreview);
document.getElementById('preview-close').addEventListener('click', () => {
  document.getElementById('preview-modal').hidden = true;
});
document.getElementById('preview-modal').addEventListener('click', (e) => {
  if (e.target.id === 'preview-modal') e.target.hidden = true;
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
});

load().catch((err) => {
  showToast(err.message || 'Помилка завантаження', 'error');
  setTimeout(() => { location.href = fallbackHref; }, 2000);
});
