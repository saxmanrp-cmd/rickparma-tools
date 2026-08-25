import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Comic Blast Studio provides categories, visual text editing, Text Blast import, and package uploads', () => {
  const studio = read('public/comic-blast-studio.js');
  const helper = read('public/recovery-show-helper.js');
  const oldBlast = read('public/recovery-text-blast.js');

  assert.equal(helper.includes("script.src = '/comic-blast-studio.js'"), true);
  assert.equal(studio.includes('Comic Blast Studio'), true);
  assert.equal(studio.includes('Background category'), true);
  assert.equal(studio.includes('4:5 Feed · Vertical'), true);
  assert.equal(studio.includes('9:16 Story · Vertical'), true);
  assert.equal(studio.includes('Random Scene'), true);
  assert.equal(studio.includes('/api/text-blast/history'), true);
  assert.equal(studio.includes('Text Blast admin password'), true);
  assert.equal(studio.includes('contenteditable="true"'), true);
  assert.equal(studio.includes("addEventListener('touchmove'"), true);
  assert.equal(studio.includes('Background Library'), true);
  assert.equal(studio.includes('Create Category'), true);
  assert.equal(studio.includes('Choose Multiple Backgrounds'), true);
  assert.equal(studio.includes('multiple hidden'), true);
  assert.equal(studio.includes('Upload Package'), true);
  assert.equal(studio.includes('Map Bubble'), true);
  assert.equal(studio.includes("method:'PATCH'"), true);
  assert.equal(studio.includes('/api/comic-templates/categories'), true);
  assert.equal(studio.includes('setInterval'), false);
  assert.equal(studio.includes('new MutationObserver'), false);

  assert.equal(oldBlast.includes('Turn a Text Blast into a post'), false);
  assert.equal(oldBlast.includes("helper.src = '/recovery-show-helper.js'"), true);
});
