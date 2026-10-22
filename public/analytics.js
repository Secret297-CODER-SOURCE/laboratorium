const TRACKED_PAGES = new Set([
  '/',
  '/index.html',
  '/course.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
]);
const ATTRIBUTION_KEYS = [
  ['source', 'utm_source'],
  ['medium', 'utm_medium'],
  ['campaign', 'utm_campaign'],
  ['content', 'utm_content'],
  ['campaign_code', 'campaign_code'],
];
const MAX_DIMENSION_LENGTH = 120;
let activePageTracker = null;

function safeDimension(value) {
  const text = String(value || '').trim().slice(0, MAX_DIMENSION_LENGTH);
  return /^[a-zA-Z0-9._:-]*$/.test(text) ? text : '';
}

function trackedPath(url) {
  if (!TRACKED_PAGES.has(url.pathname)) return '';
  if (url.pathname === '/course.html') {
    const id = url.searchParams.get('id') || '';
    return /^[1-9]\d{0,8}$/.test(id) ? `${url.pathname}?id=${id}` : url.pathname;
  }
  if (url.pathname === '/dashboard.html') {
    const tab = url.searchParams.get('tab') || 'home';
    return ['home', 'ctf', 'tests', 'lab', 'code', 'article', 'manuals'].includes(tab)
      ? `${url.pathname}?tab=${tab}`
      : `${url.pathname}?tab=home`;
  }
  if (url.pathname === '/') {
    const section = (url.hash.slice(1) || url.searchParams.get('section') || '').toLowerCase();
    if (['programs', 'about', 'contact', 'bounty', 'faq'].includes(section)) {
      return `/?section=${section}`;
    }
  }
  return url.pathname;
}

function currentAttribution(search = location.search) {
  const params = new URLSearchParams(search);
  const values = {};
  for (const [name, queryKey] of ATTRIBUTION_KEYS) {
    values[name] = safeDimension(params.get(queryKey) || params.get(`analytics_${name}`));
  }
  if (!values.source) {
    try {
      const referrer = new URL(document.referrer);
      if (referrer.protocol === 'http:' || referrer.protocol === 'https:') {
        if (referrer.hostname !== location.hostname) {
          values.source = safeDimension(referrer.hostname);
          values.medium = 'referral';
        }
      }
    } catch { /* Direct visits have no external referrer. */ }
  }
  return values;
}

function appendAttributionToLink(anchor, attribution) {
  if (!attribution.source && !attribution.campaign_code) return;
  try {
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || !trackedPath(url)) return;
    for (const [name, value] of Object.entries(attribution)) {
      if (value && !url.searchParams.has(`utm_${name}`) && !url.searchParams.has(`analytics_${name}`)) {
        url.searchParams.set(`analytics_${name}`, value);
      }
    }
    anchor.href = url.toString();
  } catch { /* Ignore malformed links. */ }
}

function appendAttributionToLinks(attribution) {
  document.querySelectorAll('a[href]').forEach(anchor => appendAttributionToLink(anchor, attribution));
}

function sendEvent(eventType, detail = '', attributionOverride = {}) {
  const path = trackedPath(new URL(location.href));
  if (!path) return;
  const attribution = { ...currentAttribution(), ...attributionOverride };
  fetch('/api/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      event_type: eventType,
      path,
      referrer: eventType === 'page_view' ? document.referrer : '',
      detail,
      ...attribution,
    }),
  }).catch(() => {});
}

function clickTarget(target) {
  const tab = target.closest('[data-tab]')?.dataset.tab;
  if (tab) return `tab:${safeDimension(tab)}`;
  const link = target.closest('a[href]');
  if (link) {
    try {
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin) return trackedPath(url) || '';
      return `external:${safeDimension(url.hostname)}`;
    } catch { return ''; }
  }
  const label = target.closest('[data-analytics-label]')?.dataset.analyticsLabel;
  if (label) return safeDimension(label);
  if (location.pathname === '/dashboard.html') {
    const dashboardActions = [
      ['.task-take-btn', 'task_take'],
      ['.task-submit-btn', 'task_submit'],
      ['.challenge-start-btn', 'challenge_start'],
      ['.complete-btn', 'challenge_complete'],
      ['.quiz-start', 'quiz_start'],
      ['.article-edit-btn', 'article_edit'],
      ['.article-submit-btn', 'article_submit'],
      ['.manual-submit-btn', 'manual_submit'],
      ['.progress-btn', 'enrollment_progress_update'],
      ['.ctf-stage-submit-btn', 'ctf_stage_submit'],
      ['.ctf-stage-hint-btn', 'ctf_hint'],
      ['.ctf-start-btn', 'ctf_start'],
      ['.ctf-stop-btn', 'ctf_stop'],
      ['.sched-absence-btn', 'absence_report'],
      ['#lab-start', 'lab_start'],
      ['#lab-stop', 'lab_stop'],
      ['#lab-reset', 'lab_reset'],
    ];
    for (const [selector, action] of dashboardActions) {
      if (target.closest(selector)) return action;
    }
    const labTab = target.closest('[data-lab]')?.dataset.lab;
    if (labTab) return `lab_tab:${safeDimension(labTab)}`;
    return '';
  }
  return 'button';
}

const currentPath = trackedPath(new URL(location.href));
if (currentPath) {
  const attribution = currentAttribution();
  appendAttributionToLinks(attribution);
  let enteredAt = document.visibilityState === 'hidden' ? null : performance.now();
  let activeMilliseconds = 0;
  let durationSent = false;
  const sendDuration = () => {
    if (durationSent) return;
    durationSent = true;
    const elapsed = activeMilliseconds + (enteredAt === null ? 0 : performance.now() - enteredAt);
    const seconds = Math.floor(elapsed / 1000);
    const bucket = seconds < 10 ? 'under-10s'
      : seconds < 30 ? '10-30s'
        : seconds < 120 ? '30-120s' : 'over-120s';
    sendEvent('page_duration', bucket);
  };
  const trackCurrentPage = (initial = false) => {
    if (!initial) sendDuration();
    sendEvent('page_view');
    activeMilliseconds = 0;
    enteredAt = document.visibilityState === 'hidden' ? null : performance.now();
    durationSent = false;
  };
  activePageTracker = () => trackCurrentPage();
  trackCurrentPage(true);

  document.addEventListener('click', event => {
    const target = event.target.closest('a[href],button,[role="button"]');
    if (!target || target.closest('form') && target.matches('button[type="submit"],button:not([type])')) return;
    const link = target.closest('a[href]');
    if (link) appendAttributionToLink(link, currentAttribution());
    const detail = clickTarget(target);
    if (detail) sendEvent('click', detail);
  }, { capture: true });

  window.labTrackPageView = () => activePageTracker?.();
  window.addEventListener('pagehide', sendDuration, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && enteredAt !== null) {
      activeMilliseconds += performance.now() - enteredAt;
      enteredAt = null;
    } else if (document.visibilityState === 'visible' && enteredAt === null) {
      enteredAt = performance.now();
    }
  });
}

window.labTrackEvent = sendEvent;

export function trackPageView() {
  activePageTracker?.();
}

export function getAnalyticsAttribution(search = location.search) {
  return currentAttribution(search);
}

export function withAnalyticsAttribution(path) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) return path;
  for (const [name, value] of Object.entries(currentAttribution())) {
    if (value) url.searchParams.set(`analytics_${name}`, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export { sendEvent as trackEvent };
