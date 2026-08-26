import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../public/stage15-create-cleanup.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/recovery-text-blast.js', import.meta.url), 'utf8');

test('Create cleanup consolidates media upload into the Choose Media section', () => {
  assert.match(code, /🖼 Choose Media/);
  assert.match(code, /Upload a Photo or Video/);
  assert.match(code, /stage15UploadMediaBtn/);
  assert.match(code, /comic-studio-inner/);
  assert.match(code, /mediaInput/);
  assert.doesNotMatch(code, /stage15MediaSource/);
  assert.doesNotMatch(code, /Use media already in the app/);
  assert.doesNotMatch(code, /Choose photo or video from my phone/);
});

test('Create cleanup keeps generated comic in place and always hides redundant compact preview', () => {
  assert.match(code, /stage15-comic-generated-media/);
  assert.match(code, /#comicMakeBtn/);
  assert.match(code, /savedY = window\.scrollY/);
  assert.match(code, /drop\.scrollIntoView = \(\) => \{\}/);
  assert.match(code, /window\.scrollTo\(\{ top:savedY/);
  assert.match(code, /stage15-comic-generated-media #dropZone\.stage15-compact-media/);
  assert.match(code, /stage15-comic-generated-media #mediaPreview/);
  assert.match(code, /stage15-comic-generated-media #mediaActions/);
  assert.doesNotMatch(code, /after === before/);
});

test('manual media upload restores the normal selected-media preview', () => {
  assert.match(code, /suppressGeneratedPreview\(false\)/);
  assert.match(code, /#mediaInput/);
  assert.match(code, /#removeMediaBtn/);
});

test('Create cleanup orders caption immediately after Choose Media and before helper tools', () => {
  assert.match(code, /comic\.after\(captionCard\)/);
  assert.match(code, /captionCard\.after\(tools\)/);
  assert.match(code, /Make It Easy/);
  assert.match(code, /Use My Suggestions/);
});

test('Create cleanup removes the separate legacy media card and trims extra copy', () => {
  assert.match(code, /#easyCreateIntro/);
  assert.match(code, /comic-studio-copy/);
  assert.match(code, /stage15MediaCard/);
  assert.match(code, /oldCard\.remove\(\)/);
});

test('recovery loader boots Stage 15 after Comic Blast polish', () => {
  assert.match(loader, /stage15-create-cleanup\.js/);
  assert.match(loader, /data-stage15-create-cleanup/);
});
