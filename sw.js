/* Service worker: mette in cache l'app per l'uso offline.
   Attivo solo quando l'app è servita via http/https; aprendo index.html da file system non serve. */
const CACHE = 'istruttore-cz-2026-v1';
const FILES = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './icon.svg',
  './icon-512.png',
  './manifest.webmanifest',
  './data/bando.js',
  './data/studio.js',
  './data/domande.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // i font di Google passano dalla rete
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
