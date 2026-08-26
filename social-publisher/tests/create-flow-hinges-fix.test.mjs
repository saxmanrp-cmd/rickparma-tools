import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fix = await readFile(new URL('../public/create-flow-hinges-fix.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/comic-fullscreen-retire.js', import.meta.url), 'utf8');

test('comic generation blocks top jumps and redundant drop-zone scrolling', () => {
  assert.match(fix, /comicScrollLockUntil/);
  assert.match(fix, /if \(top === 0\) return/);
  assert.match(fix, /this\.id === 'dropZone'/);
  assert.match(fix, /#comicMakeBtn,#comicFullscreenMake/);
});

test('Text Blast pull refreshes history before exposing the picker', () => {
  assert.match(fix, /#comicCaptionPullBtn/);
  assert.match(fix, /#comicCaptionBlastRefresh/);
  assert.match(fix, /block\.classList\.add\('is-open'\)/);
});

test('People and Reach profile is visible in Make It Easy even for Story posts', () => {
  assert.match(fix, /peopleReachCreatePanel/);
  assert.match(fix, /Audience & People/);
  assert.match(fix, /Instagram Story is selected/);
  assert.match(fix, /#smartPeopleSuggestions/);
});

test('tag controls expand automatically when saved people can be applied', () => {
  assert.match(fix, /#easyMoreOptions/);
  assert.match(fix, /igType !== 'story'/);
  assert.match(fix, /more\.open = true/);
});

test('final loader includes the hinge-fix layer after People and Reach', () => {
  assert.match(loader, /create-flow-hinges-fix\.js/);
  assert.match(loader, /loadCreateFlowHingesFix/);
});
