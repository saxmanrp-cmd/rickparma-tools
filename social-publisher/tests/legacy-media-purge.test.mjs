import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const purge = fs.readFileSync(new URL('../public/legacy-media-purge.js', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/comic-blast-polish.js', import.meta.url), 'utf8');

test('legacy Media tiles are hidden without deleting the Background Library mount', () => {
  assert.match(purge,/socialPublisherV3/);
  assert.match(purge,/data\.media = \[\]/);
  assert.match(purge,/#mediaLibrary/);
  assert.match(purge,/\.media-tile/);
  assert.match(purge,/renderMediaLibrary/);
  assert.match(purge,/Loading backgrounds/);
  assert.match(purge,/MutationObserver/);
  assert.doesNotMatch(purge,/querySelector\(':scope > #mediaLibrary'\)\?\.remove/);
  assert.doesNotMatch(purge,/page-row.*remove/);
});

test('Comic polish starts the Background Library before naming cleanup fetches', () => {
  assert.match(polish,/legacy-media-purge\.js/);
  assert.match(polish,/media-background-library\.js/);
  const purgeIndex = polish.indexOf('loadLegacyMediaPurge();');
  const libraryIndex = polish.indexOf('loadMediaBackgroundLibrary();');
  const fetchIndex = polish.indexOf("fetch('/api/comic-templates'");
  assert.ok(purgeIndex >= 0 && libraryIndex >= 0 && fetchIndex >= 0);
  assert.ok(purgeIndex < libraryIndex && libraryIndex < fetchIndex);
});
