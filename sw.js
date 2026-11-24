// Emily's Pet Heaven Service Worker
const CACHE_NAME = 'eph-v11';
const OFFLINE_URL = '/404.html';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/bundle.min.css',
  '/js/bundle.min.js',
  '/js/forms-fix.js',
  '/assets/brand/logo-icon-transparent.webp',
  '/assets/brand/og-cover.jpg',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(PRECACHE_URLS.map(url =>
        fetch(url, { cache: 'reload' })
          .then(res => (res && res.ok) ? cache.put(url, res) : null)
          .catch(() => null)
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // Only manage same-origin GET requests. Analytics, fonts, maps and the
  // AI vet worker go straight to the network untouched.
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // Pages: network first so a deploy is visible immediately, cache as fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Static assets: serve the cached copy and refresh it in the background.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request, { cache: 'no-cache' })
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
