// Offline support. Every app file is cached on install. Requests are answered
// from the cache at once and refreshed in the background, so a new version
// shows up on the launch after it was fetched.
// test/sw.test.js fails if a file is missing from this list.
const CACHE = 'reps-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/ui.css',
  'src/app.js',
  'src/dom.js',
  'src/log.js',
  'src/progression.js',
  'src/seed.js',
  'src/store.js',
  'src/units.js',
  'src/views/home.js',
  'src/views/past.js',
  'src/views/picker.js',
  'src/views/program.js',
  'src/views/session.js',
  'src/views/summary.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request.url, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(e.request.url, res.clone());
      return res;
    });
    if (!cached) return fresh;
    e.waitUntil(fresh.catch(() => {}));
    return cached;
  }));
});
