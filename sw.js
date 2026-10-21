// Offline support. Network first so a new deploy shows up right away;
// the cache is the fallback when there's no connection.

const CACHE = 'lock-in-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/ui.js',
  'js/db.js',
  'js/store.js',
  'js/stats.js',
  'js/recorder.js',
  'js/player.js',
  'js/exporter.js',
  'js/share.js',
  'js/friends.js',
  'js/demo.js',
  'js/views/record.js',
  'js/views/history.js',
  'js/views/session.js',
  'js/views/profile.js',
  'js/views/friends.js',
  'fonts/instrument-serif-400.woff2',
  'fonts/instrument-serif-400-italic.woff2',
  'fonts/ibm-plex-mono-400.woff2',
  'fonts/ibm-plex-mono-500.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(request, { ignoreSearch: true })) ?? caches.match('index.html')),
  );
});
