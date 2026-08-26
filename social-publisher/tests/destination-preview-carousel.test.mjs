import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Preview becomes a destination-aware horizontal carousel', () => {
  const code = read('public/destination-preview-carousel.js');
  assert.match(code, /Destination Previews/);
  assert.match(code, /destination-preview-track/);
  assert.match(code, /scroll-snap-type:x mandatory/);
  assert.match(code, /instagram_post/);
  assert.match(code, /instagram_story/);
  assert.match(code, /instagram_reel/);
  assert.match(code, /facebook_post/);
  assert.match(code, /facebook_reel/);
  assert.match(code, /tiktok/);
  assert.match(code, /threads/);
});

test('Carousel reads the destinations selected by the recommendation/help flow', () => {
  const code = read('public/destination-preview-carousel.js');
  assert.match(code, /\.platform-chip\[data-platform="instagram"\]/);
  assert.match(code, /input\[name="igType"\]:checked/);
  assert.match(code, /\.platform-chip\[data-platform="facebook"\]/);
  assert.match(code, /input\[name="fbType"\]:checked/);
  assert.match(code, /\.platform-chip\[data-platform="tiktok"\]/);
  assert.match(code, /\.platform-chip\[data-platform="threads"\]/);
});

test('Destination previews use the real 4:5 feed and 9:16 vertical aspect ratios', () => {
  const code = read('public/destination-preview-carousel.js');
  assert.match(code, /instagram_post:.*ratio:'4:5'/);
  assert.match(code, /instagram_story:.*ratio:'9:16'/);
  assert.match(code, /instagram_reel:.*ratio:'9:16'/);
  assert.match(code, /facebook_reel:.*ratio:'9:16'/);
  assert.match(code, /tiktok:.*ratio:'9:16'/);
  assert.match(code, /threads:.*ratio:'4:5'/);
  assert.match(code, /aspect-ratio:9\/16/);
  assert.match(code, /aspect-ratio:4\/5/);
});

test('Carousel uses native iPhone horizontal scrolling instead of manual touchmove work', () => {
  const code = read('public/destination-preview-carousel.js');
  const verticalLock = read('public/vertical-scroll-lock.js');
  assert.match(code, /-webkit-overflow-scrolling:touch/);
  assert.match(code, /touch-action:pan-x!important/);
  assert.match(code, /scroll-behavior:smooth/);
  assert.doesNotMatch(code, /track\.scrollLeft = touch\.scrollLeft-dx/);
  assert.doesNotMatch(code, /touchmove/);
  assert.match(verticalLock, /overflow-x:hidden!important/);
  assert.match(verticalLock, /#previewSheet \.destination-preview-track/);
  assert.match(verticalLock, /touch-action:pan-x!important/);
});

test('Caption edits refresh preview copy without rebuilding every destination card', () => {
  const code = read('public/destination-preview-carousel.js');
  assert.match(code, /function refreshCaptionOnly/);
  assert.match(code, /target\?\.matches\?\.\('#caption'\)/);
  assert.match(code, /refreshCaptionOnly\(\)/);
});

test('Create flow loads the destination preview carousel', () => {
  const loader = read('public/comic-fullscreen-retire.js');
  assert.match(loader, /destination-preview-carousel\.js/);
  assert.match(loader, /data-destination-preview-carousel/);
  assert.match(loader, /loadDestinationPreviewCarousel\(\)/);
});
