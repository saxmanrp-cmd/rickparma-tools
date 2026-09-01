import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../public/stage15-create-cleanup.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/recovery-text-blast.js', import.meta.url), 'utf8');

test('Create cleanup keeps Comic Blast as its own visible Pick a Background section', () => {
  assert.match(code, /🖼 Pick a Background/);
  assert.match(code, /comic\.open = true/);
  assert.match(code, /stage16InitialOpen/);
  assert.doesNotMatch(code, /summary\.textContent = '🖼 Choose Media'/);
});

test('Create cleanup gives media its own compact pull-down chooser', () => {
  assert.match(code, /stage15MediaChooser/);
  assert.match(code, /Choose Photo or Video/);
  assert.match(code, /App Library/);
  assert.match(code, /My Phone/);
  assert.match(code, /stage15UseAppLibraryBtn/);
  assert.match(code, /stage15UploadMediaBtn/);
  assert.match(code, /navigate\('media'\)/);
  assert.match(code, /mediaInput/);
});

test('generated comic stays in place and redundant compact preview is hidden', () => {
  assert.match(code, /stage15-comic-generated-media/);
  assert.match(code, /#comicMakeBtn/);
  assert.match(code, /savedY = window\.scrollY/);
  assert.match(code, /drop\.scrollIntoView = \(\) => \{\}/);
  assert.match(code, /window\.scrollTo\(\{ top:savedY/);
});

test('manual media upload restores the normal selected-media preview', () => {
  assert.match(code, /suppressGeneratedPreview\(false\)/);
  assert.match(code, /#mediaInput/);
  assert.match(code, /#removeMediaBtn/);
});

test('Create order is background, media, caption, then helper tools', () => {
  assert.match(code, /comic\.after\(chooser\)/);
  assert.match(code, /chooser\.after\(captionCard\)/);
  assert.match(code, /captionCard\.after\(tools\)/);
  assert.match(code, /Make It Easy/);
  assert.match(code, /Use My Suggestions/);
});

test('Create cleanup removes the extra hero/helper copy but preserves buttons', () => {
  assert.match(code, /#easyCreateIntro/);
  assert.match(code, /comic-studio-copy/);
  assert.match(code, /#stage15HelperGroup #maxReachCard>:not\(#applyMaxReachBtn\)/);
  assert.match(code, /#stage15HelperGroup #recoveryShowHelper>:not\(#showHelperBtn\)/);
});

test('recovery loader still boots the Create cleanup layer after Comic Blast polish', () => {
  assert.match(loader, /stage15-create-cleanup\.js/);
  assert.match(loader, /data-stage15-create-cleanup/);
});
