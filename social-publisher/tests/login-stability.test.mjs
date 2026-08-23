import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('login stability isolates auth overlay and preserves password fallback', () => {
  const login = read('public/login-stability.js');
  const smart = read('public/smart-plan.js');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');

  for (const needle of [
    "document.body.classList.toggle('auth-open', open)",
    'body.auth-open .app-shell{visibility:hidden',
    'body.auth-open #appPassword',
    'input.disabled = false',
    'input.readOnly = false',
    'isUserVerifyingPlatformAuthenticatorAvailable',
    'Face ID tip:',
    'Safari or your Home Screen',
  ]) assert.equal(login.includes(needle), true, `login stability missing ${needle}`);

  assert.equal(smart.includes("loadScript('/login-stability.js','login-stability')"), true);
  assert.equal(sw.includes("'/login-stability.js'"), true);
  assert.equal(pkg.includes('public/login-stability.js'), true);
});
