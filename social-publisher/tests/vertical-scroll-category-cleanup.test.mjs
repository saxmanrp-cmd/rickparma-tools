import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('People Talking cleanup preserves backgrounds by moving them to Conversation Scenes', () => {
  const script = read('public/people-talking-category-cleanup.js');
  assert.match(script,/People Talking/);
  assert.match(script,/Conversation Scenes/);
  assert.match(script,/method:'PATCH'/);
  assert.match(script,/category:DESTINATION/);
});

test('retired People Talking category is filtered from stored category lists', () => {
  const source = read('src/comic-templates.js');
  assert.match(source,/REMOVED_CATEGORIES = new Set\(\['people talking'\]\)/);
  assert.match(source,/REMOVED_CATEGORIES\.has\(key\)/);
});

test('app shell is locked to vertical page panning and page zoom is disabled', () => {
  const script = read('public/vertical-scroll-lock.js');
  assert.match(script,/overflow-x:hidden!important/);
  assert.match(script,/overscroll-behavior-x:none!important/);
  assert.match(script,/touch-action:pan-y!important/);
  assert.match(script,/maximum-scale=1/);
  assert.match(script,/user-scalable=no/);
  assert.match(script,/gesturestart/);
  assert.match(script,/touches\.length > 1/);
  assert.match(script,/\.app-shell,\.main,\.view/);
  assert.match(script,/max-width:100%/);
});

test('comic polish loads the vertical lock and People Talking cleanup', () => {
  const polish = read('public/comic-blast-polish.js');
  assert.match(polish,/vertical-scroll-lock\.js/);
  assert.match(polish,/people-talking-category-cleanup\.js/);
});
