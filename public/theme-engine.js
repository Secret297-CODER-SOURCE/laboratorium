import { renderFavicon, initFavicon } from './favicon-engine.js';

const STORAGE_AUTO = 'lab-theme-auto';
const STORAGE_SYNC = 'lab-theme-sync';
const CHANNEL_NAME = 'lab-theme-channel';

export const PALETTE = [
  { id: 'green',  hex: '#00ff88', dim: '#00cc6a' },
  { id: 'blue',   hex: '#4da6ff', dim: '#3388dd' },
  { id: 'cyan',   hex: '#00e5ff', dim: '#00b8cc' },
  { id: 'purple', hex: '#b44dff', dim: '#9333dd' },
  { id: 'pink',   hex: '#ff44aa', dim: '#dd2288' },
  { id: 'red',    hex: '#ff3344', dim: '#dd2233' },
  { id: 'amber',  hex: '#ffaa00', dim: '#cc8800' },
  { id: 'lime',   hex: '#aaff00', dim: '#88cc00' },
];

let cycleRAF = null;
let currentIdx = 0;
let targetIdx = 1;
let lerpT = 0;
const LERP_SPEED = 0.0028;
let channel = null;

function smoothStep(t) {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpColor(c1, c2, t) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))}, ${Math.round(lerp(a[1], b[1], t))}, ${Math.round(lerp(a[2], b[2], t))})`;
}

function lerpDim(c1, c2, t) {
  return lerpColor(c1.dim, c2.dim, t);
}

function setFlowMode(on) {
  document.body.classList.toggle('theme-flow', on);
}

// Other on-page canvases (the homepage icosahedron) need the live accent
// color every frame too. Reading it back via getComputedStyle() right
// after this loop writes it forces a synchronous style recalculation —
// Lighthouse flags this as "forced reflow" — so it's exposed as a plain
// JS value instead; no DOM read required.
let currentAccentColor = 'rgb(0, 255, 136)';
export function getCurrentAccentColor() {
  return currentAccentColor;
}

function applyColors(accent, accentDim) {
  const root = document.documentElement;
  currentAccentColor = accent;
  const m = accent.match(/\d+/g).map(Number);
  const vars = {
    '--accent': accent,
    '--accent-dim': accentDim,
    '--accent-glow': `rgba(${m[0]}, ${m[1]}, ${m[2]}, 0.15)`,
    '--accent-glow-strong': `rgba(${m[0]}, ${m[1]}, ${m[2]}, 0.35)`,
    '--accent-subtle': `rgba(${m[0]}, ${m[1]}, ${m[2]}, 0.08)`,
    '--aurora-1': `rgba(${m[0]}, ${m[1]}, ${m[2]}, 0.12)`,
    '--aurora-2': `rgba(${m[0]}, ${m[1]}, ${m[2]}, 0.06)`,
  };
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }
  renderFavicon(accent, accentDim, lerpT);
}

// Cross-tab sync only needs to be roughly current, not per-frame — writing
// to sessionStorage and posting to a BroadcastChannel 60x/sec was pure
// wasted main-thread work for a feature that tolerates ~1s of drift.
const SYNC_SAVE_INTERVAL_MS = 1000;
let lastSyncSaveAt = 0;

function saveSyncState() {
  const now = Date.now();
  if (now - lastSyncSaveAt < SYNC_SAVE_INTERVAL_MS) return;
  lastSyncSaveAt = now;
  const state = { currentIdx, targetIdx, lerpT, ts: now };
  try {
    sessionStorage.setItem(STORAGE_SYNC, JSON.stringify(state));
    channel?.postMessage(state);
  } catch { /* ignore */ }
}

function restoreSyncState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_SYNC);
    if (!raw) return;
    const state = JSON.parse(raw);
    const elapsed = (Date.now() - (state.ts || 0)) / 1000;
    let { currentIdx: ci, targetIdx: ti, lerpT: lt } = state;
    let advance = elapsed * LERP_SPEED * 60;
    while (advance > 0) {
      const need = 1 - lt;
      if (advance >= need) {
        advance -= need;
        ci = ti;
        ti = (ti + 1) % PALETTE.length;
        lt = 0;
      } else {
        lt += advance;
        advance = 0;
      }
    }
    currentIdx = ci;
    targetIdx = ti;
    lerpT = lt;
  } catch { /* ignore */ }
}

function applySyncedState(state) {
  if (!state) return;
  currentIdx = state.currentIdx;
  targetIdx = state.targetIdx;
  lerpT = state.lerpT;
  const from = PALETTE[currentIdx];
  const to = PALETTE[targetIdx];
  const eased = smoothStep(lerpT);
  applyColors(lerpColor(from.hex, to.hex, eased), lerpDim(from, to, eased));
}

function cycleFrame() {
  lerpT += LERP_SPEED;
  if (lerpT >= 1) {
    lerpT = 0;
    currentIdx = targetIdx;
    targetIdx = (targetIdx + 1) % PALETTE.length;
  }
  const from = PALETTE[currentIdx];
  const to = PALETTE[targetIdx];
  const eased = smoothStep(lerpT);
  applyColors(lerpColor(from.hex, to.hex, eased), lerpDim(from, to, eased));
  // theme + flow-mode are set once in initTheme() — writing the same
  // dataset/class value on every frame is pure wasted work, not a no-op
  // browsers always skip.
  saveSyncState();
  cycleRAF = requestAnimationFrame(cycleFrame);
}

function initChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e) => applySyncedState(e.data);
}

export function initTheme() {
  localStorage.setItem(STORAGE_AUTO, '1');
  initFavicon();
  initChannel();
  restoreSyncState();
  setFlowMode(true);
  document.body.dataset.theme = 'flow';

  if (cycleRAF) cancelAnimationFrame(cycleRAF);
  cycleRAF = requestAnimationFrame(cycleFrame);
}

export function getAccentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00ff88';
}
