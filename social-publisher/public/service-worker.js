// v0.7.6 dedicated-login hotfix upgrades the previous social-publisher-shell-v760 cache; navigation is always network-authenticated and never cached as app shell.
const CACHE = 'social-publisher-shell-v762';
const SHELL = ['/styles.css', '/app.js', '/reach-intelligence.js', '/passkeys.js', '/smart-plan.js', '/login-stability.js', '/content-coach.js', '/weekly-planner.js', '/gig-campaign.js', '/calendar-sync.js', '/easy-mode.js', '/flyer-first.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  // The Worker decides whether navigation gets the standalone login page or the app.
  // Never cache that decision, otherwise Safari can resurrect a stale login/app shell.
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(fetch(event.request).catch(() => new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#090b10;color:white;font-family:system-ui;padding:32px"><h2>Social Publisher is offline</h2><p>Reconnect and open the app again.</p></body>',
      { status:503, headers:{ 'content-type':'text/html; charset=utf-8' } }
    )));
    return;
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
