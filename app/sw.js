// ─────────────────────────────────────────────────────────────────────────────
//  sw.js  –  Service Worker  –  Daily Facts PWA
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME   = 'dailyfacts-v1';
const STATIC_URLS  = ['/', '/index.html', '/app.js', '/manifest.json'];

// ── Install: guarda los archivos estáticos ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpia cachés viejas ────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network first, luego caché ────────────────────────────────────
self.addEventListener('fetch', event => {
  // No interceptar peticiones a Supabase ni a la API de Anthropic
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('anthropic.com') ||
      url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Guarda una copia en caché
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Push notifications ────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {
    title: '📜 Daily Facts',
    body:  'Tu hecho del día te está esperando',
    url:   '/',
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-72.png',
      vibrate: [200, 100, 200],
      tag:     'daily-fact',
      data:    { url: data.url || '/' },
      actions: [
        { action: 'read',   title: 'Leer ahora' },
        { action: 'later',  title: 'Más tarde'  },
      ],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'later') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const existing = windowClients.find(c => c.url === url);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
  );
});
