/* Vitruv service worker — offline app shell + stale-while-revalidate for data. */
const CACHE = 'vitruv-v2';

const APP_SHELL = [
  './',
  'index.html',
  'styles.css',
  'colors_and_type.css',
  'app.js',
  'manifest.json',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // data.js: stale-while-revalidate so content updates land without a cache bump
  if (url.pathname.endsWith('data.js')) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetched = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  // app shell: cache-first, fall back to network, then index for navigations
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).catch(() => {
      if (req.mode === 'navigate') return caches.match('index.html');
    }))
  );
});
