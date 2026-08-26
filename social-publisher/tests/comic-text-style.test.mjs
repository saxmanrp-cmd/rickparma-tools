import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const style = fs.readFileSync(new URL('../public/comic-text-style.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/recovery-text-blast.js', import.meta.url), 'utf8');

test('comic text style offers four speech-bubble fonts and four colors', () => {
  for (const label of ['Comic Bold','Classic Comic','Impact / Shout','Handwritten']) {
    assert.equal(style.includes(label), true, label);
  }
  for (const label of ['Black','White (black bubbles)','Yellow','Red']) {
    assert.equal(style.includes(label), true, label);
  }
  assert.match(style,/comicTextFont/);
  assert.match(style,/comicTextColor/);
});

test('conversation scenes default to white bubble text and styles persist per category', () => {
  assert.match(style,/includes\('conversation'\)/);
  assert.match(style,/#FFFFFF/);
  assert.match(style,/socialPublisherComicTextStylesByCategory/);
  assert.match(style,/saveCategoryStyle/);
});

test('Fit to Bubble and final comic export use the selected font and color', () => {
  assert.match(style,/ctx\.font = canvasFont\(fontSize\)/);
  assert.match(style,/ctx\.fillStyle = color/);
  assert.match(style,/ctx\.font = canvasFont\(m\.fontSize\)/);
  assert.match(style,/comicFitBtn,#comicFullscreenFit/);
  assert.match(style,/comicMakeBtn,#comicFullscreenMake/);
});

test('comic text style loads before the legacy exact WYSIWYG renderer', () => {
  assert.match(loader,/comic-text-style\.js/);
  const styleLoad = loader.indexOf('loadComicTextStyle();');
  const wysiwygLoad = loader.indexOf('loadWysiwyg();');
  assert.ok(styleLoad >= 0 && wysiwygLoad >= 0);
  assert.match(loader,/style\.addEventListener\('load',loadWysiwyg/);
});
