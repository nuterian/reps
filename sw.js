// Offline support. Every app file is cached on install and served from the
// cache. At each launch, and when the page asks, all files are re-checked and
// replaced together, so a launch never mixes old and new code.
// test/sw.test.js fails if a file is missing from this list.
const CACHE = 'reps-v2';
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
  'src/body.js',
  'src/build.js',
  'src/dom.js',
  'src/figure.js',
  'src/form.js',
  'src/log.js',
  'src/progression.js',
  'src/seed.js',
  'src/smart.js',
  'src/stage.js',
  'src/store.js',
  'src/units.js',
  'src/views/build.js',
  'src/views/clip.js',
  'src/views/explore.js',
  'src/views/home.js',
  'src/views/parts.js',
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

// Fetches every file, and only if all arrive and any differs, swaps them in
// and tells the open page.
let running = null;
const update = () => (running ??= check().catch(() => {}).finally(() => (running = null)));

async function check() {
  const cache = await caches.open(CACHE);
  const fresh = await Promise.all(ASSETS.map(async (url) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const old = await cache.match(url);
    const same = old && (await bytes(old)) === (await bytes(res.clone()));
    return { url, res, same };
  }));
  const changed = fresh.filter((f) => !f.same);
  await Promise.all(changed.map((f) => cache.put(f.url, f.res)));
  if (!changed.length) return;
  for (const client of await self.clients.matchAll()) client.postMessage('changed');
}

const bytes = async (res) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', await res.arrayBuffer()))).join();

self.addEventListener('message', (e) => e.data === 'check' && e.waitUntil(update()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (e.request.mode === 'navigate') e.waitUntil(update());
  e.respondWith(caches.open(CACHE)
    .then((cache) => cache.match(e.request, { ignoreSearch: true }))
    .then((hit) => hit || fetch(e.request)));
});
