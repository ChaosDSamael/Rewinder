// Rewinder — offline support. Bump VERSION on every release so browsers pick up the new files.
const VERSION = 'rewinder-1.4.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/model.js',
  './js/store.js',
  './js/views.js',
  './js/ui.js',
  './js/morph.js',
  './js/tmdb.js',
  './js/rawg.js',
  './js/anilist.js',
  './js/importer.js',
  './icons/logo-64.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/chakra-petch-latin-500-normal.woff2',
  './fonts/chakra-petch-latin-600-normal.woff2',
  './fonts/chakra-petch-latin-700-normal.woff2',
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-500-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
  './fonts/jetbrains-mono-latin-400-normal.woff2',
  './fonts/jetbrains-mono-latin-500-normal.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('rewinder-') && key !== VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (request.mode === 'navigate') {
      // Only the app's own page gets the saved copy; any other address goes to the network.
      const home = new URL(self.registration.scope).pathname;
      if (url.pathname === home || url.pathname === home + 'index.html') {
        return (await cache.match('./index.html')) || fetch(request);
      }
      return fetch(request);
    }
    const hit = await cache.match(request, { ignoreSearch: true });
    return hit || fetch(request);
  })());
});
