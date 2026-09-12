import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('lyrics finder opens DuckDuckGo lyrics mode', () => {
  assert.match(html, /Find Lyrics in DuckDuckGo/);
  assert.match(html, /https:\/\/duckduckgo\.com\/\?/);
  assert.match(html, /params\.set\('iax','lyrics'\)/);
  assert.match(html, /params\.set\('ia','web'\)/);
  assert.match(html, /params\.set\('t','iphone'\)/);
  assert.match(html, /lyrics to \$\{title\} by \$\{artist\}/);
  assert.match(html, /window\.location\.href/);
  assert.doesNotMatch(html, /google\.com\/search/);
});

test('search context is preserved for returning from DuckDuckGo', () => {
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /window\.addEventListener\('pageshow',restoreSearch\)/);
});

test('copy formatter remains available', () => {
  assert.match(html, /id="paste"/);
  assert.match(html, /id="copy"/);
  assert.match(html, /TITLE · ARTIST · body/);
});
