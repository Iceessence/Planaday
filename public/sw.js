// Planaday Offline-First Service Worker (PD-009 / PF-05)
// Precaches core shell AND every build-versioned JS/CSS lazy studio chunk listed in /offline-manifest.json
// so previously unvisited workspaces open reliably when offline.
const CACHE_PREFIX = 'planaday-build-';
const FALLBACK_CACHE = 'planaday-build-4.1.0';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

async function precacheBuildAssets() {
  let cacheName = FALLBACK_CACHE;
  let assets = [...CORE_ASSETS];
  try {
    const res = await fetch('/offline-manifest.json', { cache: 'no-store' });
    if (res.ok) {
      const manifest = await res.json();
      if (manifest && typeof manifest.buildId === 'string') {
        cacheName = `${CACHE_PREFIX}${manifest.buildId}`;
      }
      if (manifest && Array.isArray(manifest.assets)) {
        assets = Array.from(new Set([...CORE_ASSETS, ...manifest.assets]));
      }
    }
  } catch {
    // Fallback to CORE_ASSETS if manifest is unavailable (e.g. dev mode)
  }

  const cache = await caches.open(cacheName);
  // Precache every chunk atomically (tolerating individual optional asset 404s without aborting shell install)
  await Promise.all(
    assets.map(async (url) => {
      try {
        const resp = await fetch(url, { cache: 'reload' });
        if (resp && resp.ok) {
          await cache.put(url, resp);
        }
      } catch {
        // ignore single missing dev asset
      }
    })
  );
  // Clean up older build caches only after the new build cache is populated
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((k) => k !== cacheName && (k.startsWith(CACHE_PREFIX) || k.startsWith('planaday-shell-')))
      .map((k) => caches.delete(k))
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheBuildAssets().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache live sync/API endpoints
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then(async (res) => {
          if (res && res.ok && res.type === 'basic') {
            const keys = await caches.keys();
            const targetCache = keys.find((k) => k.startsWith(CACHE_PREFIX)) || FALLBACK_CACHE;
            const cache = await caches.open(targetCache);
            await cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('/index.html');
          return new Response('Offline — asset not yet cached', { status: 503 });
        });

      return cached || networkFetch;
    })
  );
});
