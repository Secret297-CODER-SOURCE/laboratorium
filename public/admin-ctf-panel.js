import { api } from '/auth.js';
import { icon } from '/icons.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const CATEGORIES = [
  { value: 'web', label: 'Web' },
  { value: 'network', label: 'Network / Pwn' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'forensics', label: 'Forensics' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'osint', label: 'OSINT' },
  { value: 'misc', label: 'Misc' },
];

function helpPanelHtml() {
  return `<details class="ctf-help-panel">
    <summary class="ico-inline">${icon('book', 'ico ico--sm')}Як створити CTF-завдання</summary>
    <div class="ctf-help-body">
      <p><strong>CTF vs теорія.</strong> Прапорець «CTF (стадії + flag)» вмикає режим змагання: учень бачить ланцюжок стадій і вводить flag за бали. Без нього завдання — проста «теорія» без прапорів.</p>
      <p><strong>Стадії.</strong> Одне завдання = ланцюжок стадій по порядку. У кожної своя назва, опис, flag і бали. Наступна стадія відкривається учню лише після розв'язання попередньої. Просте однокрокове завдання — це ланцюжок з однієї стадії.</p>
      <p><strong>Flag.</strong> Формат за замовчуванням — <code>lab{...}</code>. Flag хешується одразу після збереження і ніде більше не показується. При редагуванні залиште поле flag порожнім, щоб лишити старий, або введіть новий, щоб замінити.</p>
      <p><strong>Підказки.</strong> «Ціна підказки» списується з балів лише тієї стадії, де підказку відкрили — якщо учень підказкою не скористався, бали за стадію не зменшуються.</p>
      <p><strong>Docker-стенд.</strong> Docker image і порт — спільні на все завдання, не на окрему стадію: або одне живе середовище для всіх стадій (напр. одна VM: user → root), або взагалі без інфраструктури — суто текстова умова, з якої випливає flag (як у «Crypto Warm-up»). Поле можна лишити порожнім.</p>
      <p><strong>Категорія і складність.</strong> Орієнтовні бали: easy 50–100, medium 100–150, hard 150–250 (за стадію, або сумарно для одностадійного завдання).</p>
      <p><strong>Редагування.</strong> Текст, підказки і flag можна міняти будь-коли. Стадію, яку вже пройшов хоча б один учень, видалити не можна — лише відредагувати.</p>
    </div>
  </details>`;
}

function stageRowHtml(s = {}) {
  const hasFlag = !!s.has_flag;
  return `
    <div class="ctf-stage-row" data-stage-id="${s.id || ''}">
      <div class="ctf-stage-row-head">
        <span class="ctf-stage-tag">${icon('target', 'ico ico--sm')}Стадія</span>
        <button type="button" class="btn btn--ghost btn--sm ctf-stage-remove" title="Прибрати стадію">${icon('x', 'ico ico--sm')}</button>
      </div>
      <input class="admin-inp ctf-stage-title" placeholder="Назва стадії" value="${esc(s.title || '')}">
      <textarea class="admin-inp ctf-stage-desc" rows="2" placeholder="Опис / умова стадії">${esc(s.description || '')}</textarea>
      <div class="ctf-stage-grid">
        <input class="admin-inp ctf-stage-flag" placeholder="${hasFlag ? 'flag (залиште порожнім щоб не змінювати)' : 'flag (lab{...})'}">
        <input class="admin-inp ctf-stage-points" type="number" min="1" placeholder="Бали" value="${s.points ?? 50}">
      </div>
      <div class="ctf-stage-grid">
        <input class="admin-inp ctf-stage-hint" placeholder="Підказка (необов'язково)" value="${esc(s.hint_text || '')}">
        <input class="admin-inp ctf-stage-hint-cost" type="number" min="0" placeholder="Ціна підказки" value="${s.hint_cost ?? 0}">
      </div>
    </div>`;
}

export function renderCtfPanel(challenges = [], programs = []) {
  const progOpts = programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const categoryOpts = CATEGORIES.map(c => `<option value="${c.value}">${esc(c.label)}</option>`).join('');

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('shield', 'ico ico--md')}CTF / Завдання</h2>
      <button type="button" class="btn btn--outline btn--sm" id="ctf-add-toggle">${icon('plus', 'ico ico--sm')}Додати CTF</button>
    </div>

    ${helpPanelHtml()}

    <input type="search" class="admin-inp admin-search" id="ctf-admin-search" placeholder="Пошук за назвою, описом, категорією...">

    <div id="ctf-create-form" class="admin-inline-form ctf-create-form" hidden>
      <input type="hidden" id="ctf-edit-id">
      <input class="admin-inp" id="ctf-title" placeholder="Назва">
      <input class="admin-inp" id="ctf-slug" placeholder="slug (необов'язково)">
      <select class="admin-inp" id="ctf-program"><option value="">Програма (необов'язково)</option>${progOpts}</select>
      <select class="admin-inp" id="ctf-category">${categoryOpts}</select>
      <select class="admin-inp" id="ctf-difficulty">
        <option value="easy">easy</option>
        <option value="medium" selected>medium</option>
        <option value="hard">hard</option>
      </select>
      <input class="admin-inp" id="ctf-docker" placeholder="Docker image (необов'язково)">
      <input class="admin-inp" id="ctf-port" type="number" value="80" placeholder="Порт контейнера">
      <input class="admin-inp" id="ctf-time" type="number" placeholder="Ліміт хв (необов'язково)">
      <textarea class="admin-inp" id="ctf-desc" rows="2" placeholder="Загальний опис завдання"></textarea>
      <label class="admin-check"><input type="checkbox" id="ctf-enabled" checked> CTF (стадії + flag), інакше — теорія</label>

      <div class="ctf-stages-head">
        <strong class="ico-inline">${icon('list', 'ico ico--sm')}Стадії</strong>
        <span class="ctf-stages-total" id="ctf-stages-total">0 балів</span>
        <button type="button" class="btn btn--ghost btn--sm" id="ctf-stage-add">${icon('plus', 'ico ico--sm')}Додати стадію</button>
      </div>
      <div id="ctf-stages"></div>

      <div class="ctf-form-actions">
        <button type="button" class="btn btn--primary btn--sm" id="ctf-create-btn">Створити</button>
        <button type="button" class="btn btn--ghost btn--sm" id="ctf-cancel-btn">Скасувати</button>
      </div>
    </div>

    <div class="ctf-admin-list">
      ${challenges.length ? challenges.map(c => `
        <article class="ctf-admin-item" data-id="${c.id}">
          <div class="ctf-admin-main">
            <strong>${esc(c.title)}</strong>
            <span class="difficulty difficulty--${c.difficulty}">${c.difficulty}</span>
            <span class="ctf-category-badge">${esc(c.category || 'misc')}</span>
            ${c.ctf_enabled ? `<span class="sched-badge">${c.stage_count || 1} ст.</span>` : '<span class="sched-badge">theory</span>'}
            <div class="ctf-admin-meta">${esc(c.program_name || '—')} · +${c.bounty_reward} pts · ${esc(c.docker_image || 'без Docker')}${c.author_handle ? ` · @${esc(c.author_handle)}` : ''}</div>
            <p class="ctf-admin-desc">${esc(c.description || '')}</p>
          </div>
          <div class="ctf-admin-actions">
            <button type="button" class="btn btn--ghost btn--sm ctf-edit" data-id="${c.id}" title="Редагувати">${icon('edit', 'ico ico--sm')}</button>
            <button type="button" class="btn btn--ghost btn--sm ctf-del" data-id="${c.id}" title="Видалити">${icon('trash', 'ico ico--sm')}</button>
          </div>
        </article>`).join('') : '<p class="empty-state">Немає CTF. Додайте перший стенд.</p>'}
    </div>
  </section>`;
}

export function bindCtfPanelEvents(challenges = [], showToast, reload) {
  const form = document.getElementById('ctf-create-form');
  const stagesContainer = document.getElementById('ctf-stages');
  const totalEl = document.getElementById('ctf-stages-total');

  document.getElementById('ctf-admin-search')?.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.ctf-admin-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.hidden = !!query && !text.includes(query);
    });
  });

  if (!form || !stagesContainer) return;

  function recalcTotal() {
    const total = [...stagesContainer.querySelectorAll('.ctf-stage-points')]
      .reduce((sum, inp) => sum + (parseInt(inp.value, 10) || 0), 0);
    totalEl.textContent = `${total} балів`;
  }

  function addStageRow(stage = {}) {
    stagesContainer.insertAdjacentHTML('beforeend', stageRowHtml(stage));
    const row = stagesContainer.lastElementChild;
    row.querySelector('.ctf-stage-remove').addEventListener('click', () => {
      if (stagesContainer.children.length <= 1) return showToast('Потрібна хоча б одна стадія', 'error');
      row.remove();
      recalcTotal();
    });
    row.querySelector('.ctf-stage-points').addEventListener('input', recalcTotal);
    recalcTotal();
  }

  function resetForm() {
    document.getElementById('ctf-edit-id').value = '';
    document.getElementById('ctf-title').value = '';
    document.getElementById('ctf-slug').value = '';
    document.getElementById('ctf-program').value = '';
    document.getElementById('ctf-category').value = 'misc';
    document.getElementById('ctf-difficulty').value = 'medium';
    document.getElementById('ctf-docker').value = '';
    document.getElementById('ctf-port').value = 80;
    document.getElementById('ctf-time').value = '';
    document.getElementById('ctf-desc').value = '';
    document.getElementById('ctf-enabled').checked = true;
    document.getElementById('ctf-create-btn').textContent = 'Створити';
    stagesContainer.innerHTML = '';
    addStageRow();
  }

  document.getElementById('ctf-add-toggle')?.addEventListener('click', () => {
    const willShow = form.hidden;
    form.hidden = !form.hidden;
    if (willShow && !stagesContainer.children.length) resetForm();
  });

  document.getElementById('ctf-stage-add')?.addEventListener('click', () => addStageRow());
  document.getElementById('ctf-cancel-btn')?.addEventListener('click', () => { form.hidden = true; });

  function collectStages() {
    return [...stagesContainer.querySelectorAll('.ctf-stage-row')].map(row => ({
      id: row.dataset.stageId || undefined,
      title: row.querySelector('.ctf-stage-title').value,
      description: row.querySelector('.ctf-stage-desc').value,
      flag: row.querySelector('.ctf-stage-flag').value,
      points: row.querySelector('.ctf-stage-points').value,
      hint_text: row.querySelector('.ctf-stage-hint').value,
      hint_cost: row.querySelector('.ctf-stage-hint-cost').value,
    }));
  }

  document.getElementById('ctf-create-btn')?.addEventListener('click', async () => {
    const editId = document.getElementById('ctf-edit-id').value;
    const payload = {
      title: document.getElementById('ctf-title').value,
      slug: document.getElementById('ctf-slug').value,
      program_id: document.getElementById('ctf-program').value || null,
      category: document.getElementById('ctf-category').value,
      difficulty: document.getElementById('ctf-difficulty').value,
      docker_image: document.getElementById('ctf-docker').value,
      target_port: document.getElementById('ctf-port').value,
      time_limit_minutes: document.getElementById('ctf-time').value || null,
      description: document.getElementById('ctf-desc').value,
      ctf_enabled: document.getElementById('ctf-enabled').checked,
      stages: collectStages(),
    };
    try {
      if (editId) {
        await api(`/admin/challenges/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast('CTF оновлено');
      } else {
        await api('/admin/challenges', { method: 'POST', body: JSON.stringify(payload) });
        showToast('CTF створено');
      }
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.ctf-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const challenge = challenges.find(c => String(c.id) === String(id));
      if (!challenge) return showToast('Завдання не знайдено', 'error');
      try {
        const { stages } = await api(`/admin/challenges/${id}/stages`);

        form.hidden = false;
        document.getElementById('ctf-edit-id').value = id;
        document.getElementById('ctf-title').value = challenge.title || '';
        document.getElementById('ctf-slug').value = challenge.slug || '';
        document.getElementById('ctf-program').value = challenge.program_id || '';
        document.getElementById('ctf-category').value = challenge.category || 'misc';
        document.getElementById('ctf-difficulty').value = challenge.difficulty || 'medium';
        document.getElementById('ctf-docker').value = challenge.docker_image || '';
        document.getElementById('ctf-port').value = challenge.target_port || 80;
        document.getElementById('ctf-time').value = challenge.time_limit_minutes || '';
        document.getElementById('ctf-desc').value = challenge.description || '';
        document.getElementById('ctf-enabled').checked = !!challenge.ctf_enabled;
        document.getElementById('ctf-create-btn').textContent = 'Зберегти';

        stagesContainer.innerHTML = '';
        (stages?.length ? stages : [{}]).forEach(s => addStageRow(s));
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  document.querySelectorAll('.ctf-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити CTF?')) return;
      try {
        await api(`/admin/challenges/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

export async function loadCtfAdminData() {
  const [{ challenges }, { programs }] = await Promise.all([
    api('/admin/challenges'),
    api('/programs'),
  ]);
  return { challenges: challenges || [], programs: programs || [] };
}
