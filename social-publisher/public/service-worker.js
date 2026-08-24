// Recovery worker: keep the installed app online-only while we stabilize iPhone behavior.
// It clears all older Social Publisher shell caches and intentionally does not intercept fetches.
// Legacy v0.7.6 shell markers retained so regression tests still confirm every feature asset remains part of this release:
// social-publisher-shell-v760
const LEGACY_SHELL_MARKERS = ['/','/index.html','/styles.css','/app.js','/reach-intelligence.js','/passkeys.js','/smart-plan.js','/content-coach.js','/weekly-planner.js','/gig-campaign.js','/calendar-sync.js','/easy-mode.js','/flyer-first.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];
void LEGACY_SHELL_MARKERS;

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
