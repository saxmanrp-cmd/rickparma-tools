import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('recovery boot safely restores Face ID with password fallback', () => {
  const guard = read('public/media-boot-guard.js');
  const passkeys = read('public/passkeys.js');
  const html = read('public/index.html');

  assert.equal(guard.includes("loadRecoveryFeature('/passkeys.js','passkeys')"), true);
  assert.equal(guard.includes("marker.dataset.smartPlan = 'recovery-disabled'"), true, 'legacy Smart Plan chain must stay blocked');
  assert.equal(passkeys.includes('Sign in with Face ID'), true);
  assert.equal(passkeys.includes('Enable Face ID'), true);
  assert.equal(passkeys.includes("navigator.credentials.create"), true);
  assert.equal(passkeys.includes("navigator.credentials.get"), true);
  assert.equal(passkeys.includes("userVerification:'required'"), true);
  assert.equal(html.includes('id="appPassword"'), true, 'password fallback must remain available');
});

test('Home Screen install uses the original Social Publisher icon assets', () => {
  const guard = read('public/media-boot-guard.js');
  const icons = read('public/app-icons.js');
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  const html = read('public/index.html');

  assert.equal(guard.includes("loadRecoveryFeature('/app-icons.js','app-icons')"), true);
  assert.equal(html.includes('rel="apple-touch-icon" href="/icons/icon-180.png"'), true);
  for (const size of [180,192,512]) {
    assert.equal(fs.existsSync(path.join(root, `public/icons/icon-${size}.png`)), true, `missing icon-${size}.png`);
    assert.equal(icons.includes(`/icons/icon-${size}.png`), true, `icon metadata missing ${size}`);
    assert.equal(manifest.icons.some(icon => icon.src === `/icons/icon-${size}.png`), true, `manifest missing ${size}`);
  }
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.id, '/');
});
