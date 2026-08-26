import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const legacyBulk = fs.readFileSync(new URL('../public/media-background-bulk-tools.js', import.meta.url), 'utf8');
const stable = fs.readFileSync(new URL('../public/media-background-bulk-stable.js', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/comic-blast-polish.js', import.meta.url), 'utf8');

test('Media background library supports stable multi-select category moves', () => {
  assert.match(stable,/Select Multiple/);
  assert.match(stable,/bgBulkMoveBtn/);
  assert.match(stable,/bulkMoveSelected/);
  assert.match(stable,/method:'PATCH'/);
  assert.match(stable,/category/);
  assert.match(stable,/Move Selected/);
});

test('stable selection avoids observer feedback loops and full-grid work per tap', () => {
  assert.doesNotMatch(stable,/new\s+MutationObserver/);
  assert.doesNotMatch(stable,/\.observe\(/);
  assert.match(stable,/card\.classList\.toggle\('bulk-selected',active\)/);
  assert.match(stable,/loading = 'lazy'/);
  assert.match(stable,/decoding = 'async'/);
  assert.match(stable,/concurrency = 4/);
});

test('historical conversation cleanup rules remain available for completed migration', () => {
  assert.match(legacyBulk,/Conversation Scenes/);
  assert.match(legacyBulk,/Conversation Scene \$\{String\(index\+1\)\.padStart\(2,'0'\)\}/);
  assert.match(legacyBulk,/Rick Parma Comic/);
  assert.match(legacyBulk,/Neon Nightlife/);
  assert.match(legacyBulk,/Upscale Lounge/);
});

test('Comic polish loads only the stable media bulk selector', () => {
  assert.match(polish,/media-background-bulk-stable\.js/);
  assert.match(polish,/data-media-background-bulk-stable/);
  assert.doesNotMatch(polish,/media-background-bulk-tools\.js/);
  assert.doesNotMatch(polish,/media-background-bulk-fix\.js/);
});
