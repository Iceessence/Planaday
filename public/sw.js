// Planaday Offline-First Service Worker
// Precaches core shell & dynamically caches built JS/CSS/font assets for 100% offline Phone & Computer modes.
const CACHE_NAME = 'planaday-shell-v2-1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache live sync/API endpoints
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first with instant offline cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first, populate on miss
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});
