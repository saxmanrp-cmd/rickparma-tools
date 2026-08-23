import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Content Coach recommends before media and personalizes from performance profile', () => {
  const coach = read('public/content-coach.js');
  const smart = read('public/smart-plan.js');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');

  for (const needle of [
    'Content Coach',
    'What should I post next?',
    'Your best next post',
    'Start This Post',
    'Another Idea',
    '/api/intelligence/profile',
    'bestFormat',
    'bestWindow',
    'captionPattern',
    "dropZone.parentNode.insertBefore(card, dropZone)",
    "if (caption && !caption.value.trim())",
    "input.accept = idea.accept",
    "input.click()",
  ]) assert.equal(coach.includes(needle), true, `Content Coach missing ${needle}`);

  assert.equal(smart.includes("coach.src = '/content-coach.js'"), true);
  assert.equal(sw.includes("'/content-coach.js'"), true);
  assert.equal(sw.includes('social-publisher-shell-v710'), true);
  assert.equal(pkg.includes('public/content-coach.js'), true);
  assert.equal(pkg.includes('"version": "0.7.1"'), true);
});
