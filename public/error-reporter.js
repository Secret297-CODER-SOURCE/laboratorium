/**
 * Best-effort client-side error capture — feeds the owner's "Помилки" admin
 * panel. Deliberately swallows its own failures (network down, endpoint
 * rate-limited) so a broken reporter can never itself become a source of
 * console noise or additional errors. Zero imports on purpose (reads the
 * token straight from localStorage under the same key auth.js uses) so it
 * has no load-order dependency and works even on fully public pages.
 */
function report(message, stack) {
  try {
    const token = localStorage.getItem('lab_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch('/api/client-error', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: String(message || '').slice(0, 500), stack, path: location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* never let the reporter itself throw */ }
}

function isAuthRedirectNoise(message) {
  const msg = String(message || '');
  return msg === 'auth' || msg === 'no auth' || /Uncaught Error: (no )?auth/.test(msg);
}

window.addEventListener('error', (e) => {
  if (isAuthRedirectNoise(e.message) || isAuthRedirectNoise(e.error?.message)) return;
  report(e.message, e.error?.stack);
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const message = reason?.message || String(reason);
  if (isAuthRedirectNoise(message)) return;
  report(message, reason?.stack);
});
