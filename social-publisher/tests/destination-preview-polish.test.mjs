import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('preview polish keeps destination aspect ratios visibly accurate', () => {
  const code = read('public/destination-preview-polish.js');
  assert.match(code, /data-ratio=\"9:16\"/);
  assert.match(code, /aspect-ratio:9\/16!important/);
  assert.match(code, /data-ratio=\"4:5\"/);
  assert.match(code, /aspect-ratio:4\/5!important/);
  assert.match(code, /Threads keeps the uploaded image ratio/);
  assert.match(code, /slide\.dataset\.ratio = 'source'/);
});

test('preview polish uses the flattened generated media instead of the background-only comic image', () => {
  const code = read('public/destination-preview-polish.js');
  assert.match(code, /#mediaPreview img, #mediaPreview video/);
  assert.match(code, /#comicPreviewImg/);
  assert.match(code, /replacePreviewMedia/);
});

test('preview polish removes expensive per-frame carousel work', () => {
  const code = read('public/destination-preview-polish.js');
  assert.match(code, /cloneNode\(true\)/);
  assert.match(code, /scrollend/);
  assert.match(code, /scroll-behavior:auto!important/);
  assert.match(code, /scroll-snap-stop:normal!important/);
  assert.doesNotMatch(code, /requestAnimationFrame\(\(\) => updateState\(track\)\)/);
});

test('generated comics never show the redundant compact top preview', () => {
  const code = read('public/destination-preview-polish.js');
  assert.match(code, /body\.stage15-comic-generated-media #mediaPreview/);
  assert.match(code, /body\.stage15-comic-generated-media #mediaActions/);
  assert.match(code, /#comicMakeBtn/);
});

test('retirement loader loads carousel polish after the base carousel', () => {
  const loader = read('public/comic-fullscreen-retire.js');
  assert.match(loader, /destination-preview-polish\.js/);
  assert.match(loader, /data-destination-preview-polish/);
  assert.match(loader, /script\.addEventListener\('load',loadDestinationPreviewPolish/);
});
