import { randomBytes } from 'node:crypto';
import config from '../config/index.js';
import db from '../db/index.js';
import { ValidationError } from '../utils/errors.js';

const BOT_PATTERNS = [
  ['Googlebot', /googlebot/i],
  ['Bingbot', /bingbot/i],
  ['DuckDuckBot', /duckduckbot/i],
  ['YandexBot', /yandex(bot|images|video)?/i],
  ['GPTBot', /gptbot/i],
  ['ChatGPT-User', /chatgpt-user/i],
  ['ClaudeBot', /claudebot|claude-web/i],
  ['Meta-ExternalAgent', /facebookexternalhit|meta-externalagent/i],
  ['Twitterbot', /twitterbot/i],
  ['Other crawler', /\b(bot|crawler|spider|slurp)\b/i],
];

const TRACKED_EVENT_TYPES = new Set([
  'page_view',
  'click',
  'application_submitted',
  'registration',
  'login',
  'page_duration',
]);
const DURATION_BUCKETS = new Set(['under-10s', '10-30s', '30-120s', 'over-120s']);

function localPath(value, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  const parsed = new URL(value, 'https://local.invalid');
  return parsed.origin === 'https://local.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
}

function analyticsPath(value, fallback = '/') {
  const path = localPath(value, fallback);
  const parsed = new URL(path, 'https://local.invalid');
  if (parsed.pathname === '/course.html' && /^[1-9]\d{0,8}$/.test(parsed.searchParams.get('id') || '')) {
    return `${parsed.pathname}?id=${parsed.searchParams.get('id')}`;
  }
  if (parsed.pathname === '/dashboard.html') {
    const tab = parsed.searchParams.get('tab') || 'home';
    return ['home', 'ctf', 'tests', 'lab', 'code', 'article', 'manuals'].includes(tab)
      ? `${parsed.pathname}?tab=${tab}`
      : `${parsed.pathname}?tab=home`;
  }
  const section = (parsed.searchParams.get('section') || parsed.hash.slice(1)).toLowerCase();
  if (parsed.pathname === '/' && ['programs', 'about', 'contact', 'bounty', 'faq'].includes(section)) {
    return `/?section=${section}`;
  }
  if (['/', '/index.html', '/login.html', '/register.html'].includes(parsed.pathname)) return parsed.pathname;
  return '/other';
}

function shortText(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function analyticsDimension(value, max = 120) {
  const text = shortText(value, max);
  return /^[a-zA-Z0-9._:-]*$/.test(text) ? text : '';
}

function clickDetail(value) {
  if (typeof value !== 'string') return '';
  if (value.startsWith('/')) return analyticsPath(value);
  return analyticsDimension(value, 100);
}

function recordAggregate({
  eventType, path = '', source = '', medium = '', campaign = '',
  content = '', campaignCode = '', detail = '', botName = '',
}) {
  db.prepare(`
    INSERT INTO analytics_daily_aggregates (
      day, event_type, path, source, medium, campaign, content,
      campaign_code, detail, bot_name, count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(day, event_type, path, source, medium, campaign, content, campaign_code, detail, bot_name)
    DO UPDATE SET count = count + 1
  `).run(
    new Date().toISOString().slice(0, 10),
    eventType,
    path,
    source,
    medium,
    campaign,
    content,
    campaignCode,
    detail,
    botName,
  );
}

export function recordBotRequest(path, userAgent) {
  const bot = BOT_PATTERNS.find(([, pattern]) => pattern.test(String(userAgent || '')))?.[0];
  if (!bot) return false;
  recordAggregate({ eventType: 'bot_crawl', path: analyticsPath(path), botName: bot });
  return true;
}

export function recordEvent(input = {}, client = null) {
  const eventType = input.event_type;
  if (!TRACKED_EVENT_TYPES.has(eventType)) {
    throw new ValidationError('Некоректна аналітична подія');
  }
  const durationBucket = eventType === 'page_duration' ? input.detail : '';
  if (eventType === 'page_duration' && !DURATION_BUCKETS.has(durationBucket)) {
    throw new ValidationError('Некоректний діапазон часу');
  }
  const campaignCodeInput = shortText(input.campaign_code, 32).toUpperCase();
  const campaignCode = /^[A-Z0-9]{6,32}$/.test(campaignCodeInput)
    && db.prepare('SELECT code FROM campaign_links WHERE code = ? AND is_active = 1')
      .get(campaignCodeInput)?.code || '';

  let source = analyticsDimension(input.source, 100);
  let medium = analyticsDimension(input.medium, 100);
  if (!source && typeof input.referrer === 'string') {
    try {
      const referrer = new URL(input.referrer);
      const current = new URL(config.siteUrl);
      if (referrer.protocol === 'http:' || referrer.protocol === 'https:') {
        if (referrer.hostname !== current.hostname) {
          source = analyticsDimension(referrer.hostname, 100);
          medium = 'referral';
        }
      }
    } catch { /* Invalid referrers are ignored. */ }
  }

  const detail = eventType === 'page_duration'
    ? durationBucket
    : eventType === 'click'
      ? clickDetail(input.detail)
      : '';
  recordAggregate({
    eventType,
    path: analyticsPath(input.path),
    source,
    medium,
    campaign: analyticsDimension(input.campaign, 120),
    content: analyticsDimension(input.content, 120),
    campaignCode,
    detail,
  });
  if (client && eventType !== 'page_duration') {
    let referrerHost = '';
    try { referrerHost = new URL(input.referrer).hostname.slice(0, 100); } catch { /* No referrer. */ }
    recordAccess({
      eventType,
      client,
      path: analyticsPath(input.path),
      source,
      medium,
      campaign: analyticsDimension(input.campaign, 120),
      referrerHost,
    });
  }
  return { ok: true };
}

export const ACCESS_RETENTION_DAYS = 90;
const ACCESS_SORT = {
  created_at: 'created_at', ip: 'ip', device: 'device', os: 'os', browser: 'browser',
  path: 'path', source: 'source', event_type: 'event_type',
};

export function parseUserAgent(ua = '') {
  const text = String(ua);
  let os = 'Інша';
  if (/android/i.test(text)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(text)) os = 'iOS';
  else if (/windows/i.test(text)) os = 'Windows';
  else if (/mac os x|macintosh/i.test(text)) os = 'macOS';
  else if (/cros/i.test(text)) os = 'ChromeOS';
  else if (/linux/i.test(text)) os = 'Linux';
  let device = 'pc';
  if (os === 'Android') device = /mobile/i.test(text) ? 'android' : 'tablet';
  else if (os === 'iOS') device = /ipad/i.test(text) ? 'tablet' : 'ios';
  else if (os === 'Інша') device = 'other';
  let browser = 'Інший';
  if (/edg(e|a|ios)?\//i.test(text)) browser = 'Edge';
  else if (/opr\/|opera/i.test(text)) browser = 'Opera';
  else if (/firefox|fxios/i.test(text)) browser = 'Firefox';
  else if (/chrome|crios/i.test(text)) browser = 'Chrome';
  else if (/safari/i.test(text)) browser = 'Safari';
  return { device, os, browser };
}

export function normalizeIp(value) {
  const ip = String(value || '').replace(/^::ffff:/, '').trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : '';
}

export function recordAccess({ eventType, client, path, source, medium, campaign, referrerHost }) {
  const ua = parseUserAgent(client.userAgent);
  db.prepare(`
    INSERT INTO access_log (event_type, ip, device, os, browser, path, source, medium, campaign, referrer_host)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(eventType, normalizeIp(client.ip), ua.device, ua.os, ua.browser, path,
    source || '', medium || '', campaign || '', referrerHost || '');
  if (Math.random() < 0.01) {
    db.prepare("DELETE FROM access_log WHERE created_at < datetime('now', ?)")
      .run(`-${ACCESS_RETENTION_DAYS} days`);
  }
}

function accessFilter(query = {}) {
  const where = ['1=1'];
  const args = [];
  const days = Math.min(Math.max(parseInt(query.days, 10) || 30, 1), ACCESS_RETENTION_DAYS);
  where.push("created_at >= datetime('now', ?)");
  args.push(`-${days} days`);
  for (const key of ['device', 'event_type', 'os', 'browser']) {
    if (query[key]) { where.push(`${key} = ?`); args.push(String(query[key]).slice(0, 40)); }
  }
  if (query.source) {
    where.push("(source = ? OR (source = '' AND ? = 'direct'))");
    args.push(String(query.source).slice(0, 100), String(query.source).slice(0, 100));
  }
  if (query.q) {
    const like = `%${String(query.q).slice(0, 80).replace(/[%_\\]/g, ch => `\\${ch}`)}%`;
    where.push("(ip LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' OR source LIKE ? ESCAPE '\\' OR referrer_host LIKE ? ESCAPE '\\')");
    args.push(like, like, like, like);
  }
  return { sql: where.join(' AND '), args, days };
}

export function listAccessLog(query = {}) {
  const { sql, args } = accessFilter(query);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 25, 5), 100);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM access_log WHERE ${sql}`).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(parseInt(query.page, 10) || 1, 1), pages);
  const sort = ACCESS_SORT[query.sort] || 'created_at';
  const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
  const rows = db.prepare(`
    SELECT id, created_at, event_type, ip, device, os, browser, path, source, medium, campaign, referrer_host
    FROM access_log WHERE ${sql} ORDER BY ${sort} ${dir}, id DESC LIMIT ? OFFSET ?
  `).all(...args, pageSize, (page - 1) * pageSize);
  return { rows, total, page, pages, pageSize, retentionDays: ACCESS_RETENTION_DAYS };
}

export function getAccessStats(query = {}) {
  const { sql, args, days } = accessFilter({ days: query.days });
  const count = (column, limit = 8) => db.prepare(`
    SELECT CASE WHEN ${column} = '' THEN '—' ELSE ${column} END AS label, COUNT(*) AS value
    FROM access_log WHERE ${sql} GROUP BY ${column} ORDER BY value DESC LIMIT ${limit}
  `).all(...args);
  const daily = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS total,
      COUNT(DISTINCT ip) AS unique_ips,
      SUM(event_type = 'login') AS logins
    FROM access_log WHERE ${sql} GROUP BY day ORDER BY day
  `).all(...args);
  const totals = db.prepare(`
    SELECT COUNT(*) AS events, COUNT(DISTINCT ip) AS unique_ips,
      SUM(event_type = 'login') AS logins,
      SUM(event_type = 'page_view') AS page_views
    FROM access_log WHERE ${sql}
  `).get(...args);
  const sources = db.prepare(`
    SELECT CASE WHEN source = '' THEN 'direct' ELSE source END AS label, COUNT(*) AS value
    FROM access_log WHERE ${sql} GROUP BY label ORDER BY value DESC LIMIT 8
  `).all(...args);
  return {
    days,
    totals,
    daily,
    devices: count('device'),
    os: count('os'),
    browsers: count('browser'),
    events: count('event_type'),
    sources,
    retentionDays: ACCESS_RETENTION_DAYS,
  };
}

export function listCampaigns() {
  return db.prepare(`
    SELECT c.*,
      (SELECT COALESCE(SUM(count), 0) FROM analytics_daily_aggregates e WHERE e.campaign_code = c.code AND e.event_type = 'page_view')
        + (SELECT COUNT(*) FROM analytics_events e WHERE e.campaign_code = c.code AND e.event_type = 'page_view') AS visits,
      (SELECT COALESCE(SUM(count), 0) FROM analytics_daily_aggregates e WHERE e.campaign_code = c.code AND e.event_type = 'application_submitted')
        + (SELECT COUNT(*) FROM analytics_events e WHERE e.campaign_code = c.code AND e.event_type = 'application_submitted') AS applications
    FROM campaign_links c ORDER BY c.created_at DESC
  `).all().map(campaign => {
    const destination = new URL(campaign.destination, config.siteUrl);
    const params = new URLSearchParams({
      utm_source: campaign.source,
      utm_medium: campaign.medium,
      utm_campaign: campaign.campaign,
      ...(campaign.content ? { utm_content: campaign.content } : {}),
      campaign_code: campaign.code,
    });
    for (const [key, value] of params) destination.searchParams.set(key, value);
    return {
      ...campaign,
      is_active: !!campaign.is_active,
      url: destination.toString(),
    };
  });
}

export function createCampaign(input = {}, userId) {
  const label = shortText(input.label, 100);
  const source = shortText(input.source, 100);
  const medium = shortText(input.medium, 100);
  const campaign = shortText(input.campaign, 120);
  const content = shortText(input.content, 120);
  const destination = localPath(input.destination);
  if (!label || !source || !medium || !campaign) {
    throw new ValidationError('Вкажіть назву, source, medium і campaign');
  }
  const code = randomBytes(5).toString('hex').toUpperCase();
  db.prepare(`
    INSERT INTO campaign_links (code, label, source, medium, campaign, content, destination, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(code, label, source, medium, campaign, content || null, destination, userId);
  return listCampaigns().find(item => item.code === code);
}

export function setCampaignActive(id, active) {
  const result = db.prepare('UPDATE campaign_links SET is_active = ? WHERE id = ?')
    .run(active ? 1 : 0, id);
  if (!result.changes) throw new ValidationError('Кампанію не знайдено');
  return listCampaigns().find(item => item.id === Number(id));
}

export function getOwnerOverview({ year, month }) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2200 || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new ValidationError('Некоректний період');
  }
  const start = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const legacySummary = db.prepare(`
    SELECT
      SUM(event_type = 'page_view') AS page_views,
      SUM(event_type = 'application_submitted') AS applications,
      SUM(event_type = 'registration') AS registrations
    FROM analytics_events WHERE created_at >= ? AND created_at < ?
  `).get(start, end);
  const aggregateSummary = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'page_view' THEN count ELSE 0 END) AS page_views,
      SUM(CASE WHEN event_type = 'application_submitted' THEN count ELSE 0 END) AS applications,
      SUM(CASE WHEN event_type = 'registration' THEN count ELSE 0 END) AS registrations,
      SUM(CASE WHEN event_type = 'login' THEN count ELSE 0 END) AS logins,
      SUM(CASE WHEN event_type = 'click' THEN count ELSE 0 END) AS clicks
    FROM analytics_daily_aggregates WHERE day >= ? AND day < ?
  `).get(start, end);
  const legacySources = db.prepare(`
    SELECT COALESCE(source, 'direct') AS source, COALESCE(medium, '(none)') AS medium,
      COALESCE(campaign, '(none)') AS campaign,
      SUM(event_type = 'page_view') AS visits,
      SUM(event_type = 'application_submitted') AS applications
    FROM analytics_events WHERE created_at >= ? AND created_at < ?
      AND event_type IN ('page_view', 'application_submitted')
    GROUP BY source, medium, campaign
    ORDER BY visits DESC, applications DESC LIMIT 20
  `).all(start, end);
  const aggregateSources = db.prepare(`
    SELECT COALESCE(NULLIF(source, ''), 'direct') AS source,
      COALESCE(NULLIF(medium, ''), '(none)') AS medium,
      COALESCE(NULLIF(campaign, ''), '(none)') AS campaign,
      SUM(CASE WHEN event_type = 'page_view' THEN count ELSE 0 END) AS visits,
      SUM(CASE WHEN event_type = 'application_submitted' THEN count ELSE 0 END) AS applications
    FROM analytics_daily_aggregates WHERE day >= ? AND day < ?
      AND event_type IN ('page_view', 'application_submitted')
    GROUP BY source, medium, campaign
  `).all(start, end);
  const sourceMap = new Map();
  for (const row of [...legacySources, ...aggregateSources]) {
    const key = `${row.source}\u0000${row.medium}\u0000${row.campaign}`;
    const existing = sourceMap.get(key) || { ...row, visits: 0, applications: 0 };
    existing.visits += Number(row.visits || 0);
    existing.applications += Number(row.applications || 0);
    sourceMap.set(key, existing);
  }
  const sources = [...sourceMap.values()]
    .sort((a, b) => b.visits - a.visits || b.applications - a.applications)
    .slice(0, 20);
  const legacyBots = db.prepare(`
    SELECT bot_name, COUNT(*) AS requests FROM analytics_events
    WHERE event_type = 'bot_crawl' AND created_at >= ? AND created_at < ?
    GROUP BY bot_name ORDER BY requests DESC LIMIT 20
  `).all(start, end);
  const aggregateBots = db.prepare(`
    SELECT bot_name, SUM(count) AS requests FROM analytics_daily_aggregates
    WHERE event_type = 'bot_crawl' AND day >= ? AND day < ?
    GROUP BY bot_name
  `).all(start, end);
  const botMap = new Map();
  for (const row of [...legacyBots, ...aggregateBots]) {
    botMap.set(row.bot_name, (botMap.get(row.bot_name) || 0) + Number(row.requests || 0));
  }
  const bots = [...botMap].map(([bot_name, requests]) => ({ bot_name, requests }))
    .sort((a, b) => b.requests - a.requests).slice(0, 20);
  const pages = db.prepare(`
    SELECT path,
      SUM(CASE WHEN event_type = 'page_view' THEN count ELSE 0 END) AS views,
      SUM(CASE WHEN event_type = 'click' THEN count ELSE 0 END) AS clicks,
      SUM(CASE WHEN event_type = 'application_submitted' THEN count ELSE 0 END) AS applications
    FROM analytics_daily_aggregates WHERE day >= ? AND day < ?
      AND event_type IN ('page_view', 'click', 'application_submitted')
    GROUP BY path ORDER BY views DESC, clicks DESC LIMIT 20
  `).all(start, end);
  const durations = db.prepare(`
    SELECT detail AS bucket, SUM(count) AS views
    FROM analytics_daily_aggregates WHERE day >= ? AND day < ? AND event_type = 'page_duration'
    GROUP BY detail
  `).all(start, end);
  const clicks = db.prepare(`
    SELECT detail AS target, SUM(count) AS clicks
    FROM analytics_daily_aggregates WHERE day >= ? AND day < ? AND event_type = 'click'
    GROUP BY detail ORDER BY clicks DESC LIMIT 20
  `).all(start, end);
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS received,
      COALESCE(SUM(credit_applied), 0) AS credit_applied,
      COUNT(*) AS payment_count
    FROM payment_records WHERE paid_at >= ? AND paid_at < ?
  `).get(start, end);
  return {
    period: { year: y, month: m },
    analytics: {
      page_views: Number(legacySummary.page_views || 0) + Number(aggregateSummary.page_views || 0),
      applications: Number(legacySummary.applications || 0) + Number(aggregateSummary.applications || 0),
      registrations: Number(legacySummary.registrations || 0) + Number(aggregateSummary.registrations || 0),
      logins: Number(aggregateSummary.logins || 0),
      clicks: Number(aggregateSummary.clicks || 0),
      sources,
      bots,
      pages,
      durations,
      click_targets: clicks,
    },
    revenue: {
      received: Number(revenue.received || 0),
      credit_applied: Number(revenue.credit_applied || 0),
      payments: Number(revenue.payment_count || 0),
    },
  };
}
