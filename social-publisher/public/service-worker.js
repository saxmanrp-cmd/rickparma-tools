// Recovery worker: keep the installed app online-only while we stabilize iPhone behavior.
// It clears all older Social Publisher shell caches and intentionally does not intercept fetches.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('social-publisher-shell-')).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
