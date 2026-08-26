import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/smart-schedule-awareness.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/comic-fullscreen-retire.js', import.meta.url), 'utf8');

test('Help Me timing checks existing scheduled and published posts', () => {
  assert.match(source, /MAX_POSTS_PER_DAY = 2/);
  assert.match(source, /scheduledAt \|\| post\?\.publishedAt/);
  assert.match(source, /syncRemotePosts/);
  assert.match(source, /#showHelperBtn,#useReachTimeBtn/);
});

test('busy days are skipped and suggestions keep healthy spacing', () => {
  assert.match(source, /dayPosts\.length >= MAX_POSTS_PER_DAY/);
  assert.match(source, /MIN_SPACING_MS = 5 \* 60 \* 60 \* 1000/);
  assert.match(source, /I moved this to/);
});

test('smart schedule layer is loaded by the live comic/create chain', () => {
  assert.match(loader, /smart-schedule-awareness\.js/);
  assert.match(loader, /loadSmartScheduleAwareness/);
});
