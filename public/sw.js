/* Tradar service worker — Web Push.
 *
 * Receives VAPID-signed push messages from the backend and shows an OS-level
 * notification even when the app tab is closed. Clicking it focuses an open
 * Tradar tab (or opens one) at the relevant page.
 */

self.addEventListener('install', (event) => {
  // Activate immediately so push works without a reload.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Tradar', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Tradar';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing Tradar tab if one is open.
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      // Otherwise open a new one.
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
