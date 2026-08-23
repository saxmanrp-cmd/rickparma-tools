import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Easy Mode remains the beginner-friendly base under Flyer First', () => {
  const easy = read('public/easy-mode.js');
  const smart = read('public/smart-plan.js');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');
  const entry = read('src/entry.js');

  for (const needle of [
    'Easy Mode makes Create and Calendar beginner-friendly',
    'Let’s make a post',
    'Choose something to share',
    'Choose a Photo or Video',
    'What do you want to say?',
    'Where should it go?',
    'Post it now or later?',
    'Need an idea? 💡',
    'Let’s Make It 🎬',
    'Show Me Another',
    'More options · Reels, Stories, Tags',
    '✨ Do It For Me',
  ]) assert.equal(easy.includes(needle), true, `Easy Mode missing ${needle}`);

  assert.equal(smart.includes("loadScript('/easy-mode.js','easy-mode'"), true);
  assert.equal(smart.includes("loadScript('/flyer-first.js','flyer-first'"), true);
  assert.equal(sw.includes("'/easy-mode.js'"), true);
  assert.equal(sw.includes("'/flyer-first.js'"), true);
  assert.equal(sw.includes('social-publisher-shell-v760'), true);
  assert.equal(pkg.includes('public/easy-mode.js'), true);
  assert.equal(pkg.includes('public/flyer-first.js'), true);
  assert.equal(pkg.includes('"version": "0.7.6"'), true);
  assert.equal(entry.includes("const VERSION = '0.7.6'"), true);
});
