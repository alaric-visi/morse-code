/*
 * Morse Code offline service worker. Registered only by the standalone page
 * (mount option `serviceWorker: true`), with its scope limited to the app's own
 * folder. It precaches the build listed in precache.json, serves the app shell
 * network-first (so updates arrive) and hashed assets cache-first.
 */
const PREFIX = 'mc-';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch('precache.json', { cache: 'no-store' });
      const { version, files } = await res.json();
      const cache = await caches.open(PREFIX + version);
      await cache.addAll(['./', ...files]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch('precache.json', { cache: 'no-store' }).catch(() => null);
      const current = res ? PREFIX + (await res.json()).version : null;
      if (current) for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== current) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match(req, { ignoreSearch: true })) ?? caches.match(new URL('./', self.registration.scope).href)));
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then(async (res) => {
          if (res.ok && url.pathname.includes('/assets/')) {
            const keys = await caches.keys();
            const name = keys.filter((k) => k.startsWith(PREFIX)).pop();
            if (name) (await caches.open(name)).put(req, res.clone());
          }
          return res;
        }),
    ),
  );
});
