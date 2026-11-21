/**
 * DigitalOcean Community tutorials search via public static-content API
 * (+ Atom feed fallback for featured listing).
 */
const BASE = 'https://www.digitalocean.com';
const SEARCH_API = `${BASE}/api/static-content/v1/search`;
const FEED_URL = `${BASE}/rss/community/tutorials.atom`;
const TUTORIALS_URL = `${BASE}/community/tutorials`;
const UA = 'laboratorium-manuals/1.0 (+https://laboratorium.club)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RESULTS = 12;

const cache = new Map();

function unwrapCdata(text) {
  return String(text || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeEntities(text) {
  return unwrapCdata(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeEntities(unwrapCdata(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function cleanText(value, limit) {
  return stripTags(value).slice(0, limit);
}

function safeDoUrl(href) {
  try {
    const url = new URL(String(href || ''), BASE);
    if (url.hostname !== 'www.digitalocean.com' && url.hostname !== 'digitalocean.com') return null;
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (!url.pathname.startsWith('/community/')) return null;
    url.hash = '';
    url.search = '';
    return url.href.slice(0, 1000);
  } catch {
    return null;
  }
}

function mapHit(hit) {
  const url = safeDoUrl(hit?.permalink || hit?.url);
  const title = cleanText(hit?.title, 200);
  if (!url || !title) return null;
  const tags = Array.isArray(hit?.tags) ? hit.tags.map((t) => cleanText(t, 40)).filter(Boolean) : [];
  const authors = Array.isArray(hit?.authors) ? hit.authors.map((a) => cleanText(a, 60)).filter(Boolean) : [];
  return {
    id: url,
    title,
    excerpt: cleanText(hit?.summary || '', 280),
    url,
    image: null,
    tags,
    authors,
    source: 'digitalocean',
    source_label: 'DigitalOcean',
  };
}

export function parseSearchHits(payload) {
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];
  const cards = [];
  const seen = new Set();
  for (const hit of hits) {
    // Prefer real tutorials; allow conceptual articles under /community/
    if (hit?.type && hit.type !== 'tutorial') continue;
    const card = mapHit(hit);
    if (!card || seen.has(card.url)) continue;
    seen.add(card.url);
    cards.push(card);
    if (cards.length >= MAX_RESULTS) break;
  }
  return cards;
}

/** Parse Atom feed entries for featured/latest tutorials. */
export function parseAtomFeed(xml) {
  const cards = [];
  const seen = new Set();
  const entries = String(xml || '').split(/<entry[\s>]/i).slice(1);
  for (const raw of entries) {
    const chunk = raw.slice(0, 4000);
    const titleMatch = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = chunk.match(/<link[^>]+href="([^"]+)"/i);
    const summaryMatch = chunk.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    const title = cleanText(titleMatch?.[1], 200);
    const url = safeDoUrl(linkMatch?.[1]);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    cards.push({
      id: url,
      title,
      excerpt: cleanText(summaryMatch?.[1], 280),
      url,
      image: null,
      tags: [],
      authors: [],
      source: 'digitalocean',
      source_label: 'DigitalOcean',
    });
    if (cards.length >= MAX_RESULTS) break;
  }
  return cards;
}

async function fetchJson(url, fetchImpl, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`digitalocean.com HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 3_000_000) throw new Error('Відповідь DigitalOcean занадто велика');
  return JSON.parse(body);
}

async function fetchText(url, fetchImpl, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/atom+xml, application/xml, text/xml, */*',
      'User-Agent': UA,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`digitalocean.com HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 6_000_000) throw new Error('Відповідь DigitalOcean занадто велика');
  return body;
}

export async function searchDigitalOcean(rawQuery, {
  limit = 8,
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const query = String(rawQuery || '').trim().slice(0, 80);
  if (query.length < 2) return { query, results: [], cached: false };

  const cacheKey = `q:${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return {
      query,
      results: hit.results.slice(0, Math.min(limit, MAX_RESULTS)),
      cached: true,
      source_url: `${TUTORIALS_URL}?q=${encodeURIComponent(query)}`,
    };
  }

  const url = `${SEARCH_API}?${new URLSearchParams({
    query,
    type: 'tutorial',
    page: '0',
    hitsPerPage: String(Math.min(20, MAX_RESULTS * 2)),
  })}`;
  const payload = await fetchJson(url, fetchImpl, timeoutMs);
  const parsed = parseSearchHits(payload);
  cache.set(cacheKey, { results: parsed, expiresAt: Date.now() + CACHE_TTL_MS });

  return {
    query,
    results: parsed.slice(0, Math.min(limit, MAX_RESULTS)),
    cached: false,
    source_url: `${TUTORIALS_URL}?q=${encodeURIComponent(query)}`,
  };
}

export async function listFeatured({ limit = 6, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const cacheKey = '__featured__';
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return { results: hit.results.slice(0, limit), cached: true, source_url: TUTORIALS_URL };
  }

  try {
    const payload = await fetchJson(
      `${SEARCH_API}?${new URLSearchParams({
        query: '',
        type: 'tutorial',
        page: '0',
        hitsPerPage: String(Math.min(20, MAX_RESULTS)),
        sortBy: 'newest',
      })}`,
      fetchImpl,
      timeoutMs,
    );
    const parsed = parseSearchHits(payload);
    if (parsed.length) {
      cache.set(cacheKey, { results: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
      return { results: parsed.slice(0, limit), cached: false, source_url: TUTORIALS_URL };
    }
  } catch {
    // fall through to Atom feed
  }

  const xml = await fetchText(FEED_URL, fetchImpl, timeoutMs);
  const parsed = parseAtomFeed(xml);
  cache.set(cacheKey, { results: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
  return { results: parsed.slice(0, limit), cached: false, source_url: TUTORIALS_URL };
}

export function clearDigitalOceanCache() {
  cache.clear();
}
