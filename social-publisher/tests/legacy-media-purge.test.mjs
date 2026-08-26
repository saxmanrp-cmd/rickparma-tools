import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const purge = fs.readFileSync(new URL('../public/legacy-media-purge.js', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../public/media-boot-guard.js', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/comic-blast-polish.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Media boot guard suppresses the old post-media gallery without a mutation loop', () => {
  assert.match(guard,/socialPublisherV3/);
  assert.match(guard,/data\.media = \[\]/);
  assert.match(guard,/\.media-tile/);
  assert.match(guard,/renderMediaLibrary/);
  assert.match(guard,/Loading backgrounds/);
  assert.doesNotMatch(guard,/MutationObserver/);
  assert.doesNotMatch(purge,/MutationObserver/);
});

test('Media boot guard runs before and immediately after app.js', () => {
  const before = index.indexOf('<script src="/media-boot-guard.js"></script>');
  const app = index.indexOf('<script src="/app.js"></script>');
  const after = index.indexOf('window.__lockLegacyMedia?.();');
  assert.ok(before >= 0 && app >= 0 && after >= 0);
  assert.ok(before < app && app < after);
});

test('Comic polish still starts the Background Library before naming cleanup fetches', () => {
  assert.match(polish,/legacy-media-purge\.js/);
  assert.match(polish,/media-background-library\.js/);
  const purgeIndex = polish.indexOf('loadLegacyMediaPurge();');
  const libraryIndex = polish.indexOf('loadMediaBackgroundLibrary();');
  const fetchIndex = polish.indexOf("fetch('/api/comic-templates'");
  assert.ok(purgeIndex >= 0 && libraryIndex >= 0 && fetchIndex >= 0);
  assert.ok(purgeIndex < libraryIndex && libraryIndex < fetchIndex);
});
