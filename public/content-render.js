import { icon, resolveIconName } from './icons.js';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function textToHtml(text) {
  return esc(text).replace(/\n/g, '<br>');
}

export function youtubeEmbed(url) {
  if (!url) return '';
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (!m) return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`;
  return `<div class="cb-video"><iframe src="https://www.youtube.com/embed/${m[1]}" allowfullscreen loading="lazy"></iframe></div>`;
}

export function renderCardIcon(value) {
  const name = resolveIconName(value);
  const ico = icon(name, 'ico ico--md cb-card-icon');
  return ico || `<span class="cb-card-emoji">${esc(name || 'pin-card')}</span>`;
}

export function renderSectionIcon(value) {
  const name = resolveIconName(value);
  const ico = icon(name, 'ico ico--md cb-section-icon-svg');
  return ico || `<span class="cb-section-icon">${esc(name)}</span>`;
}

export function renderBlock(block, { preview = false } = {}) {
  const d = block.data || {};
  const type = block.block_type;

  switch (type) {
    case 'heading': {
      const lvl = Math.min(3, Math.max(1, parseInt(d.level, 10) || 2));
      return `<h${lvl} class="cb-heading cb-heading--${lvl}">${esc(d.text || '')}</h${lvl}>`;
    }
    case 'text':
      return `<div class="cb-text">${textToHtml(d.text || '')}</div>`;
    case 'list': {
      const tag = d.style === 'number' ? 'ol' : 'ul';
      const items = (d.items || []).map(i => `<li>${esc(i)}</li>`).join('');
      return `<${tag} class="cb-list cb-list--${d.style || 'bullet'}">${items}</${tag}>`;
    }
    case 'image':
      if (!d.url) return preview ? '<div class="cb-empty">Додайте URL зображення</div>' : '';
      return `<figure class="cb-image">
        <img src="${esc(d.url)}" alt="${esc(d.alt || '')}" loading="lazy">
        ${d.caption ? `<figcaption>${esc(d.caption)}</figcaption>` : ''}
      </figure>`;
    case 'video':
      return youtubeEmbed(d.url) || (preview ? '<div class="cb-empty">Додайте YouTube URL</div>' : '');
    case 'link': {
      if (!d.url) return preview ? '<div class="cb-empty">Додайте посилання</div>' : '';
      const cls = d.style === 'outline' ? 'btn btn--outline' : 'btn btn--primary';
      return `<p class="cb-link-wrap"><a href="${esc(d.url)}" class="${cls}" target="_blank" rel="noopener">${esc(d.label || d.url)}</a></p>`;
    }
    case 'divider':
      return '<hr class="cb-divider">';
    case 'quote':
      return `<blockquote class="cb-quote">
        <p>${esc(d.text || '')}</p>
        ${d.author ? `<cite>— ${esc(d.author)}</cite>` : ''}
      </blockquote>`;
    case 'callout':
      return `<div class="cb-callout cb-callout--${esc(d.variant || 'info')}">
        ${d.title ? `<strong class="cb-callout-title">${esc(d.title)}</strong>` : ''}
        <p>${textToHtml(d.text || '')}</p>
      </div>`;
    case 'steps': {
      const items = (d.items || []).map((step, i) => `
        <li class="cb-step">
          <span class="cb-step-num">${i + 1}</span>
          <div>
            <strong>${esc(step.title || '')}</strong>
            <p>${textToHtml(step.text || '')}</p>
          </div>
        </li>`).join('');
      return `<ol class="cb-steps">${items}</ol>`;
    }
    case 'cards': {
      const items = (d.items || []).map(card => `
        <article class="cb-card">
          ${renderCardIcon(card.emoji)}
          <h4>${esc(card.title || '')}</h4>
          <p>${textToHtml(card.text || '')}</p>
        </article>`).join('');
      return `<div class="cb-cards">${items}</div>`;
    }
    default:
      return '';
  }
}

export function renderPage(page, { preview = false, hero = true } = {}) {
  if (!page) return '<p class="empty-state">Немає контенту</p>';
  const gradient = page.cover_gradient || 'accent';
  const sections = (page.sections || []).map(section => `
    <section class="cb-section">
      <header class="cb-section-head">
        ${section.icon ? renderSectionIcon(section.icon) : ''}
        <h2>${esc(section.title)}</h2>
      </header>
      <div class="cb-section-body">
        ${(section.blocks || []).map(b => `<div class="cb-block cb-block--${b.block_type}">${renderBlock(b, { preview })}</div>`).join('')}
      </div>
    </section>`).join('');

  const heroHtml = hero ? `
    <header class="cb-hero cb-hero--${esc(gradient)}">
      <div class="cb-hero-inner">
        <h1>${esc(page.title || '')}</h1>
        ${page.subtitle ? `<p class="cb-hero-sub">${esc(page.subtitle)}</p>` : ''}
      </div>
    </header>` : '';

  return `${heroHtml}
    <div class="cb-body">${sections || '<p class="empty-state">Додайте розділи та блоки</p>'}</div>`;
}

export const BLOCK_PALETTE = [
  { type: 'heading', label: 'Заголовок', icon: 'heading' },
  { type: 'text', label: 'Текст', icon: 'notes' },
  { type: 'list', label: 'Список', icon: 'list' },
  { type: 'image', label: 'Зображення', icon: 'image' },
  { type: 'video', label: 'Відео', icon: 'play' },
  { type: 'link', label: 'Кнопка', icon: 'link' },
  { type: 'quote', label: 'Цитата', icon: 'quote' },
  { type: 'callout', label: 'Підказка', icon: 'lightbulb' },
  { type: 'steps', label: 'Кроки', icon: 'target' },
  { type: 'cards', label: 'Картки', icon: 'pin-card' },
  { type: 'divider', label: 'Розділювач', icon: 'minus' },
];

export const GRADIENTS = [
  { id: 'accent', label: 'Акцент' },
  { id: 'purple', label: 'Фіолетовий' },
  { id: 'blue', label: 'Синій' },
  { id: 'green', label: 'Зелений' },
  { id: 'orange', label: 'Помаранчевий' },
];
