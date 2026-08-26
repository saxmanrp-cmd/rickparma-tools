import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../public/stage15-create-cleanup.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/recovery-text-blast.js', import.meta.url), 'utf8');

test('Create cleanup uses a compact media source picker', () => {
  assert.match(code, /Choose Media/);
  assert.match(code, /Use media already in the app/);
  assert.match(code, /Choose photo or video from my phone/);
  assert.match(code, /nav-item\[data-view=\\?"media\\?"\]/);
  assert.match(code, /mediaInput/);
});

test('Create cleanup orders caption before helper tools', () => {
  assert.match(code, /mediaCard\.after\(captionCard\)/);
  assert.match(code, /captionCard\.after\(tools\)/);
  assert.match(code, /Make It Easy/);
  assert.match(code, /Use My Suggestions/);
});

test('Create cleanup trims extra copy and renames Comic Blast', () => {
  assert.match(code, /#easyCreateIntro/);
  assert.match(code, /comic-studio-copy/);
  assert.match(code, /Pick a Background/);
});

test('recovery loader boots Stage 15 after Comic Blast polish', () => {
  assert.match(loader, /stage15-create-cleanup\.js/);
  assert.match(loader, /data-stage15-create-cleanup/);
});
