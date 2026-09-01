import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../public/stage15-create-cleanup.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/recovery-text-blast.js', import.meta.url), 'utf8');

test('safe Create cleanup keeps background picker separate from media picker', () => {
  assert.match(code, /🖼 Pick a Background/);
  assert.match(code, /stage15MediaPicker/);
  assert.match(code, /📷 Choose Photo or Video/);
  assert.match(code, /Use Uploaded Media/);
  assert.match(code, /From My Phone/);
  assert.doesNotMatch(code, /comic-studio-inner/);
});

test('uploaded-media picker can reuse prior post media or open the phone picker', () => {
  assert.match(code, /fetch\('\/api\/posts'/);
  assert.match(code, /data-stage15-media-key/);
  assert.match(code, /new File\(\[blob\]/);
  assert.match(code, /handleMedia\(file\)/);
  assert.match(code, /#mediaInput/);
});

test('Create cleanup makes the legacy drop zone a compact preview only', () => {
  assert.match(code, /#stage15MediaPicker #dropZone/);
  assert.match(code, /stage15-empty-media/);
  assert.match(code, /#uploadPrompt/);
  assert.match(code, /display:none!important/);
});

test('Create cleanup orders caption after media and helper buttons after caption', () => {
  assert.match(code, /mediaPicker\.after\(captionCard\)/);
  assert.match(code, /captionCard\.after\(tools\)/);
  assert.match(code, /stage15HelperGroup/);
  assert.match(code, /Make It Easy/);
  assert.match(code, /Use My Suggestions/);
  assert.match(code, /Help Me Post This/);
});

test('Create cleanup trims the old hero and explanatory copy without touching Comic controls', () => {
  assert.match(code, /#easyCreateIntro/);
  assert.match(code, /#easyMediaStep/);
  assert.match(code, /comic-studio-copy/);
  assert.doesNotMatch(code, /inner\.insertBefore\(upload/);
  assert.doesNotMatch(code, /upload\.after\(drop\)/);
});

test('recovery loader boots safe Create cleanup after Comic polish', () => {
  assert.match(loader, /cleanup\.src = '\/stage15-create-cleanup\.js'/);
  assert.match(loader, /dataset\.stage15CreateCleanup/);
  assert.match(loader, /polish\.addEventListener\('load',loadCreateCleanup/);
  assert.match(loader, /comic-text-style\.js/);
  assert.match(loader, /comic-blast-wysiwyg\.js/);
  assert.match(loader, /comic-blast-stage13-fix\.js/);
});
