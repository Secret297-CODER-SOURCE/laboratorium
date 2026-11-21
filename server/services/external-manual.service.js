/**
 * Fetch + sanitize external tutorial HTML for in-app reading
 * (spy-soft.net posts, DigitalOcean Community tutorials).
 */
import { ValidationError, NotFoundError } from '../utils/errors.js';

const UA = 'laboratorium-manuals/1.0 (+https://laboratorium.club)';
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_HTML = 800_000;
const cache = new Map();

const ALLOWED_HOSTS = new Set([
  'spy-soft.net',
  'www.spy-soft.net',
  'www.digitalocean.com',
  'digitalocean.com',
]);

function decodeEntities(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function normalizeExternalUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new ValidationError('Некоректне посилання на мануал');
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new ValidationError('Дозволені лише http(s) посилання');
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new ValidationError('Цей мануал недоступний для перегляду');
  }
  url.hash = '';
  // Force https
  url.protocol = 'https:';
  if (url.hostname === 'digitalocean.com') url.hostname = 'www.digitalocean.com';
  if (url.hostname === 'www.spy-soft.net') url.hostname = 'spy-soft.net';
  return url;
}

function safeHref(href, base) {
  try {
    const u = new URL(String(href || ''), base);
    if (!['https:', 'http:', 'mailto:'].includes(u.protocol)) return null;
    if (u.protocol.startsWith('http') && !ALLOWED_HOSTS.has(u.hostname)
      && !u.hostname.endsWith('digitalocean.com')
      && !u.hostname.endsWith('spy-soft.net')
      && !u.hostname.endsWith('wp.com')
      && !u.hostname.endsWith('cloudfront.net')
      && !u.hostname.endsWith('githubusercontent.com')
      && !u.hostname.endsWith('github.com')
      && !u.hostname.endsWith('nginx.com')) {
      // Keep common doc/image CDNs & outbound article links as https text links
      if (!['https:', 'http:'].includes(u.protocol)) return null;
    }
    return u.href.slice(0, 2000);
  } catch {
    return null;
  }
}

function safeSrc(src, base) {
  try {
    const u = new URL(String(src || ''), base);
    if (!['https:', 'http:', 'data:'].includes(u.protocol)) return null;
    if (u.protocol === 'data:' && !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u.href)) return null;
    return u.href.slice(0, 2000);
  } catch {
    return null;
  }
}

/** Allowlist HTML tags/attrs for reader view. */
export function sanitizeArticleHtml(rawHtml, baseUrl) {
  let html = String(rawHtml || '');
  // Drop dangerous blocks first
  html = html
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|base|svg|math)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|base|svg|math)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, '');

  // Rewrite tags through a simple tokenizer
  html = html.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, tag, attrs = '') => {
    const name = tag.toLowerCase();
    const allowed = new Set([
      'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'em', 'strong', 'b', 'i', 'u',
      'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'sup', 'sub', 'del', 'ins', 'kbd', 'mark',
    ]);
    if (!allowed.has(name)) return '';
    if (full.startsWith('</')) return `</${name}>`;

    const selfClosing = name === 'br' || name === 'hr' || name === 'img';
    let outAttrs = '';

    if (name === 'a') {
      const hrefMatch = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = safeHref(hrefMatch?.[2] || hrefMatch?.[3] || hrefMatch?.[4] || '', baseUrl);
      if (href) outAttrs += ` href="${href.replace(/"/g, '&quot;')}" rel="noopener noreferrer" target="_blank"`;
      else return '';
    }
    if (name === 'img') {
      const srcMatch = attrs.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const altMatch = attrs.match(/\salt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const src = safeSrc(srcMatch?.[2] || srcMatch?.[3] || srcMatch?.[4] || '', baseUrl);
      if (!src) return '';
      const alt = stripTags(altMatch?.[2] || altMatch?.[3] || altMatch?.[4] || '').slice(0, 200);
      outAttrs += ` src="${src.replace(/"/g, '&quot;')}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" referrerpolicy="no-referrer"`;
    }
    if (name === 'pre' || name === 'code') {
      const classMatch = attrs.match(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/i);
      const cls = (classMatch?.[2] || classMatch?.[3] || '').replace(/[^a-zA-Z0-9_\- ]/g, '').slice(0, 80);
      if (cls) outAttrs += ` class="${cls}"`;
    }

    return selfClosing ? `<${name}${outAttrs}>` : `<${name}${outAttrs}>`;
  });

  // Collapse leftover empty wrappers noise
  return html.replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_HTML);
}

/** Minimal Markdown → HTML for DO tutorials. */
export function markdownToHtml(md) {
  let text = String(md || '').replace(/\r\n/g, '\n');

  // Fenced code blocks
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const safe = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cls = lang ? ` class="language-${lang.replace(/[^a-z0-9_-]/gi, '')}"` : '';
    return `\n<pre><code${cls}>${safe}</code></pre>\n`;
  });

  // Headings
  text = text.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, title) => {
    const level = hashes.length;
    return `<h${level}>${inlineMd(title)}</h${level}>`;
  });

  // Horizontal rules
  text = text.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '<hr>');

  // Blockquotes
  text = text.replace(/(?:^|\n)((?:>\s?.+\n?)+)/g, (_, block) => {
    const inner = block.replace(/^>\s?/gm, '').trim();
    return `\n<blockquote>${inlineMd(inner)}</blockquote>\n`;
  });

  // Unordered lists
  text = text.replace(/(?:^|\n)((?:[-*+]\s+.+(?:\n|$))+)/g, (_, block) => {
    const items = block.trim().split(/\n/).map((line) => {
      const m = line.match(/^[-*+]\s+(.+)$/);
      return m ? `<li>${inlineMd(m[1])}</li>` : '';
    }).join('');
    return `\n<ul>${items}</ul>\n`;
  });

  // Ordered lists
  text = text.replace(/(?:^|\n)((?:\d+\.\s+.+(?:\n|$))+)/g, (_, block) => {
    const items = block.trim().split(/\n/).map((line) => {
      const m = line.match(/^\d+\.\s+(.+)$/);
      return m ? `<li>${inlineMd(m[1])}</li>` : '';
    }).join('');
    return `\n<ol>${items}</ol>\n`;
  });

  // Paragraphs
  text = text.split(/\n{2,}/).map((chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|table|p)\b/i.test(trimmed)) return trimmed;
    return `<p>${inlineMd(trimmed.replace(/\n/g, '<br>'))}</p>`;
  }).join('\n');

  return text;
}

function inlineMd(text) {
  let s = String(text || '');
  // Escape raw HTML first except we allow through already-converted tags from fences
  if (!s.includes('<pre>') && !s.includes('<code') && !s.includes('<h')) {
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => {
    const safe = safeSrc(src, 'https://www.digitalocean.com/');
    if (!safe) return alt;
    return `<img src="${safe}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" referrerpolicy="no-referrer">`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
    const safe = safeHref(href, 'https://www.digitalocean.com/');
    if (!safe) return label;
    return `<a href="${safe}" rel="noopener noreferrer" target="_blank">${label}</a>`;
  });
  s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return s;
}

function extractBetween(html, startRe, endRe) {
  const start = html.search(startRe);
  if (start < 0) return '';
  const from = html.slice(start);
  const openEnd = from.indexOf('>');
  const body = from.slice(openEnd + 1);
  const end = body.search(endRe);
  return end >= 0 ? body.slice(0, end) : body.slice(0, 200_000);
}

function parseSpySoftArticle(html, url) {
  const title = stripTags(
    (html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
      || html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      || [])[1] || '',
  ).slice(0, 240);

  let content = extractBetween(
    html,
    /<div[^>]+class="[^"]*entry-content[^"]*"/i,
    /<div[^>]+class="[^"]*entry-social|<footer|<aside|<!--\s*\.?entry/i,
  );
  if (!content) {
    content = extractBetween(html, /<article\b/i, /<\/article>/i);
  }
  if (!content) throw new NotFoundError('Не вдалося витягнути текст мануала');

  // Remove related posts / share widgets leftovers
  content = content
    .replace(/<div[^>]+class="[^"]*(?:sharedaddy|jp-relatedposts|entry-meta|post-tags)[^"]*"[\s\S]*?(?=<div[^>]+class="|$)/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '');

  const image = safeSrc(
    (html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || [])[1] || '',
    url.href,
  );

  return {
    title: title || 'Мануал',
    excerpt: stripTags(content).slice(0, 220),
    html: sanitizeArticleHtml(content, url.href),
    image,
  };
}

async function fetchText(url, fetchImpl, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json',
      'User-Agent': UA,
      'Accept-Language': 'uk,ru;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 6_000_000) throw new Error('Відповідь занадто велика');
  return { body, contentType: response.headers.get('content-type') || '' };
}

async function fetchDigitalOcean(url, fetchImpl, timeoutMs) {
  const slug = url.pathname.split('/').filter(Boolean).pop();
  if (!slug) throw new ValidationError('Некоректне посилання на мануал');

  // Prefer JSON API (markdown body)
  try {
    const apiUrl = `https://www.digitalocean.com/api/static-content/v1/tutorials/${encodeURIComponent(slug)}`;
    const { body } = await fetchText(apiUrl, fetchImpl, timeoutMs);
    const data = JSON.parse(body);
    if (data?.title && data?.content) {
      const html = sanitizeArticleHtml(markdownToHtml(data.content), url.href);
      return {
        title: stripTags(data.title).slice(0, 240),
        excerpt: stripTags(data.description || '').slice(0, 220),
        html,
        image: safeSrc(data.header_url || '', url.href),
      };
    }
  } catch {
    // fall through
  }

  throw new NotFoundError('Мануал не знайдено');
}

export async function fetchExternalManual(rawUrl, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const url = normalizeExternalUrl(rawUrl);
  const cacheKey = url.href;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return { ...hit.payload, cached: true };
  }

  let article;
  if (url.hostname.endsWith('digitalocean.com')) {
    if (!url.pathname.includes('/community/')) {
      throw new ValidationError('Доступні лише Community tutorials');
    }
    article = await fetchDigitalOcean(url, fetchImpl, timeoutMs);
  } else {
    const { body } = await fetchText(url.href, fetchImpl, timeoutMs);
    article = parseSpySoftArticle(body, url);
  }

  if (!article.html || article.html.length < 40) {
    throw new NotFoundError('Порожній вміст мануала');
  }

  const payload = {
    title: article.title,
    excerpt: article.excerpt || '',
    html: article.html,
    image: article.image || null,
    url: url.href,
  };
  cache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return { ...payload, cached: false };
}

export function clearExternalManualCache() {
  cache.clear();
}

/** Interleave two arrays so sources feel mixed. */
export function interleave(a = [], b = []) {
  const out = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

export function toCatalogCard(item) {
  return {
    title: item.title,
    excerpt: item.excerpt || '',
    image: item.image || null,
    url: item.url,
    href: `/manual.html?url=${encodeURIComponent(item.url)}`,
    tags: (item.tags || []).slice(0, 3),
  };
}
