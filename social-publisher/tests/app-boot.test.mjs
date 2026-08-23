import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const entry = fs.readFileSync(path.join(root, 'src/entry.js'), 'utf8');

test('authenticated app shell bypasses stale iPhone assets and keeps tabs tappable', () => {
  for (const needle of [
    "const APP_BOOT = '0764'",
    'addFreshAssetVersions',
    'injectBootRecovery',
    "'cache-control':'no-store, no-cache, must-revalidate, max-age=0'",
    "navigator.serviceWorker.getRegistrations()",
    "caches.keys()",
    "social-publisher-shell-",
    "e.target&&e.target.closest&&e.target.closest('.nav-item[data-view]')",
    "'x-social-publisher-boot':APP_BOOT",
  ]) assert.equal(entry.includes(needle), true, `missing boot recovery: ${needle}`);
});

test('transformed HTML never reuses stale body metadata', () => {
  assert.equal(entry.includes('new Headers(assetResponse.headers)'), false, 'must not copy the original transformed-body headers');
  assert.equal(entry.includes('old Content-Length/Content-Encoding'), true, 'must document the iOS loading failure being prevented');
  assert.equal(entry.includes("const headers = new Headers({"), true, 'must build clean headers for transformed HTML');
});
