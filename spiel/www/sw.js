// Offline: Spiel wird beim ersten Öffnen gespeichert und im Hintergrund aktualisiert.
const CACHE = 'astro-huepfer-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'datenschutz.html', 'support.html', 'seiten.css', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('astro-huepfer-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request, { ignoreSearch: true }).then((hit) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit ?? cache.match('index.html'));
        return hit ?? network;
      }),
    ),
  );
});
