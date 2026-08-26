import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Media Background Library stays full width and hardens iPhone template uploads', () => {
  const polish = read('public/comic-blast-polish.js');
  const fix = read('public/media-background-library-fix.js');

  assert.equal(polish.includes("fix.src = '/media-background-library-fix.js'"), true);
  assert.equal(fix.includes('#mediaLibrary.media-library'), true);
  assert.equal(fix.includes('display:block!important'), true);
  assert.equal(fix.includes('grid-template-columns:none!important'), true);
  assert.equal(fix.includes('safeHeaderValue'), true);
  assert.equal(fix.includes("'x-template-name':safeName"), true);
  assert.equal(fix.includes("method:'PATCH'"), true);
  assert.equal(fix.includes('randomUUID'), true);
});
