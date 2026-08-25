import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Comic Blast Studio provides visual editing, Text Blast import, and background uploads', () => {
  const studio = read('public/comic-blast-studio.js');
  const helper = read('public/recovery-show-helper.js');
  assert.equal(helper.includes("script.src = '/comic-blast-studio.js'"), true);
  assert.equal(studio.includes('Comic Blast Studio'), true);
  assert.equal(studio.includes('4:5 · Feed · Vertical'), true);
  assert.equal(studio.includes('9:16 · Story · Vertical'), true);
  assert.equal(studio.includes('Random Scene'), true);
  assert.equal(studio.includes('/api/text-blast/history'), true);
  assert.equal(studio.includes('contenteditable="true"'), true);
  assert.equal(studio.includes("addEventListener('touchmove'"), true);
  assert.equal(studio.includes('pinch'), true);
  assert.equal(studio.includes('/api/comic-templates/'), true);
  assert.equal(studio.includes('x-bubble-x'), true);
  assert.equal(studio.includes('x-bubble-width'), true);
  assert.equal(studio.includes('Save Comic Background'), true);
  assert.equal(studio.includes('setInterval'), false);
  assert.equal(studio.includes('new MutationObserver'), false);
});
