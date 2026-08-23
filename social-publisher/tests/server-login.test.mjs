import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('dedicated login page is a standalone password and Face ID surface', () => {
  const login = read('src/login-page.js');
  for (const needle of [
    'Sign in with Face ID',
    'Your password always works here.',
    "fetchJson('/api/auth/login'",
    "fetchJson('/api/auth/passkey/login/options'",
    "fetchJson('/api/auth/passkey/login/verify'",
    "location.replace('/')",
    "'cache-control':'no-store, max-age=0'",
  ]) assert.equal(login.includes(needle), true, `login page missing ${needle}`);
});

test('root navigation is gated by Worker before the app shell is served', () => {
  const entry = read('src/entry.js');
  const wrangler = read('wrangler.jsonc');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');

  for (const needle of [
    "import { renderLoginPage } from './login-page.js'",
    "url.pathname === '/' || url.pathname === '/index.html'",
    'return renderLoginPage({ passkeyAvailable })',
    'return env.ASSETS.fetch(request)',
  ]) assert.equal(entry.includes(needle), true, `entry missing ${needle}`);

  assert.equal(wrangler.includes('"run_worker_first": ["/", "/index.html", "/api/*", "/media/*"]'), true);
  assert.equal(sw.includes('social-publisher-shell-v762'), true);
  assert.equal(sw.includes("event.request.mode === 'navigate'"), true);
  assert.equal(sw.includes("const SHELL = ['/styles.css'"), true);
  assert.equal(pkg.includes('node --check src/login-page.js'), true);
});
