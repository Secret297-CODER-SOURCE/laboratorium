/**
 * Live search + HTML parse for spy-soft.net (WordPress reboot theme).
 * Pattern mirrors CTFtime calendar sync: external fetch, sanitize, structured results.
 */
const BASE = 'https://spy-soft.net';
const UA = 'laboratorium-manuals/1.0 (+https://laboratorium.club)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RESULTS = 12;

const cache = new Map();

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8212;/g, '—')
    .replace(/&#8211;/g, '–')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .trim();
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function cleanText(value, limit) {
  return stripTags(value).slice(0, limit);
}

function safeSpySoftUrl(href) {
  try {
    const url = new URL(String(href || ''), BASE);
    if (url.hostname !== 'spy-soft.net' && url.hostname !== 'www.spy-soft.net') return null;
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.href.slice(0, 1000);
  } catch {
    return null;
  }
}

function safeImageUrl(src) {
  try {
    const url = new URL(String(src || ''), BASE);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (!url.hostname.endsWith('spy-soft.net')) return null;
    return url.href.slice(0, 1000);
  } catch {
    return null;
  }
}

/** Parse WordPress search/listing HTML into article cards. */
export function parsePostCards(html) {
  const cards = [];
  const chunks = String(html || '').split(/<div class="post-card[\s"]/);
  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i].slice(0, 6000);
    const titleMatch = chunk.match(
      /post-card__title[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!titleMatch) continue;
    const href = safeSpySoftUrl(titleMatch[1]);
    const title = cleanText(titleMatch[2], 180);
    if (!href || !title) continue;

    const imgMatch = chunk.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    const descMatch = chunk.match(/post-card__description[^>]*>([\s\S]*?)<\/div>/i);
    const image = imgMatch ? safeImageUrl(imgMatch[1]) : null;
    const excerpt = descMatch ? cleanText(descMatch[1], 280) : '';

    cards.push({
      id: href,
      title,
      excerpt,
      url: href,
      image,
      source: 'spy-soft',
      source_label: 'spy-soft.net',
    });
    if (cards.length >= MAX_RESULTS) break;
  }
  // Dedupe by URL
  const seen = new Set();
  return cards.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

async function fetchHtml(url, fetchImpl, timeoutMs = 8000) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': UA,
      'Accept-Language': 'uk,ru;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`spy-soft.net HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 3_000_000) throw new Error('Відповідь spy-soft.net занадто велика');
  return body;
}

export async function searchSpySoft(rawQuery, { limit = 8, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const query = String(rawQuery || '').trim().slice(0, 80);
  if (query.length < 2) return { query, results: [], cached: false };

  const cacheKey = query.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return {
      query,
      results: hit.results.slice(0, Math.min(limit, MAX_RESULTS)),
      cached: true,
      source_url: `${BASE}/?s=${encodeURIComponent(query)}`,
    };
  }

  const html = await fetchHtml(`${BASE}/?s=${encodeURIComponent(query)}`, fetchImpl, timeoutMs);
  const parsed = parsePostCards(html);
  cache.set(cacheKey, { results: parsed, expiresAt: Date.now() + CACHE_TTL_MS });

  return {
    query,
    results: parsed.slice(0, Math.min(limit, MAX_RESULTS)),
    cached: false,
    source_url: `${BASE}/?s=${encodeURIComponent(query)}`,
  };
}

/** Lightweight homepage scrape for “featured” cards when query is empty. */
export async function listFeatured({ limit = 6, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const cacheKey = '__featured__';
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return { results: hit.results.slice(0, limit), cached: true };
  }
  const html = await fetchHtml(BASE, fetchImpl, timeoutMs);
  const parsed = parsePostCards(html);
  cache.set(cacheKey, { results: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
  return { results: parsed.slice(0, limit), cached: false };
}

export function clearSpySoftCache() {
  cache.clear();
}
