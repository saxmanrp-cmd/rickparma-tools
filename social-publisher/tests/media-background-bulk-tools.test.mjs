import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bulk = fs.readFileSync(new URL('../public/media-background-bulk-tools.js', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/comic-blast-polish.js', import.meta.url), 'utf8');

test('Media background library supports multi-select category moves', () => {
  assert.match(bulk,/Select Multiple/);
  assert.match(bulk,/bgBulkMoveBtn/);
  assert.match(bulk,/bulkMoveSelected/);
  assert.match(bulk,/method:'PATCH'/);
  assert.match(bulk,/category:destination/);
});

test('Recent conversation uploads are moved and renamed automatically', () => {
  assert.match(bulk,/Conversation Scenes/);
  assert.match(bulk,/Conversation Scene \$\{String\(index\+1\)\.padStart\(2,'0'\)\}/);
  assert.match(bulk,/uploadedAt/);
  assert.match(bulk,/4 \* 60 \* 60 \* 1000/);
});

test('Comics backgrounds receive cleaned names', () => {
  assert.match(bulk,/Rick Parma Comic/);
  assert.match(bulk,/Neon Nightlife/);
  assert.match(bulk,/Backstage Pass/);
  assert.match(bulk,/Upscale Lounge/);
});

test('Comic polish loads the media bulk tools', () => {
  assert.match(polish,/media-background-bulk-tools\.js/);
  assert.match(polish,/data-media-background-bulk-tools/);
});
