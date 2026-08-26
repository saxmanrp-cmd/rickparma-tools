import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('generated comic hides the redundant compact media preview and keeps scroll position', () => {
  const code = read('public/create-flow-controls-v2.js');
  assert.match(code, /create-clean-generated #dropZone/);
  assert.match(code, /create-clean-generated #mediaPreview/);
  assert.match(code, /create-clean-generated #mediaActions/);
  assert.match(code, /#comicMakeBtn/);
  assert.match(code, /window\.scrollTo\(\{top:y,left:0,behavior:'auto'\}\)/);
});

test('format picker defaults to All Sizes and still offers 9:16 and 4:5 filters', () => {
  const code = read('public/create-flow-controls-v2.js');
  assert.match(code, /<option value="all">All Sizes<\/option>/);
  assert.match(code, /<option value="story">9:16 Story · Vertical<\/option>/);
  assert.match(code, /<option value="feed">4:5 Feed · Vertical<\/option>/);
  assert.match(code, /formatMode = 'all'/);
  assert.match(code, /populateAllScenes/);
});

test('caption Text Blast button opens only the recent blast picker', () => {
  const code = read('public/create-flow-controls-v2.js');
  assert.match(code, /#comicCaptionBlastConnect/);
  assert.match(code, /#comicCaptionBlastStatus/);
  assert.match(code, /#comicCaptionBlastReady>div/);
  assert.match(code, /showPicker/);
  assert.match(code, /Connect Text Blast in Settings first/);
});

test('Text Blast Refresh and Disconnect live in Settings', () => {
  const code = read('public/create-flow-controls-v2.js');
  assert.match(code, /textBlastSettingsCard/);
  assert.match(code, /textBlastSettingsRefresh/);
  assert.match(code, /textBlastSettingsDisconnect/);
  assert.match(code, /#view-settings/);
});

test('loader includes the Create flow cleanup after preview upgrades', () => {
  const loader = read('public/comic-fullscreen-retire.js');
  assert.match(loader, /create-flow-controls-v2\.js/);
  assert.match(loader, /data-create-flow-controls-v2/);
  assert.match(loader, /loadCreateFlowControls/);
});
