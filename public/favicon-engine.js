const SIZE = 128;
const EMBLEM_SCALE = 1.28;
const CENTER = 20;
let canvas;
let ctx;
let faviconLink;
let lastDataUrl = '';

const FACES = [
  [[20, 4], [35, 12], [35, 28], [20, 36], [5, 28], [5, 12]],
  [[20, 4], [35, 12], [20, 20], [5, 12]],
  [[20, 36], [35, 28], [20, 20], [5, 28]],
];

const EDGES = [
  [[20, 4], [20, 36]],
  [[5, 12], [35, 28]],
  [[35, 12], [5, 28]],
];

function parseRgb(color) {
  const m = String(color || '').match(/\d+/g);
  if (!m || m.length < 3) return [0, 255, 136];
  return m.slice(0, 3).map(Number);
}

function rgba(color, alpha) {
  const [r, g, b] = parseRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ensureFaviconLink() {
  if (faviconLink) return faviconLink;
  faviconLink = document.querySelector('link#site-favicon')
    || document.querySelector('link[rel="icon"]');
  if (!faviconLink) {
    faviconLink = document.createElement('link');
    faviconLink.id = 'site-favicon';
    faviconLink.rel = 'icon';
    faviconLink.type = 'image/png';
    document.head.appendChild(faviconLink);
  }
  return faviconLink;
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  ctx = canvas.getContext('2d');
}

function strokePoly(points, color, width, alpha) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.stroke();
}

function strokeLine(a, b, color, width, alpha) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.stroke();
}

/**
 * @param {string} accent — rgb(...) з theme-engine
 * @param {number} flow — lerpT 0..1, синхронно з переливом емблеми
 */
export function renderFavicon(accent, accentDim, flow = 0) {
  ensureCanvas();
  const link = ensureFaviconLink();
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, flow)));
  const px = SIZE / 40;
  const half = SIZE / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);

  const glow = ctx.createRadialGradient(half, half, 0, half, half, 22 * px);
  glow.addColorStop(0, rgba(accent, 0.22 + eased * 0.28));
  glow.addColorStop(0.55, rgba(accentDim || accent, 0.08 + eased * 0.1));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.setTransform(
    px * EMBLEM_SCALE, 0, 0, px * EMBLEM_SCALE,
    half - CENTER * px * EMBLEM_SCALE,
    half - CENTER * px * EMBLEM_SCALE,
  );
  const stroke = rgba(accent, 0.55 + eased * 0.2);
  const edge = rgba(accent, 0.32 + eased * 0.15);

  for (const face of FACES) strokePoly(face, stroke, 1, 1);
  for (const [a, b] of EDGES) strokeLine(a, b, edge, 0.75, 1);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;

  const dataUrl = canvas.toDataURL('image/png');
  if (dataUrl === lastDataUrl) return;
  lastDataUrl = dataUrl;
  link.type = 'image/png';
  link.href = dataUrl;
}

export function initFavicon() {
  ensureFaviconLink();
  ensureCanvas();
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const accentDim = getComputedStyle(document.documentElement).getPropertyValue('--accent-dim').trim();
  renderFavicon(accent, accentDim, 0);
}
