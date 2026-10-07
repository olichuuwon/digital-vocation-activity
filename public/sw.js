// Stale-while-revalidate for same-origin static GETs. Network-only for everything else
// (e.g. the Supabase backend), so live data is never served from cache. On install, every built
// file listed in precache.json (written by vite.config.ts) is cached, so lazy screens work offline.
const CACHE = 'ship-it-v2';
const BASE = new URL('./', self.location).pathname;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    fetch(BASE + 'precache.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((files) => caches.open(CACHE).then((c) => Promise.all(files.map((f) => c.add(f).catch(() => {}))))
      .catch(() => {}),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Page loads ignore the query (?debug=1, ?join=CODE…): it's the same app shell.
      const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? fresh;
    }),
  );
});
