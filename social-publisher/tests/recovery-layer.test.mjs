import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('core recovery boots only the intended front-end layers', () => {
  const html = read('public/index.html');
  assert.equal(html.includes('<script src="/app.js"></script>'), true);
  assert.equal(html.includes('Core recovery mode'), true);
});
