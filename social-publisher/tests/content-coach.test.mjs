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

  for (const needle of [
    "loadScript('/content-coach.js','content-coach')",
    "loadScript('/weekly-planner.js','weekly-planner')",
    "loadScript('/gig-campaign.js','gig-campaign'",
    "'/calendar-sync.js','calendar-sync'",
    "'/easy-mode.js','easy-mode'",
  ]) assert.equal(smart.includes(needle), true, `loader missing ${needle}`);

  for (const asset of ['/content-coach.js','/weekly-planner.js','/gig-campaign.js','/calendar-sync.js','/easy-mode.js']) {
    assert.equal(sw.includes(`'${asset}'`), true, `shell missing ${asset}`);
  }
  assert.equal(sw.includes('social-publisher-shell-v750'), true);
  for (const pathName of ['public/content-coach.js','public/weekly-planner.js','public/gig-campaign.js','public/calendar-sync.js','public/easy-mode.js']) {
    assert.equal(pkg.includes(pathName), true, `package check missing ${pathName}`);
  }
  assert.equal(pkg.includes('"version": "0.7.5"'), true);
});
