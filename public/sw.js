self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'laboratorium.', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'laboratorium.', {
      body: payload.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { link: payload.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.endsWith(link) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
      return null;
    }),
  );
});
