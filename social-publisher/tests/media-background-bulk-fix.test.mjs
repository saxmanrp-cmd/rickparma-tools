import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const stable = fs.readFileSync(new URL('../public/media-background-bulk-stable.js', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/comic-blast-polish.js', import.meta.url), 'utf8');

test('stable bulk mover loads destination categories before moving', () => {
  assert.match(stable,/fetch\('\/api\/comic-templates'/);
  assert.match(stable,/Choose where to move them/);
  assert.match(stable,/Move selected to/);
  assert.match(stable,/Move Selected/);
  assert.match(stable,/showPicker/);
});

test('current category is excluded from destination choices', () => {
  assert.match(stable,/normalize\(category\) !== normalize\(current\)/);
});

test('comic polish no longer loads the observer-based bulk destination fix', () => {
  assert.match(polish,/media-background-bulk-stable\.js/);
  assert.doesNotMatch(polish,/media-background-bulk-fix\.js/);
});
