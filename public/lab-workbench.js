// Pure, offline logic for the Lab "Tools" workbench.
// Every function here operates only on data the student pastes in themselves.
// Nothing opens a network connection, resolves a hostname, scans a port, or
// contacts any third-party system — this is a local analysis notebook built
// from well-known professional techniques (encoding, hashing, header/token
// inspection, OSINT-style text parsing, reverse-engineering primitives), not
// a scanner or an autonomous agent.

const PROJECTS_KEY = 'lab_workbench_projects_v1';

// --- Encoding & hashing ------------------------------------------------------

export function textToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary);
}

export function base64ToText(value) {
  const binary = atob(value.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function hexEncode(value) {
  return Array.from(new TextEncoder().encode(String(value)))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexDecode(value) {
  const clean = String(value).replace(/\s+/g, '');
  if (!clean.length || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) {
    throw new Error('очікується шістнадцятковий рядок парної довжини');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function rot13(value) {
  return String(value).replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const MULTI_HASH_ALGOS = [
  ['SHA-1', 'sha1'], ['SHA-256', 'sha256'], ['SHA-384', 'sha384'], ['SHA-512', 'sha512'],
];

// Computes several standard digests of pasted text at once. MD5 is
// intentionally omitted: the Web Crypto API does not implement it (it is
// considered broken for security use), so it is only covered by the
// identify-hash tool below for recognising hashes you already have.
export async function multiHash(value) {
  const bytes = new TextEncoder().encode(value);
  const out = {};
  for (const [algo, key] of MULTI_HASH_ALGOS) {
    // eslint-disable-next-line no-await-in-loop
    const digest = await crypto.subtle.digest(algo, bytes);
    out[key] = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return out;
}

const HASH_SIGNATURES = [
  { re: /^\$2[aby]\$\d{2}\$/, label: 'bcrypt' },
  { re: /^\$argon2(id|i|d)\$/, label: 'Argon2' },
  { re: /^\$6\$/, label: 'SHA-512crypt (Unix /etc/shadow)' },
  { re: /^\$5\$/, label: 'SHA-256crypt (Unix /etc/shadow)' },
  { re: /^\$1\$/, label: 'MD5crypt (Unix /etc/shadow, legacy)' },
  { re: /^[a-f0-9]{32}:[a-f0-9]{32}$/i, label: 'NTLM-пара (LM:NT)' },
  { re: /^[a-f0-9]{32}$/i, label: 'MD5 / NTLM / MD4 (32 hex-символи)' },
  { re: /^[a-f0-9]{40}$/i, label: 'SHA-1 (40 hex-символів)' },
  { re: /^[a-f0-9]{56}$/i, label: 'SHA-224 (56 hex-символів)' },
  { re: /^[a-f0-9]{64}$/i, label: 'SHA-256 (64 hex-символи)' },
  { re: /^[a-f0-9]{96}$/i, label: 'SHA-384 (96 hex-символів)' },
  { re: /^[a-f0-9]{128}$/i, label: 'SHA-512 (128 hex-символів)' },
];

// Pure pattern-matching on the shape of a hash string (length/charset/prefix)
// — a reference lookup, not a cracking tool.
export function identifyHash(value) {
  const clean = String(value).trim();
  const candidates = HASH_SIGNATURES.filter((sig) => sig.re.test(clean)).map((sig) => sig.label);
  return { input: clean, candidates: candidates.length ? candidates : ['Невідомий формат / це не схоже на хеш'] };
}

// --- HTTP / web ---------------------------------------------------------------

export function parseHeaders(raw) {
  return new Map(String(raw).split(/\r?\n/)
    .map((line) => line.match(/^\s*([^:]+)\s*:\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1].toLowerCase(), m[2]]));
}

export function analyzeHeaders(raw) {
  const headers = parseHeaders(raw);
  return [
    { label: 'Content-Security-Policy', ok: headers.has('content-security-policy') },
    { label: 'Strict-Transport-Security', ok: headers.has('strict-transport-security') },
    { label: 'X-Content-Type-Options: nosniff', ok: headers.get('x-content-type-options')?.toLowerCase() === 'nosniff' },
    {
      label: 'Захист від вбудовування (frame-ancestors або X-Frame-Options)',
      ok: headers.has('x-frame-options') || /frame-ancestors/i.test(headers.get('content-security-policy') || ''),
    },
    {
      label: 'Secure / HttpOnly у Set-Cookie (якщо є cookies)',
      ok: !headers.has('set-cookie')
        || (/;\s*secure/i.test(headers.get('set-cookie')) && /;\s*httponly/i.test(headers.get('set-cookie'))),
    },
  ];
}

// Parses a raw HTTP request or response dump (e.g. copied from DevTools or
// Burp/ZAP) into its structured parts. No request is sent — this only reads
// text already on the clipboard.
export function parseHttpMessage(raw) {
  const text = String(raw).replace(/\r\n/g, '\n');
  const split = text.indexOf('\n\n');
  const headPart = split === -1 ? text : text.slice(0, split);
  const body = split === -1 ? '' : text.slice(split + 2);
  const lines = headPart.split('\n').filter((l) => l.length);
  const startLine = lines[0] || '';
  const headers = parseHeaders(lines.slice(1).join('\n'));
  const reqMatch = startLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)\s+HTTP\/([\d.]+)/i);
  const resMatch = startLine.match(/^HTTP\/([\d.]+)\s+(\d{3})\s*(.*)$/);
  if (!reqMatch && !resMatch) throw new Error('не вдалося розпізнати стартовий рядок HTTP-запиту чи відповіді');
  return {
    requestLine: reqMatch ? { method: reqMatch[1].toUpperCase(), path: reqMatch[2], version: reqMatch[3] } : null,
    statusLine: resMatch ? { version: resMatch[1], status: Number(resMatch[2]), statusText: resMatch[3] } : null,
    headers: Object.fromEntries(headers),
    body: body || null,
  };
}

// Breaks a URL string into its components — pure string parsing via the
// `URL` constructor, never fetched or resolved.
export function parseUrlParts(raw) {
  const url = new URL(String(raw).trim());
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.hostname,
    port: url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : ''),
    path: url.pathname || '/',
    query: [...url.searchParams.entries()],
    hash: url.hash ? url.hash.slice(1) : '',
    origin: url.origin,
  };
}

const UA_BROWSERS = [
  [/Edg\/([\d.]+)/, 'Edge'],
  [/OPR\/([\d.]+)/, 'Opera'],
  [/YaBrowser\/([\d.]+)/, 'Yandex Browser'],
  [/Chrome\/([\d.]+)/, 'Chrome'],
  [/Firefox\/([\d.]+)/, 'Firefox'],
  [/Version\/([\d.]+).*Safari/, 'Safari'],
  [/MSIE ([\d.]+)/, 'Internet Explorer'],
];
const UA_OS = [
  [/Windows NT 10\.0/, 'Windows 10/11'],
  [/Windows NT/, 'Windows'],
  [/Mac OS X ([\d_]+)/, 'macOS'],
  [/Android ([\d.]+)/, 'Android'],
  [/i(?:Phone|Pad|Pod)/, 'iOS'],
  [/Linux/, 'Linux'],
];

// Heuristic, regex-based User-Agent breakdown (no external UA database/API
// call) — good enough to teach the structure of a UA string.
export function parseUserAgent(raw) {
  const s = String(raw);
  const browser = UA_BROWSERS.map(([re, name]) => {
    const m = s.match(re); return m ? { name, version: m[1] } : null;
  }).find(Boolean) || { name: 'Невідомо', version: null };
  const os = UA_OS.map(([re, name]) => (re.test(s) ? name : null)).find(Boolean) || 'Невідомо';
  const isBot = /bot|crawler|spider|curl|wget|python-requests|scrapy|httpclient/i.test(s);
  const isMobile = /Mobi|Android(?!.*Tablet)|iPhone/.test(s);
  return {
    browser, os, isBot, isMobile, raw: s,
  };
}

// --- OSINT-style text parsing (offline — no WHOIS/DNS lookups performed) ------

// Structures pasted WHOIS output into key/value pairs. The student must
// already have obtained this text themselves (e.g. from an authorised WHOIS
// query) — nothing here performs a lookup.
export function parseWhoisText(raw) {
  const fields = {};
  for (const line of String(raw).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z0-9 ._-]*?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const [, rawKey, value] = m;
    const key = rawKey.trim();
    if (!value || value.startsWith('%') || value.startsWith('#')) continue;
    if (fields[key] !== undefined) {
      fields[key] = Array.isArray(fields[key]) ? [...fields[key], value] : [fields[key], value];
    } else fields[key] = value;
  }
  return fields;
}

// Analyses pasted raw email headers for a phishing/OSINT triage: SPF/DKIM/
// DMARC results, Received-chain length, and a Reply-To/From mismatch hint.
// Purely text parsing of headers the student already has.
export function analyzeEmailHeaders(raw) {
  const text = String(raw);
  const headers = parseHeaders(text);
  const received = text.split(/\r?\n(?=\S)/).filter((l) => /^received\s*:/i.test(l.trim()));
  const authResults = headers.get('authentication-results') || '';
  const spf = (authResults.match(/spf=(\w+)/i) || headers.get('received-spf')?.match(/^(\w+)/))?.[1]?.toLowerCase() || null;
  const dkim = authResults.match(/dkim=(\w+)/i)?.[1]?.toLowerCase() || null;
  const dmarc = authResults.match(/dmarc=(\w+)/i)?.[1]?.toLowerCase() || null;
  const from = headers.get('from') || null;
  const replyTo = headers.get('reply-to') || null;
  const fromDomain = from?.match(/@([\w.-]+)/)?.[1]?.toLowerCase() || null;
  const replyToDomain = replyTo?.match(/@([\w.-]+)/)?.[1]?.toLowerCase() || null;
  const possibleSpoofHint = Boolean(fromDomain && replyToDomain && fromDomain !== replyToDomain);
  return {
    from, replyTo, spf, dkim, dmarc, possibleSpoofHint, receivedHops: received.length,
  };
}

export function calcCidr(raw) {
  const m = String(raw).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) throw new Error('очікується CIDR-запис, наприклад 192.168.1.0/24');
  const octets = m.slice(1, 5).map(Number);
  const prefix = Number(m[5]);
  if (octets.some((o) => o > 255) || prefix > 32) throw new Error('некоректний CIDR');
  const ipInt = (octets.reduce((acc, o) => acc * 256 + o, 0)) >>> 0;
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const network = (ipInt & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const toIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  const total = 2 ** (32 - prefix);
  return {
    network: toIp(network),
    broadcast: toIp(broadcast),
    mask: toIp(mask),
    prefix,
    firstHost: prefix >= 31 ? toIp(network) : toIp(network + 1),
    lastHost: prefix >= 31 ? toIp(broadcast) : toIp(Math.max(broadcast - 1, network)),
    totalAddresses: total,
    usableHosts: prefix >= 31 ? total : Math.max(total - 2, 0),
  };
}

const DEFAULT_SUBDOMAIN_WORDS = [
  'www', 'api', 'dev', 'staging', 'test', 'admin', 'mail', 'ftp', 'vpn', 'portal',
  'app', 'beta', 'git', 'cdn', 'static', 'blog', 'shop', 'm', 'auth', 'login',
];

// Generates a candidate subdomain wordlist by permutation only — it never
// resolves a single one of them. Useful as an input list for the student's
// own, separately-authorised DNS tooling; not a scanner itself.
export function generateSubdomainWordlist(baseDomain, extraWords = '') {
  const domain = String(baseDomain).trim().replace(/^https?:\/\//i, '').replace(/\/.*/, '');
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error('вкажіть базовий домен, наприклад example.com');
  const extra = String(extraWords).split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
  const words = [...new Set([...DEFAULT_SUBDOMAIN_WORDS, ...extra])];
  return words.map((w) => `${w}.${domain}`);
}

// --- Reverse engineering --------------------------------------------------

// Classic `strings`-style extractor: pulls printable runs out of a hex dump
// or raw text blob pasted by the student (e.g. from a local file they own).
export function extractStrings(raw, minLength = 4) {
  const stripped = String(raw).replace(/\s+/g, '');
  const isHex = stripped.length > 0 && stripped.length % 2 === 0 && /^[0-9a-f]+$/i.test(stripped);
  let bytes;
  if (isHex) {
    bytes = new Uint8Array(stripped.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(stripped.substr(i * 2, 2), 16);
  } else {
    bytes = new TextEncoder().encode(String(raw));
  }
  const min = Math.max(1, Number(minLength) || 4);
  const results = [];
  let current = '';
  for (const b of bytes) {
    if (b >= 32 && b < 127) current += String.fromCharCode(b);
    else { if (current.length >= min) results.push(current); current = ''; }
  }
  if (current.length >= min) results.push(current);
  return results;
}

function printableRatio(str) {
  if (!str.length) return 0;
  let printable = 0;
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    if ((c >= 32 && c < 127) || c === 9 || c === 10 || c === 13) printable += 1;
  }
  return printable / str.length;
}

// Single-byte XOR key brute force over a pasted hex blob (classic
// CTF/reverse-engineering technique). Returns the 10 most "readable"
// candidates ranked by printable-character ratio. Operates purely on bytes
// the student pasted — no file or network access involved.
export function xorBruteforce(hex) {
  const clean = String(hex).replace(/\s+/g, '');
  if (!clean.length || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) {
    throw new Error('очікується шістнадцятковий рядок парної довжини');
  }
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));
  const candidates = [];
  for (let key = 0; key < 256; key += 1) {
    const text = bytes.map((b) => String.fromCharCode(b ^ key)).join('');
    candidates.push({
      key, hex: key.toString(16).padStart(2, '0'), text, printableRatio: printableRatio(text),
    });
  }
  return candidates.sort((a, b) => b.printableRatio - a.printableRatio).slice(0, 10);
}

function looksBase64(s) { return /^[A-Za-z0-9+/_-]+={0,2}$/.test(s) && s.length % 4 === 0 && s.length >= 8; }
function looksHexString(s) { return /^[0-9a-f]+$/i.test(s) && s.length % 2 === 0 && s.length >= 4; }
function looksUrlEncoded(s) { return /%[0-9a-f]{2}/i.test(s); }
function isPrintableAscii(s) { return /^[\t\n\r\x20-\x7E]*$/.test(s); }

// Iteratively detects and decodes nested Base64/URL/hex layers of a pasted
// string, e.g. a Base64-encoded, URL-encoded payload found in a log. Stops
// as soon as a layer no longer decodes to something printable or no encoding
// is recognised. No network access; pure string transforms.
export function nestedDecode(raw, maxDepth = 6) {
  const layers = [{ encoding: 'оригінал', value: String(raw).trim() }];
  let current = layers[0].value;
  for (let i = 0; i < maxDepth; i += 1) {
    let advanced = false;
    if (looksUrlEncoded(current)) {
      try {
        const next = decodeURIComponent(current);
        if (next !== current && isPrintableAscii(next)) {
          layers.push({ encoding: 'url', value: next }); current = next; advanced = true;
        }
      } catch { /* not valid url-encoding */ }
    }
    if (!advanced && looksBase64(current)) {
      try {
        const next = base64ToText(current);
        if (next !== current && isPrintableAscii(next)) {
          layers.push({ encoding: 'base64', value: next }); current = next; advanced = true;
        }
      } catch { /* not valid base64 */ }
    }
    if (!advanced && looksHexString(current)) {
      try {
        const next = hexDecode(current);
        if (next !== current && isPrintableAscii(next)) {
          layers.push({ encoding: 'hex', value: next }); current = next; advanced = true;
        }
      } catch { /* not valid hex */ }
    }
    if (!advanced) break;
  }
  return layers;
}

// --- Tokens & authentication -------------------------------------------------

function b64urlDecode(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  return decodeURIComponent(atob(padded).split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
}

function b64urlFromBytes(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Decodes a JWT's header/payload for inspection. Does NOT verify the
// signature and must never be presented as proof the token is valid.
export function decodeJwt(token) {
  const parts = String(token).trim().split('.');
  if (parts.length < 2) throw new Error('not a JWT: expected header.payload(.signature)');
  const header = JSON.parse(b64urlDecode(parts[0]));
  const payload = JSON.parse(b64urlDecode(parts[1]));
  return { header, payload, hasSignature: parts.length === 3 && parts[2].length > 0 };
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

// Tests whether a JWT the student already holds was signed with one of a
// short, user-supplied list of candidate secrets (classic "weak HS256
// secret" check, à la jwt_tool). Purely local HMAC computation against a
// token you already have — it does not contact any server or attack a live
// system, and only HS256 is supported (asymmetric algorithms can't be
// checked this way without the private key).
export async function testJwtWeakSecret(token, wordlistText) {
  const parts = String(token).trim().split('.');
  if (parts.length !== 3) throw new Error('очікується підписаний JWT: header.payload.signature');
  const header = JSON.parse(b64urlDecode(parts[0]));
  const words = String(wordlistText).split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
  if (header.alg !== 'HS256') {
    return {
      alg: header.alg, tested: 0, found: null, supported: false,
    };
  }
  const signingInput = `${parts[0]}.${parts[1]}`;
  for (const word of words) {
    // eslint-disable-next-line no-await-in-loop
    const sig = b64urlFromBytes(await hmacSha256(word, signingInput));
    if (sig === parts[2]) {
      return {
        alg: header.alg, tested: words.length, found: word, supported: true,
      };
    }
  }
  return {
    alg: header.alg, tested: words.length, found: null, supported: true,
  };
}

// --- Defensive / blue-team analysis ------------------------------------------

const IOC_PATTERNS = {
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  url: /\bhttps?:\/\/[^\s"'<>]+/gi,
  domain: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi,
  md5: /\b[a-f0-9]{32}\b/gi,
  sha1: /\b[a-f0-9]{40}\b/gi,
  sha256: /\b[a-f0-9]{64}\b/gi,
};

// Extracts indicators of compromise from text the student pastes (e.g. a log
// excerpt they already have). Purely a string-processing utility: it never
// fetches a URL, resolves a domain, or pings an IP.
export function extractIocs(text) {
  const src = String(text);
  const uniq = (re) => [...new Set(src.match(re) || [])];
  const urls = uniq(IOC_PATTERNS.url);
  const emails = uniq(IOC_PATTERNS.email);
  const ips = uniq(IOC_PATTERNS.ipv4);
  const sha256 = uniq(IOC_PATTERNS.sha256);
  const sha1 = uniq(IOC_PATTERNS.sha1).filter((h) => !sha256.includes(h));
  const md5 = uniq(IOC_PATTERNS.md5).filter((h) => !sha1.includes(h) && !sha256.includes(h));
  const domainsRaw = uniq(IOC_PATTERNS.domain);
  const urlHosts = new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return null; } }));
  const domains = domainsRaw.filter((d) => !emails.some((e) => e.endsWith(d)) && !urlHosts.has(d));
  return {
    ips, domains, emails, urls, hashes: { md5, sha1, sha256 },
  };
}

const ATTACK_SIGNATURES = [
  { id: 'sqli', label: "Ознаки SQL-ін'єкції", re: /(\bUNION\b\s+\bSELECT\b|\bOR\b\s+['"]?1['"]?\s*=\s*['"]?1['"]?|'\s*OR\s*'|;--|\bDROP\s+TABLE\b|\bxp_cmdshell\b|\bSLEEP\s*\(\s*\d+\s*\))/gi },
  { id: 'xss', label: 'Ознаки XSS', re: /(<script[\s>]|onerror\s*=|onload\s*=|javascript:|<img[^>]+src\s*=\s*["']?javascript:)/gi },
  { id: 'traversal', label: 'Обхід каталогів (path traversal)', re: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/)/gi },
  { id: 'cmdi', label: "Ознаки командної ін'єкції", re: /(;\s*(rm|cat|wget|curl|nc|bash|sh)\s|\|\s*(whoami|id|uname)\b|`[^`]+`)/gi },
  { id: 'lfi', label: 'Local File Inclusion', re: /(\/etc\/passwd|boot\.ini|php:\/\/filter)/gi },
];

// Scans pasted log/report text for well-known attack signatures (SQLi, XSS,
// path traversal, command injection, LFI) — a defensive/triage helper, not a
// payload generator: it only flags patterns already present in text you
// supply.
export function detectAttackPatterns(text) {
  const src = String(text);
  return ATTACK_SIGNATURES
    .map((sig) => {
      const matches = [...src.matchAll(sig.re)].map((m) => m[0]);
      return {
        id: sig.id, label: sig.label, count: matches.length, samples: [...new Set(matches)].slice(0, 5),
      };
    })
    .filter((r) => r.count > 0);
}

export function testRegex(pattern, flags, text) {
  const re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  const matches = [...String(text).matchAll(re)].map((m) => ({ match: m[0], index: m.index, groups: m.slice(1) }));
  return { count: matches.length, matches: matches.slice(0, 200) };
}

// --- Tool catalogue -----------------------------------------------------------

export const TOOL_CATEGORIES = [
  { id: 'encoding', name: 'Кодування та хеші' },
  { id: 'web', name: 'Веб та HTTP' },
  { id: 'osint', name: 'OSINT та розвідка (офлайн)' },
  { id: 'reverse', name: 'Реверс-інжиніринг' },
  { id: 'auth', name: 'Токени та автентифікація' },
  { id: 'defense', name: 'Захисний аналіз' },
];

export const WORKBENCH_TOOLS = [
  { id: 'url', category: 'encoding', name: 'URL кодування', inputLabel: 'Текст або URL-компонент' },
  { id: 'base64', category: 'encoding', name: 'Base64', inputLabel: 'Текст' },
  { id: 'hex', category: 'encoding', name: 'Hex кодування', inputLabel: 'Текст' },
  { id: 'rot13', category: 'encoding', name: 'ROT13 / Caesar', inputLabel: 'Текст' },
  { id: 'hash', category: 'encoding', name: 'SHA-256', inputLabel: 'Текст для хешування' },
  { id: 'hash-multi', category: 'encoding', name: 'Хеш-калькулятор (SHA-1/256/384/512)', inputLabel: 'Текст для хешування' },
  { id: 'hash-identify', category: 'encoding', name: 'Визначення типу хешу', inputLabel: 'Вставте хеш' },
  { id: 'headers', category: 'web', name: 'Аналіз HTTP-заголовків', inputLabel: 'Вставте заголовки відповіді' },
  { id: 'http-request', category: 'web', name: 'Розбір HTTP-запиту/відповіді', inputLabel: 'Вставте повний HTTP-запит або відповідь' },
  { id: 'url-parse', category: 'web', name: 'Розбір URL', inputLabel: 'Вставте URL' },
  { id: 'user-agent', category: 'web', name: 'Аналіз User-Agent', inputLabel: 'Вставте рядок User-Agent' },
  { id: 'jwt', category: 'auth', name: 'JWT decoder', inputLabel: 'Вставте JWT-токен' },
  { id: 'jwt-weak-secret', category: 'auth', name: 'Перевірка слабкого секрету JWT (HS256)', inputLabel: 'Вставте JWT-токен' },
  { id: 'ioc', category: 'defense', name: 'Пошук індикаторів (IOC)', inputLabel: 'Вставте текст логів/звіту' },
  { id: 'attack-pattern', category: 'defense', name: 'Детектор атак у логах', inputLabel: 'Вставте текст логів/звіту' },
  { id: 'regex', category: 'defense', name: 'Тест регулярного виразу', inputLabel: 'Текст для перевірки' },
  { id: 'whois', category: 'osint', name: 'Розбір WHOIS-тексту', inputLabel: 'Вставте вивід WHOIS' },
  { id: 'email-header', category: 'osint', name: 'Аналіз заголовків листа', inputLabel: 'Вставте сирі заголовки листа' },
  { id: 'cidr', category: 'osint', name: 'CIDR-калькулятор', inputLabel: 'Наприклад, 192.168.1.0/24' },
  { id: 'subdomains', category: 'osint', name: 'Генератор піддоменів (вордлист)', inputLabel: 'Базовий домен, напр. example.com' },
  { id: 'strings', category: 'reverse', name: 'Витяг рядків (strings)', inputLabel: 'Hex-дамп або текстовий блок' },
  { id: 'xor', category: 'reverse', name: 'XOR brute-force (1 байт)', inputLabel: 'Hex-рядок' },
  { id: 'nested-decode', category: 'reverse', name: 'Автодекодер шарів (base64/url/hex)', inputLabel: 'Закодований рядок' },
];

// --- Project store (localStorage) -------------------------------------------

function migrateProject(project) {
  const createdAt = project.createdAt || Date.now();
  return {
    ...project,
    createdAt,
    updatedAt: project.updatedAt || createdAt,
    findings: Array.isArray(project.findings) ? project.findings : [],
  };
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECTS_KEY));
    if (raw && typeof raw === 'object' && raw.projects) {
      const projects = Object.fromEntries(
        Object.entries(raw.projects).map(([id, p]) => [id, migrateProject(p)]),
      );
      return { projects, activeId: raw.activeId || null };
    }
  } catch { /* corrupted or missing */ }
  return { projects: {}, activeId: null };
}

function saveStore(store) {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
}

export function createProject(store, name) {
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const project = {
    id, name: String(name || 'Проект').slice(0, 80), createdAt: now, updatedAt: now, findings: [],
  };
  return { projects: { ...store.projects, [id]: project }, activeId: id };
}

export function deleteProject(store, id) {
  const projects = { ...store.projects };
  delete projects[id];
  const ids = Object.keys(projects);
  const activeId = store.activeId === id ? (ids[0] || null) : store.activeId;
  return { projects, activeId };
}

export function renameProject(store, id, name) {
  if (!store.projects[id]) return store;
  const project = {
    ...store.projects[id], name: String(name || '').slice(0, 80) || store.projects[id].name, updatedAt: Date.now(),
  };
  return { ...store, projects: { ...store.projects, [id]: project } };
}

export function duplicateProject(store, id) {
  const source = store.projects[id];
  if (!source) return store;
  const newId = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const copy = {
    ...source, id: newId, name: `${source.name} (копія)`.slice(0, 80), createdAt: now, updatedAt: now,
  };
  return { projects: { ...store.projects, [newId]: copy }, activeId: newId };
}

export function addFinding(store, projectId, finding) {
  const project = store.projects[projectId];
  if (!project) return store;
  const entry = {
    id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now(), ...finding,
  };
  const updated = { ...project, findings: [entry, ...project.findings].slice(0, 500), updatedAt: Date.now() };
  return { ...store, projects: { ...store.projects, [projectId]: updated } };
}

export function removeFinding(store, projectId, findingId) {
  const project = store.projects[projectId];
  if (!project) return store;
  const updated = { ...project, findings: project.findings.filter((f) => f.id !== findingId), updatedAt: Date.now() };
  return { ...store, projects: { ...store.projects, [projectId]: updated } };
}

export const workbenchStore = { load: loadStore, save: saveStore };
