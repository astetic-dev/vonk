/* Vonk service worker - network-first.
   Nieuwe app-versies en nieuwe feeds zijn direct zichtbaar; de cache is alleen
   de offline-terugval (ook voor eerder geopende feed-dagen). */
const CACHE = 'vonk-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== BEELDEN).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const BEELDEN = 'vonk-beelden-v1';
const MAX_BEELDEN = 250;

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // kaartbeelden van andere sites: cache-first (veranderen niet), zodat bekeken dagen offline werken
  if (url.origin !== location.origin) {
    if (e.request.destination !== 'image') return;
    e.respondWith(caches.open(BEELDEN).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok || r.type === 'opaque') {
        await c.put(e.request, r.clone());
        const ks = await c.keys();
        for (const k of ks.slice(0, Math.max(0, ks.length - MAX_BEELDEN))) await c.delete(k);
      }
      return r;
    }));
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(r => {
      if (r.ok) { const kopie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
