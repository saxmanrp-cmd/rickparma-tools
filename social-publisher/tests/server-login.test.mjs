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
