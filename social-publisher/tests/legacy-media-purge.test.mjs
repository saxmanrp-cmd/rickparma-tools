import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const purge = fs.readFileSync(new URL('../public/legacy-media-purge.js', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/comic-blast-polish.js', import.meta.url), 'utf8');

test('legacy Media gallery is removed and prototype media is cleared', () => {
  assert.match(purge,/socialPublisherV3/);
  assert.match(purge,/data\.media = \[\]/);
  assert.match(purge,/#mediaLibrary/);
  assert.match(purge,/page-row/);
  assert.match(purge,/renderMediaLibrary/);
  assert.match(purge,/MutationObserver/);
});

test('Comic polish loads legacy Media purge before the Background Library', () => {
  assert.match(polish,/legacy-media-purge\.js/);
  const purgeIndex = polish.indexOf('loadLegacyMediaPurge();');
  const libraryIndex = polish.indexOf('loadMediaBackgroundLibrary();');
  assert.ok(purgeIndex >= 0 && libraryIndex >= 0 && purgeIndex < libraryIndex);
});
