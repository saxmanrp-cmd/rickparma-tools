import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('lyrics finder opens DuckDuckGo lyrics mode as the top-level page', () => {
  assert.match(html, /Open Lyrics Card/);
  assert.match(html, /https:\/\/duckduckgo\.com\/\?/);
  assert.match(html, /params\.set\('iax','lyrics'\)/);
  assert.match(html, /params\.set\('ia','web'\)/);
  assert.match(html, /params\.set\('t','iphone'\)/);
  assert.match(html, /lyrics to \$\{parts\.title\} by \$\{parts\.artist\}/);
  assert.match(html, /window\.location\.href=url/);
  assert.doesNotMatch(html, /id="lyricsFrame"/);
});

test('search context is preserved for Back navigation', () => {
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /window\.addEventListener\('pageshow',restoreSearch\)/);
  assert.match(html, /pending:true/);
});

test('copy formatter remains available', () => {
  assert.match(html, /id="paste"/);
  assert.match(html, /id="copy"/);
  assert.match(html, /TITLE · ARTIST · body/);
});
