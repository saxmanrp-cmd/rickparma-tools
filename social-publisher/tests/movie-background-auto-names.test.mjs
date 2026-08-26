import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('movie background cleanup recognizes the current uploaded pack', () => {
  const script = read('public/movie-background-auto-names.js');
  for (const expected of [
    'Cypher Steak Dinner',
    "Who's With Me? Office Rally",
    'Billy Madison Pool Raft',
    'You Had Me at Hello',
    'Sloth Pirate Ship Celebration',
    'Dumb and Dumber Scooter Ride',
    'Pulp Fiction Diner Shout',
    'Charlie Brown Classroom',
    'Spider-Man Daily Beacon',
    'Marty & Doc Time Machine',
    'Neo & Morpheus Matrix',
  ]) assert.equal(script.includes(expected), true, expected);
  assert.equal(script.includes("method:'PATCH'"), true);
  assert.equal(script.includes("id.startsWith('2D4443FD')"), true);
  assert.equal(script.includes("id.startsWith('D35FDB4C')"), true);
});

test('comic polish loads movie background cleanup', () => {
  const polish = read('public/comic-blast-polish.js');
  assert.equal(polish.includes("script.src = '/movie-background-auto-names.js'"), true);
});
