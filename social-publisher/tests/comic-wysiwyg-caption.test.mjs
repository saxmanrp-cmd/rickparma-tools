import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../public/comic-blast-wysiwyg.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/recovery-text-blast.js', import.meta.url), 'utf8');

test('Comic Blast uses an exact-size renderer and safe canvas font', () => {
  assert.match(code, /bold \$\{m\.fontSize\}px Arial/);
  assert.match(code, /This is the exact final text size/);
  assert.match(code, /Fit to Bubble/);
  assert.match(code, /interceptLegacyMakeButtons/);
});

test('Text Blast is moved to the main caption workflow', () => {
  assert.match(code, /Load a Text Blast into the caption/);
  assert.match(code, /captionArea\.value = message/);
  assert.match(code, /#comicBlastStudio #comicBlastConnected/);
  assert.match(code, /Speech Bubble Text/);
});

test('recovery loader boots the exact editor', () => {
  assert.match(loader, /comic-blast-wysiwyg\.js/);
  assert.match(loader, /data-comic-blast-wysiwyg/);
});
