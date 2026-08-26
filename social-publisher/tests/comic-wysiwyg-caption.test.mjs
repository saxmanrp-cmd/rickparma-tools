import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../public/comic-blast-wysiwyg.js', import.meta.url), 'utf8');
const fix = fs.readFileSync(new URL('../public/comic-blast-stage13-fix.js', import.meta.url), 'utf8');
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

test('Stage 13 keeps typed bubble text before the exact make handler runs', () => {
  assert.match(fix, /window\.addEventListener\('click',preserveBubbleTextBeforeMake,true\)/);
  assert.match(fix, /#comicMakeBtn,#comicFullscreenMake/);
  assert.match(fix, /full\.innerText = value/);
  assert.match(fix, /area\.value = value/);
});

test('Stage 13 removes the visible size sliders but keeps button sizing controls', () => {
  assert.match(fix, /#comicFontRange/);
  assert.match(fix, /#comicFullscreenRange/);
  assert.match(fix, /display:none!important/);
  assert.match(fix, /comic-font-row\{grid-template-columns:1fr 1fr/);
});

test('recovery loader boots exact editor then Stage 13 polish', () => {
  assert.match(loader, /comic-blast-wysiwyg\.js/);
  assert.match(loader, /data-comic-blast-wysiwyg/);
  assert.match(loader, /comic-blast-stage13-fix\.js/);
  assert.match(loader, /data-comic-stage13-fix/);
});
