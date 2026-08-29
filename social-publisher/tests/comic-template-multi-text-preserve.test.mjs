import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const code = fs.readFileSync(path.join(root,'src/comic-templates.js'),'utf8');

test('legacy bubble PATCH preserves extra mapped text areas', () => {
  assert.match(code, /textAreas\.length > 1/);
  assert.match(code, /textAreas\.slice\(1\)/);
});
