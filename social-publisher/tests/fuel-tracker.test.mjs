import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const htmlPath = new URL('../../nutrition-tracker.html', import.meta.url);
const entryPath = new URL('../src/entry.js', import.meta.url);
const wranglerPath = new URL('../wrangler.jsonc', import.meta.url);

test('Fuel Tracker page has the complete daily app UI and valid inline JavaScript', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /Rick's Fuel Tracker/);
  assert.match(html, /Analyze meal/);
  assert.match(html, /Current body composition/);
  assert.match(html, /Export data/);
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'inline app script is present');
  assert.doesNotThrow(() => new Function(match[1]));
});

test('Fuel Tracker AI endpoint and Workers AI binding are configured', async () => {
  const entry = await readFile(entryPath, 'utf8');
  const wrangler = await readFile(wranglerPath, 'utf8');
  assert.match(entry, /\/api\/fuel\/analyze/);
  assert.match(entry, /env\.AI\.toMarkdown/);
  assert.match(entry, /@cf\/google\/gemma-4-26b-a4b-it/);
  assert.match(wrangler, /"ai"\s*:\s*\{/);
  assert.match(wrangler, /"binding"\s*:\s*"AI"/);
});
