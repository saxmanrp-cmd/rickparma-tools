import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Rick Parma comic pack uses the ten canonical scene names', () => {
  const script = read('public/rick-parma-background-auto-names.js');
  for (const name of [
    'Neon Nightlife','Backstage Pass','Casino Lounge','Retro Action Vibe','Noir Detective',
    'Beach Party Vibes','Sci-Fi City','Comic Newsroom','Grand Stage Entrance','Upscale Lounge',
  ]) assert.equal(script.includes(name), true, name);
  assert.equal(script.includes("CATEGORY = 'Rick Parma Comics'"), true);
  assert.equal(script.includes("method:'PATCH'"), true);
});

test('auto bubble mapper intercepts comic background PUT uploads and writes coordinates', () => {
  const script = read('public/auto-bubble-map.js');
  assert.equal(script.includes("method === 'PUT'"), true);
  assert.equal(script.includes('comic-templates'), true);
  assert.equal(script.includes("headers.set('x-bubble-x'"), true);
  assert.equal(script.includes("headers.set('x-bubble-y'"), true);
  assert.equal(script.includes("headers.set('x-bubble-width'"), true);
  assert.equal(script.includes("headers.set('x-bubble-height'"), true);
  assert.equal(script.includes('componentCandidates'), true);
  assert.equal(script.includes('createImageBitmap'), true);
});

test('comic polish loads both cleanup and bubble scripts', () => {
  const polish = read('public/comic-blast-polish.js');
  assert.equal(polish.includes("script.src = '/rick-parma-background-auto-names.js'"), true);
  assert.equal(polish.includes("script.src = '/auto-bubble-map.js'"), true);
  assert.equal(polish.indexOf('loadAutoBubbleMap();') < polish.indexOf('loadMediaBackgroundLibrary();'), true);
});
