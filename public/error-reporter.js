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

window.addEventListener('error', (e) => {
  report(e.message, e.error?.stack);
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  report(reason?.message || String(reason), reason?.stack);
});
