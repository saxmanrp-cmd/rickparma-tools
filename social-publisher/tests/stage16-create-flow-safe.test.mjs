import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../public/stage16-create-flow-safe.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/recovery-text-blast.js', import.meta.url), 'utf8');

test('safe Create flow keeps Comic Blast internals untouched', () => {
  assert.match(code, /Pick a Background/);
  assert.doesNotMatch(code, /comic-studio-inner/);
  assert.doesNotMatch(code, /appendChild\(.*comicBlastStudio/);
});

test('safe Create flow uses compact media source choices', () => {
  assert.match(code, /1 · Choose Media/);
  assert.match(code, /Use a saved background/);
  assert.match(code, /Photo or video from my phone/);
  assert.match(code, /stage16-empty-media/);
});

test('caption comes immediately after media and helper tools come after caption', () => {
  assert.match(code, /comic\.after\(mediaCard\)/);
  assert.match(code, /mediaCard\.after\(captionCard\)/);
  assert.match(code, /captionCard\.after\(helperGroup\)/);
  assert.match(code, /Make It Easy/);
});

test('recovery loader boots safe Create flow after Comic polish', () => {
  assert.match(loader, /stage16-create-flow-safe\.js/);
  assert.match(loader, /data-stage16-create-flow/);
  assert.match(loader, /loadSafeCreateFlow/);
});
