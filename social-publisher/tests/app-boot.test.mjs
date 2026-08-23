import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const entry = fs.readFileSync(path.join(root, 'src/entry.js'), 'utf8');

test('authenticated app shell bypasses stale iPhone assets and keeps tabs tappable', () => {
  for (const needle of [
    "const APP_BOOT = '0763'",
    'addFreshAssetVersions',
    'injectBootRecovery',
    "headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0')",
    "navigator.serviceWorker.getRegistrations()",
    "caches.keys()",
    "social-publisher-shell-",
    "e.target&&e.target.closest&&e.target.closest('.nav-item[data-view]')",
    "x-social-publisher-boot",
  ]) assert.equal(entry.includes(needle), true, `missing boot recovery: ${needle}`);
});
