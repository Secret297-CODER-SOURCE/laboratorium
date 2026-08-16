/**
 * Hides ugly native spinners via CSS; optionally wraps wider number inputs
 * in .num-stepper with subtle themed step buttons.
 */

function parseStep(input) {
  const step = parseFloat(input.getAttribute('step'));
  return Number.isFinite(step) && step > 0 ? step : 1;
}

function clampValue(input, value) {
  const min = input.min !== '' ? parseFloat(input.min) : null;
  const max = input.max !== '' ? parseFloat(input.max) : null;
  if (min != null && !Number.isNaN(min)) value = Math.max(min, value);
  if (max != null && !Number.isNaN(max)) value = Math.min(max, value);
  return value;
}

function stepValue(input, direction) {
  const current = input.value === '' ? 0 : parseFloat(input.value);
  const base = Number.isFinite(current) ? current : 0;
  const next = clampValue(input, base + direction * parseStep(input));
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function shouldEnhance(input) {
  if (input.type !== 'number') return false;
  if (input.closest('.num-stepper')) return false;
  if (input.dataset.numPlain === 'true') return false;
  if (input.classList.contains('admin-inp--xs')) return false;
  if (input.classList.contains('admin-inp--sm')) return false;
  if (input.classList.contains('billing-day-inp')) return false;
  return true;
}

function wrapWithStepper(input) {
  const wrap = document.createElement('div');
  wrap.className = 'num-stepper';
  if (input.classList.contains('admin-inp')) wrap.classList.add('num-stepper--admin');

  const controls = document.createElement('div');
  controls.className = 'num-stepper__controls';

  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'num-stepper__btn num-stepper__btn--up';
  up.tabIndex = -1;
  up.setAttribute('aria-label', 'Збільшити');
  up.addEventListener('click', () => stepValue(input, 1));

  const down = document.createElement('button');
  down.type = 'button';
  down.className = 'num-stepper__btn num-stepper__btn--down';
  down.tabIndex = -1;
  down.setAttribute('aria-label', 'Зменшити');
  down.addEventListener('click', () => stepValue(input, -1));

  controls.append(up, down);
  input.parentNode.insertBefore(wrap, input);
  wrap.append(input, controls);
  input.dataset.numEnhanced = 'true';
}

export function enhanceNumberInputs(root = document) {
  root.querySelectorAll('input[type="number"]:not([data-num-enhanced])').forEach((input) => {
    if (shouldEnhance(input)) wrapWithStepper(input);
    else input.dataset.numEnhanced = 'plain';
  });
}

let observer;

export function initNumberInputs(root = document.body) {
  enhanceNumberInputs(root);

  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('input[type="number"]')) enhanceNumberInputs(node.parentElement || root);
        else enhanceNumberInputs(node);
      });
    }
  });

  observer.observe(root, { childList: true, subtree: true });
}
