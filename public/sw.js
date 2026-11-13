/* Minimal service worker for installability and notification click handling.
 * Intentionally contains no fetch listener and performs no caching so the
 * app shell, Supabase requests, and all API traffic pass straight through.
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification &&
      event.notification.data &&
      typeof event.notification.data.url === 'string' &&
      event.notification.data.url) ||
    '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
