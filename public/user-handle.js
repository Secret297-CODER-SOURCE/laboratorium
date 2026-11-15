/** Shared @handle → student profile link helpers. */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function profileUrl(handle) {
  if (!handle) return '#';
  return `/student-profile.html?handle=${encodeURIComponent(String(handle).replace(/^@/, ''))}`;
}

/**
 * @param {string} handle
 * @param {{ className?: string, prefix?: boolean, title?: string }} [opts]
 */
export function handleLink(handle, opts = {}) {
  const raw = String(handle || '').replace(/^@/, '').trim();
  if (!raw) return '<span class="user-handle-muted">—</span>';
  const className = opts.className || 'user-handle-link';
  const label = opts.prefix === false ? esc(raw) : `@${esc(raw)}`;
  const title = opts.title || `Відкрити профіль @${raw}`;
  return `<a class="${className}" href="${profileUrl(raw)}" title="${esc(title)}">${label}</a>`;
}
