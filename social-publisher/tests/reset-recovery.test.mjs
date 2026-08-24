import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('reset page clears stale PWA state and opens a cache-busted clean shell', () => {
  const reset = read('public/reset.html');
  const clean = read('public/clean.html');
  const sw = read('public/service-worker.js');

  for (const needle of [
    'navigator.serviceWorker.getRegistrations()',
    "key.startsWith('social-publisher-shell-')",
    "localStorage.removeItem('socialPublisherV3')",
    "location.replace('/clean.html?fresh='",
  ]) assert.equal(reset.includes(needle), true, `reset page missing ${needle}`);

  for (const needle of [
    "fetch('/index.html?fresh='",
    "cache:'reload'",
    "'app.js'",
    "'passkeys.js'",
  ]) assert.equal(clean.includes(needle), true, `clean bootstrap missing ${needle}`);

  assert.equal(sw.includes("key.startsWith('social-publisher-shell-')"), true);
  assert.equal(sw.includes("self.addEventListener('fetch'"), false, 'recovery worker must not intercept app requests');
});
