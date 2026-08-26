import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fix = fs.readFileSync(new URL('../public/media-background-bulk-fix.js', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/comic-blast-polish.js', import.meta.url), 'utf8');

test('bulk mover loads destination categories before moving', () => {
  assert.match(fix,/fetch\('\/api\/comic-templates'/);
  assert.match(fix,/Choose where to move them/);
  assert.match(fix,/Move selected to/);
  assert.match(fix,/Move Selected/);
  assert.match(fix,/showPicker/);
});

test('current category is excluded from destination choices', () => {
  assert.match(fix,/normalize\(category\) !== normalize\(current\)/);
});

test('comic polish loads the bulk destination fix', () => {
  assert.match(polish,/media-background-bulk-fix\.js/);
  assert.match(polish,/data-media-background-bulk-fix/);
});
