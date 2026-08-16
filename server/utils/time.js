export function parseSqliteDate(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function secondsBetween(start, end) {
  const a = parseSqliteDate(start);
  const b = parseSqliteDate(end);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
}

export function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds} с`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m} хв ${s} с` : `${m} хв`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} год ${rm} хв` : `${h} год`;
}
