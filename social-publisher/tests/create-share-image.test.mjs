import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const share = await readFile(new URL('../public/create-share-image.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/comic-fullscreen-retire.js', import.meta.url), 'utf8');

test('Create page gets a share/save image button at the bottom', () => {
  assert.match(share, /createShareImageBtn/);
  assert.match(share, /Share \/ Save Image/);
  assert.match(share, /composer\.appendChild\(button\)/);
});

test('share button prefers the already-flattened current image file', () => {
  assert.match(share, /currentFile instanceof Blob/);
  assert.match(share, /currentFile instanceof File/);
  assert.match(share, /currentImageFile\(\)/);
});

test('share button opens the native share sheet with the image file', () => {
  assert.match(share, /navigator\.share/);
  assert.match(share, /navigator\.canShare/);
  assert.match(share, /files:\[file\]/);
});

test('share button falls back to a downloadable image when file sharing is unavailable', () => {
  assert.match(share, /downloadFallback/);
  assert.match(share, /URL\.createObjectURL/);
  assert.match(share, /link\.download/);
});

test('final comic loader loads the share/save image layer', () => {
  assert.match(loader, /create-share-image\.js/);
  assert.match(loader, /loadCreateShareImage/);
});
