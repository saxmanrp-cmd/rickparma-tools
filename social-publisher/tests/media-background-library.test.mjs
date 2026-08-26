import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Media tab owns the reusable background library and unified editor', () => {
  const media = read('public/media-background-library.js');
  const polish = read('public/comic-blast-polish.js');

  assert.equal(media.includes('Background Library'), true);
  assert.equal(media.includes('＋ Add Backgrounds'), true);
  assert.equal(media.includes('Save Name + Bubble'), true);
  assert.equal(media.includes('bgEditName'), true);
  assert.equal(media.includes('bgEditCategory'), true);
  assert.equal(media.includes('bgMapBox'), true);
  assert.equal(media.includes('bubble:state.mapBox'), true);
  assert.equal(media.includes("method:'DELETE'"), true);
  assert.equal(media.includes('socialPublisherMediaBackgroundMigrationV1'), true);
  assert.equal(media.includes('comicOptimizerSettingsCard'), true);
  assert.equal(media.includes('MAX_WIDTH = 1080'), true);
  assert.equal(media.includes('MAX_HEIGHT = 1920'), true);
  assert.equal(polish.includes("script.src = '/media-background-library.js'"), true);
});
