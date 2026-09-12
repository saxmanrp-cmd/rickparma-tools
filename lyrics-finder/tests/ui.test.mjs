import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('lyrics finder opens a direct Google lyrics search', () => {
  assert.match(html, /Find Lyrics on Google/);
  assert.match(html, /https:\/\/www\.google\.com\/search\?q=/);
  assert.match(html, /window\.location\.href/);
  assert.match(html, /\$\{title\} \$\{artist\} lyrics/);
  assert.doesNotMatch(html, /id="sourceFrame"/);
  assert.doesNotMatch(html, /duckduckgo\.com/);
});

test('search context is preserved for returning from Google', () => {
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /window\.addEventListener\('pageshow',restoreSearch\)/);
});

test('copy formatter remains available', () => {
  assert.match(html, /id="paste"/);
  assert.match(html, /id="copy"/);
  assert.match(html, /TITLE · ARTIST · body/);
});
