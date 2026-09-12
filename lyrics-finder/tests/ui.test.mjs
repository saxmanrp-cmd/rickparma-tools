import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('lyrics finder embeds DuckDuckGo lyrics mode', () => {
  assert.match(html, /Load Lyrics Card/);
  assert.match(html, /id="lyricsFrame"/);
  assert.match(html, /lyricsFrame'\)\.src=url/);
  assert.match(html, /https:\/\/duckduckgo\.com\/\?/);
  assert.match(html, /params\.set\('iax','lyrics'\)/);
  assert.match(html, /params\.set\('ia','web'\)/);
  assert.match(html, /params\.set\('t','iphone'\)/);
  assert.match(html, /lyrics to \$\{parts\.title\} by \$\{parts\.artist\}/);
});

test('Safari fallback remains available if framing is blocked', () => {
  assert.match(html, /id="openSafari"/);
  assert.match(html, /Open in Safari/);
  assert.match(html, /window\.open\(state\.duckUrl/);
});

test('copy formatter remains available', () => {
  assert.match(html, /id="paste"/);
  assert.match(html, /id="copy"/);
  assert.match(html, /TITLE · ARTIST · body/);
});
