// Service worker: makes the dashboard installable and shows push notifications.
// Pages are loaded from the network first; the cached copy is only used when the server is unreachable.
// API calls are never cached, so the numbers are always live.
const CACHE = 'minerdash-v19';
const SHELL = ['./', 'widget', 'i18n.js', 'theme.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// ---------- push notifications ----------
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Miner Control', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Miner Control', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'badge-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: !!d.urgent,
    vibrate: d.urgent ? [200, 100, 200, 100, 400] : [120],
    timestamp: d.t || Date.now(),
    data: { url: './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(e.notification.data && e.notification.data.url || './');
  }));
});
