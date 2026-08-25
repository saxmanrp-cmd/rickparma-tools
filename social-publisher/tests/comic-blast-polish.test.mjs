import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root,rel),'utf8');

test('Comic Blast polish hides machine filenames and starts on populated content', () => {
  const helper = read('public/recovery-show-helper.js');
  const polish = read('public/comic-blast-polish.js');
  assert.equal(helper.includes("polish.src = '/comic-blast-polish.js'"),true);
  assert.equal(polish.includes('looksMachineNamed'),true);
  assert.equal(polish.includes('Scene ${index+1}'),true);
  assert.equal(polish.includes('chooseInitialPopulatedCategory'),true);
  assert.equal(polish.includes("fetch('/api/comic-templates'"),true);
  assert.equal(polish.includes('setInterval'),false);
  assert.equal(polish.includes('new MutationObserver'),false);
});
