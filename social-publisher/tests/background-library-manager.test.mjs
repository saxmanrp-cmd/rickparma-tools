import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Background Library shows upload previews, names, edit and delete controls', () => {
  const helper = read('public/recovery-show-helper.js');
  const manager = read('public/comic-library-manager.js');

  assert.equal(helper.includes("manager.src = '/comic-library-manager.js'"), true);
  assert.equal(manager.includes('comicUploadQueue'), true);
  assert.equal(manager.includes('Background name'), true);
  assert.equal(manager.includes('previewUrl:URL.createObjectURL(file)'), true);
  assert.equal(manager.includes('Upload Backgrounds'), true);
  assert.equal(manager.includes('Save Changes'), true);
  assert.equal(manager.includes('Map Bubble'), true);
  assert.equal(manager.includes('Delete'), true);
  assert.equal(manager.includes("method:'PATCH'"), true);
  assert.equal(manager.includes("method:'DELETE'"), true);
  assert.equal(manager.includes("'content-type':'image/jpeg'"), true);
  assert.equal(manager.includes('MAX_WIDTH = 1080'), true);
  assert.equal(manager.includes('MAX_HEIGHT = 1920'), true);
});
