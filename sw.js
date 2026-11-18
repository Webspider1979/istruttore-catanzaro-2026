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

/* Strategia: prima la rete, poi la cache.
   Così una nuova versione pubblicata arriva sempre al primo avvio con
   connessione, mentre senza rete l'app continua a funzionare dalla copia
   salvata. L'alternativa (prima la cache) lascerebbe gli utenti su una
   versione vecchia finché non cambia il nome della cache. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // i font di Google passano dalla rete
  /* GitHub Pages serve i file con una validità di alcuni minuti: senza
     'no-cache' la richiesta verrebbe soddisfatta dalla cache del browser e una
     versione appena pubblicata arriverebbe in ritardo. Così invece l'ETag viene
     sempre rivalidato: se nulla è cambiato il server risponde 304, a costo
     quasi nullo. */
  let richiesta = e.request;
  try {
    richiesta = new Request(e.request, { cache: 'no-cache' });
  } catch (err) {
    richiesta = e.request; // le richieste di navigazione non si possono ricostruire
  }
  e.respondWith(
    fetch(richiesta)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
