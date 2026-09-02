function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderDialog({
  title, message, bodyHtml, buttons, cancelValue, focusId, selectOnFocus,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';
    overlay.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true">
        ${title ? `<h3 class="app-dialog-title">${esc(title)}</h3>` : ''}
        ${message ? `<p class="app-dialog-message">${esc(message)}</p>` : ''}
        ${bodyHtml || ''}
        <div class="app-dialog-actions"></div>
      </div>`;
    document.body.appendChild(overlay);

    const dialog = overlay.querySelector('.app-dialog');
    const actionsEl = overlay.querySelector('.app-dialog-actions');

    function finish(value) {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('is-visible');
      setTimeout(() => overlay.remove(), 180);
      resolve(value);
    }

    buttons.forEach((def) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn--${def.variant} btn--sm`;
      btn.textContent = def.label;
      btn.addEventListener('click', () => finish(typeof def.value === 'function' ? def.value() : def.value));
      actionsEl.appendChild(btn);
    });

    function onKey(e) {
      if (e.key === 'Escape') { finish(cancelValue); return; }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        const primary = buttons.find((b) => b.primary);
        if (primary) finish(typeof primary.value === 'function' ? primary.value() : primary.value);
      }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(cancelValue); });

    requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
      const focusEl = focusId ? document.getElementById(focusId) : actionsEl.querySelector('.btn--primary');
      focusEl?.focus();
      if (selectOnFocus) focusEl?.select?.();
    });

    dialog.__finish = finish;
  }).then((value) => value);
}

/** Замінює window.alert — стилізоване модальне вікно з однією кнопкою. */
export function showAlert(message, { title = null, okText = 'Гаразд' } = {}) {
  return renderDialog({
    title,
    message,
    buttons: [{ label: okText, variant: 'primary', primary: true, value: undefined }],
    cancelValue: undefined,
  });
}

/** Замінює window.confirm — повертає true/false. */
export function showConfirm(message, {
  title = null, confirmText = 'Так', cancelText = 'Скасувати', danger = false,
} = {}) {
  return renderDialog({
    title,
    message,
    buttons: [
      { label: cancelText, variant: 'ghost', value: false },
      { label: confirmText, variant: danger ? 'danger' : 'primary', primary: true, value: true },
    ],
    cancelValue: false,
  });
}

/** Замінює window.prompt — повертає введений текст або null при скасуванні. */
export function showPrompt(message, defaultValue = '', {
  title = null, placeholder = '', okText = 'Гаразд', cancelText = 'Скасувати', multiline = false,
} = {}) {
  const inputId = `app-dialog-input-${Math.random().toString(36).slice(2)}`;
  const bodyHtml = multiline
    ? `<textarea id="${inputId}" class="app-dialog-input" rows="3" placeholder="${esc(placeholder)}">${esc(defaultValue)}</textarea>`
    : `<input id="${inputId}" class="app-dialog-input" type="text" value="${esc(defaultValue)}" placeholder="${esc(placeholder)}">`;

  return renderDialog({
    title,
    message,
    bodyHtml,
    buttons: [
      { label: cancelText, variant: 'ghost', value: null },
      { label: okText, variant: 'primary', primary: true, value: () => document.getElementById(inputId)?.value ?? null },
    ],
    cancelValue: null,
    focusId: inputId,
    selectOnFocus: true,
  });
}

/** Показує значення (пароль, посилання) у полі, що можна скопіювати одним кліком. */
export function showCopyDialog(message, value, { title = null, okText = 'Закрити' } = {}) {
  const inputId = `app-dialog-copy-${Math.random().toString(36).slice(2)}`;
  const bodyHtml = `
    <div class="app-dialog-copy-row">
      <input id="${inputId}" class="app-dialog-input" type="text" value="${esc(value)}" readonly>
      <button type="button" class="btn btn--outline btn--sm app-dialog-copy-btn">Копіювати</button>
    </div>`;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';
    overlay.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true">
        ${title ? `<h3 class="app-dialog-title">${esc(title)}</h3>` : ''}
        ${message ? `<p class="app-dialog-message">${esc(message)}</p>` : ''}
        ${bodyHtml}
        <div class="app-dialog-actions">
          <button type="button" class="btn btn--primary btn--sm app-dialog-ok">${esc(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    function finish() {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('is-visible');
      setTimeout(() => overlay.remove(), 180);
      resolve();
    }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') finish(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(); });
    overlay.querySelector('.app-dialog-ok').addEventListener('click', finish);
    overlay.querySelector('.app-dialog-copy-btn').addEventListener('click', async (e) => {
      const input = overlay.querySelector(`#${inputId}`);
      try {
        await navigator.clipboard.writeText(value);
        e.target.textContent = 'Скопійовано!';
      } catch {
        input.select();
        document.execCommand('copy');
        e.target.textContent = 'Скопійовано!';
      }
      setTimeout(() => { e.target.textContent = 'Копіювати'; }, 1500);
    });

    requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
      const input = document.getElementById(inputId);
      input?.focus();
      input?.select();
    });
  });
}

/**
 * A small multi-field form dialog — text inputs and/or <select> dropdowns.
 * Resolves with { fieldId: value, ... } on submit, or null on cancel.
 * fields: [{ id, label, type: 'text'|'select', value, placeholder, options: [{value,label}] }]
 */
export function showForm(title, fields, { message = null, okText = 'Гаразд', cancelText = 'Скасувати' } = {}) {
  const uid = Math.random().toString(36).slice(2);
  const fieldId = (f) => `app-dialog-form-${uid}-${f.id}`;

  const bodyHtml = `<div class="app-dialog-form">${fields.map((f) => {
    const fid = fieldId(f);
    if (f.type === 'select') {
      return `<label class="app-dialog-field">${esc(f.label)}
        <select id="${fid}" class="app-dialog-input">
          ${(f.options || []).map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
      </label>`;
    }
    return `<label class="app-dialog-field">${esc(f.label)}
      <input id="${fid}" class="app-dialog-input" type="text" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}">
    </label>`;
  }).join('')}</div>`;

  return renderDialog({
    title,
    message,
    bodyHtml,
    buttons: [
      { label: cancelText, variant: 'ghost', value: null },
      {
        label: okText,
        variant: 'primary',
        primary: true,
        value: () => Object.fromEntries(fields.map((f) => [f.id, document.getElementById(fieldId(f))?.value ?? null])),
      },
    ],
    cancelValue: null,
    focusId: fieldId(fields[0]),
  });
}
