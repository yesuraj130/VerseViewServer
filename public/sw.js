// ===========================================================================
// Verse View Server — Progressive Web App (PWA) Service Worker
// ===========================================================================

const CACHE_NAME = 'verseview-v9';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/presenter/',
  '/presenter/index.html',
  '/display/',
  '/display/index.html',
  '/css/base.css',
  '/css/hub.css',
  '/presenter/css/presenter.css',
  '/display/display.css',
  '/js/config.js',
  '/js/pwa.js',
  '/presenter/js/tamilPhonetic.js',
  '/presenter/js/state.js',
  '/presenter/js/songs.js',
  '/presenter/js/editSong.js',
  '/presenter/js/bible.js',
  '/presenter/js/controls.js',
  '/presenter/js/socket.js',
  '/presenter/js/main.js',
  '/display/display.js',
  '/fonts/baloo-thambi.woff2',
  '/icon.svg',
  '/icon-maskable.svg',
  '/favicon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Non-blocking asset precache notice:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass Service Worker for Socket.io, API POSTs, and live state endpoints
  if (
    url.pathname.startsWith('/socket.io/') ||
    url.pathname.startsWith('/api/keepalive') ||
    url.pathname.startsWith('/healthz') ||
    (url.pathname.startsWith('/api/state') && event.request.method === 'POST')
  ) {
    return;
  }

  // 2. Network-first with cache fallback for HTML pages and search APIs
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (url.pathname.startsWith('/presenter')) return caches.match('/presenter/');
            if (url.pathname.startsWith('/display')) return caches.match('/display/');
            return caches.match('/');
          });
        })
    );
    return;
  }

  // 3. Network-first with cache fallback for CSS and JS to ensure instant updates
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/presenter/css/') ||
    url.pathname.startsWith('/display/display.css') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/presenter/js/') ||
    url.pathname.startsWith('/display/display.js')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 4. Cache-first strategy for static fonts and images
  if (
    url.pathname.startsWith('/fonts/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 4. Default: Network with Cache Fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
