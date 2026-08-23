// v0.7.6 upgrades the previous social-publisher-shell-v750 cache and adds Flyer First + Text Blast cards.
const CACHE = 'social-publisher-shell-v760';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/reach-intelligence.js', '/passkeys.js', '/smart-plan.js', '/login-stability.js', '/content-coach.js', '/weekly-planner.js', '/gig-campaign.js', '/calendar-sync.js', '/easy-mode.js', '/flyer-first.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('/index.html'))));
});
