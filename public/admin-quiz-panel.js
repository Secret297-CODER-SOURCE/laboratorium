import { api } from '/auth.js';
import { icon } from '/icons.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function questionBlock(idx = 0) {
  return `<div class="quiz-q-block" data-q-idx="${idx}">
    <input class="admin-inp quiz-q-text" placeholder="Питання ${idx + 1}">
    <div class="quiz-q-options">
      <label><input type="radio" name="correct-${idx}" value="0" ${idx === 0 ? 'checked' : ''}> <input class="admin-inp quiz-opt" placeholder="Варіант A"></label>
      <label><input type="radio" name="correct-${idx}" value="1"> <input class="admin-inp quiz-opt" placeholder="Варіант B"></label>
      <label><input type="radio" name="correct-${idx}" value="2"> <input class="admin-inp quiz-opt" placeholder="Варіант C"></label>
      <label><input type="radio" name="correct-${idx}" value="3"> <input class="admin-inp quiz-opt" placeholder="Варіант D"></label>
    </div>
  </div>`;
}

export function renderQuizzesPanel(groups, quizzes = []) {
  const groupOpts = (groups || []).map(g =>
    `<option value="${g.id}">${esc(g.name)}</option>`).join('');

  return `<section class="admin-panel admin-panel--wide">
    <div class="admin-panel-head">
      <h2>${icon('notes', 'ico ico--md')}Тести для учнів</h2>
      <button type="button" class="btn btn--outline btn--sm" id="quiz-add-toggle">${icon('plus', 'ico ico--sm')}Новий тест</button>
    </div>
    <div id="quiz-create-form" class="quiz-create-form" hidden>
      <div class="quiz-create-grid">
        <input class="admin-inp" id="quiz-title" placeholder="Назва тесту">
        <select class="admin-inp" id="quiz-group" required><option value="">Група</option>${groupOpts}</select>
        <input class="admin-inp" id="quiz-pass" type="number" min="1" max="100" value="70" placeholder="Прохідний %">
        <input class="admin-inp" id="quiz-bounty" type="number" value="50" placeholder="Bounty">
        <input class="admin-inp" id="quiz-time" type="number" placeholder="Ліміт хв (необов'язково)">
        <textarea class="admin-inp" id="quiz-desc" rows="2" placeholder="Опис"></textarea>
      </div>
      <div id="quiz-questions">${questionBlock(0)}</div>
      <div class="quiz-create-actions">
        <button type="button" class="btn btn--outline btn--sm" id="quiz-add-q">${icon('plus', 'ico ico--sm')}Питання</button>
        <button type="button" class="btn btn--primary btn--sm" id="quiz-create-btn">Опублікувати тест</button>
      </div>
    </div>
    <div class="quiz-admin-list">
      ${quizzes.length ? quizzes.map(q => `
        <article class="quiz-admin-item">
          <div>
            <strong>${esc(q.title)}</strong>
            <div class="quiz-admin-meta">${esc(q.group_name || '')} · ${q.question_count} пит. · прохід ${q.pass_percent}% · +${q.bounty_reward} pts · ${q.attempts_count || 0} спроб</div>
            ${q.description ? `<p class="quiz-admin-desc">${esc(q.description)}</p>` : ''}
          </div>
          <button type="button" class="btn btn--ghost btn--sm quiz-del" data-id="${q.id}">${icon('trash', 'ico ico--sm')}</button>
        </article>`).join('') : '<p class="empty-state">Ще немає тестів. Створіть перший для групи.</p>'}
    </div>
  </section>`;
}

export function bindQuizzesPanelEvents(showToast, reload) {
  let qCount = 1;

  document.getElementById('quiz-add-toggle')?.addEventListener('click', () => {
    const f = document.getElementById('quiz-create-form');
    if (f) f.hidden = !f.hidden;
  });

  document.getElementById('quiz-add-q')?.addEventListener('click', () => {
    const wrap = document.getElementById('quiz-questions');
    wrap?.insertAdjacentHTML('beforeend', questionBlock(qCount));
    qCount += 1;
  });

  document.getElementById('quiz-create-btn')?.addEventListener('click', async () => {
    const questions = [];
    document.querySelectorAll('.quiz-q-block').forEach((block, idx) => {
      const text = block.querySelector('.quiz-q-text')?.value?.trim();
      if (!text) return;
      const opts = [...block.querySelectorAll('.quiz-opt')].map((inp, oi) => ({
        id: String.fromCharCode(97 + oi),
        text: inp.value?.trim(),
        correct: block.querySelector(`input[name="correct-${block.dataset.qIdx}"]:checked`)?.value === String(oi),
      })).filter(o => o.text);
      if (opts.length >= 2) questions.push({ question_text: text, options: opts });
    });

    try {
      await api('/admin/quizzes', {
        method: 'POST',
        body: JSON.stringify({
          title: document.getElementById('quiz-title').value,
          group_id: document.getElementById('quiz-group').value,
          description: document.getElementById('quiz-desc').value,
          pass_percent: document.getElementById('quiz-pass').value,
          bounty_reward: document.getElementById('quiz-bounty').value,
          time_limit_minutes: document.getElementById('quiz-time').value || null,
          questions,
        }),
      });
      showToast('Тест опубліковано');
      reload();
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.querySelectorAll('.quiz-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити тест?')) return;
      try {
        await api(`/admin/quizzes/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('Тест видалено');
        reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

export async function loadQuizzesAdminData(groups) {
  const { quizzes } = await api('/admin/quizzes');
  return { quizzes: quizzes || [], groups: groups || [] };
}
