import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('lyrics finder includes in-app source viewer and direct-result search', () => {
  assert.match(html, /id="sourceFrame"/);
  assert.match(html, /Find Lyrics/);
  assert.match(html, /Open Source/);
  assert.match(html, /duckduckgo\.com\/\?q=/);
  assert.match(html, /encodeURIComponent\(`\\\\\$\{query\}`\)/);
});

test('copy formatter remains available', () => {
  assert.match(html, /id="paste"/);
  assert.match(html, /id="copy"/);
  assert.match(html, /TITLE · ARTIST · body/);
});
