const LOCALE_TZ = {
  uk: 'Europe/Kyiv',
  en: 'Europe/Kyiv',
};

export function getSiteLocale() {
  try {
    return localStorage.getItem('lab_locale')
      || document.documentElement.lang
      || 'uk';
  } catch {
    return 'uk';
  }
}

export function getSiteTimeZone() {
  const locale = String(getSiteLocale()).slice(0, 2).toLowerCase();
  if (LOCALE_TZ[locale]) return LOCALE_TZ[locale];
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv';
  } catch {
    return 'Europe/Kyiv';
  }
}

/** Format ISO/UTC timestamp in site timezone. */
export function formatInSiteTz(value, options = {}) {
  if (!value) return '—';
  const d = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  const locale = getSiteLocale().startsWith('en') ? 'en-GB' : 'uk-UA';
  return d.toLocaleString(locale, {
    timeZone: getSiteTimeZone(),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/**
 * Interpret datetime-local value as wall-clock time in `timeZone`, return UTC ISO.
 */
export function localInTzToUtcIso(localValue, timeZone = getSiteTimeZone()) {
  if (!localValue) return null;
  const normalized = localValue.length === 16 ? `${localValue}:00` : localValue;
  const [datePart, timePart = '00:00:00'] = normalized.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss = 0] = timePart.split(':').map(Number);
  let utc = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(utc));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    const hour = get('hour') % 24;
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
    const desired = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
    utc += desired - asUtc;
  }
  return new Date(utc).toISOString();
}

/** Convert UTC ISO → value for <input type="datetime-local"> in site TZ. */
export function utcIsoToLocalInput(value, timeZone = getSiteTimeZone()) {
  if (!value) return '';
  const d = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  const hour = String(Number(get('hour')) % 24).padStart(2, '0');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

export function timezoneLabel() {
  return getSiteTimeZone().replace('_', ' ');
}
