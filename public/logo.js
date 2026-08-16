export const LOGO_SVG = `<svg class="logo-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
  <polygon class="ico-face ico-face--1" points="20,4 35,12 35,28 20,36 5,28 5,12"/>
  <polygon class="ico-face ico-face--2" points="20,4 35,12 20,20 5,12"/>
  <polygon class="ico-face ico-face--3" points="20,36 35,28 20,20 5,28"/>
  <line class="ico-edge" x1="20" y1="4" x2="20" y2="36"/>
  <line class="ico-edge" x1="5" y1="12" x2="35" y2="28"/>
  <line class="ico-edge" x1="35" y1="12" x2="5" y2="28"/>
</svg>`;

export function renderLogo(href = '/portal.html') {
  return `<a href="${href}" class="logo">${LOGO_SVG}<span class="logo-text">laboratorium<em>.</em></span></a>`;
}
