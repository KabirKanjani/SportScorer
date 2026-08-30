// SportScore service worker.
//
// Purely a network pass-through: the HTML shell is served with no-cache and
// hashed assets are immutable, so caching here would risk serving a stale shell
// that references a bundle which no longer exists on the server. By never
// caching we stay 100% safe while still satisfying the "service worker present"
// install criterion for the PWA home-screen prompt. Offline support can be
// layered on carefully later if wanted.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});