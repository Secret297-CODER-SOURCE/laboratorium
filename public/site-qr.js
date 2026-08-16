import { getAccentColor } from '/theme-engine.js';

function hexToParam(hex) {
  const h = String(hex || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(h) ? encodeURIComponent(h) : encodeURIComponent('#00ff88');
}

export function initSiteQr({ siteUrl = 'https://laboratorium.club' } = {}) {
  const img = document.getElementById('site-qr');
  const link = document.getElementById('site-qr-link');
  if (!img) return;

  const accent = getAccentColor?.() || '#00ff88';
  const url = encodeURIComponent(siteUrl);
  const color = hexToParam(accent);
  img.src = `/api/qr?url=${url}&size=280&format=png&color=${color}`;
  img.addEventListener('error', () => {
    img.src = `/api/qr?url=${url}&size=280&format=png`;
  }, { once: true });
  img.addEventListener('error', () => {
    img.src = '/assets/qr-laboratorium.png';
  }, { once: true });

  if (link) {
    link.href = siteUrl;
    const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const domain = link.querySelector('.qr-card-domain');
    const copyUrl = document.querySelector('.qr-copy-url');
    if (domain) domain.textContent = host;
    if (copyUrl) copyUrl.textContent = host;
  }
}
