import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const smart = await readFile(new URL('../public/smart-ratio-people-reach.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/comic-fullscreen-retire.js', import.meta.url), 'utf8');

test('generated comic compact preview is suppressed and create navigation is preserved', () => {
  assert.match(smart, /smart-comic-generated/);
  assert.match(smart, /stage15-comic-generated-media/);
  assert.match(smart, /makingComic&&view==='create'/);
});

test('All Sizes is the default comic format option', () => {
  assert.match(smart, /<option value=\"all\">All Sizes<\/option>/);
  assert.match(smart, /sessionStorage\.setItem\(FORMAT_KEY,'all'\)/);
});

test('9:16 assets generate a top-anchored reusable 4:5 crop', () => {
  assert.match(smart, /cropH=Math\.min\(sh,Math\.round\(sw\/\(4\/5\)\)\)/);
  assert.match(smart, /drawImage\(img,0,0,sw,cropH,0,0,c\.width,c\.height\)/);
  assert.match(smart, /'x-template-format':'feed'/);
  assert.match(smart, /--feed--autocrop/);
});

test('Help routing separates vertical and feed destinations', () => {
  assert.match(smart, /fmt==='story'/);
  assert.match(smart, /setRadio\('igType',video\?'reel':'story'\)/);
  assert.match(smart, /setRadio\('igType','post'\)/);
  assert.match(smart, /setRadio\('fbType','post'\)/);
});

test('People & Reach settings and suggestions are included', () => {
  assert.match(smart, /People & Reach/);
  assert.match(smart, /Audience interests/);
  assert.match(smart, /Suggested People/);
  assert.match(smart, /Use These Suggestions/);
});

test('loader starts the smart publishing layer', () => {
  assert.match(loader, /smart-ratio-people-reach\.js/);
});
