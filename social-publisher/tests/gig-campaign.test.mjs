import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Gig Campaigns build an isolated multi-touch show campaign', () => {
  const backend = read('src/content-plan.js');
  const campaign = read('public/gig-campaign.js');
  const smart = read('public/smart-plan.js');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');
  const entry = read('src/entry.js');

  for (const needle of ['validSource','gig-campaign:','source=?','content_plan_items']) {
    assert.equal(backend.includes(needle), true, `content-plan backend missing ${needle}`);
  }

  for (const needle of [
    'Gig Campaigns',
    'Build Gig Campaign',
    'campaignPhases',
    "'announce'",
    "'reminder'",
    "'day-of'",
    "id:'recap'",
    'crypto.randomUUID()',
    '/api/content-plan/generate',
    'source',
    'Start Post',
    "navigate('create')",
    "if (caption && !caption.value.trim())",
    'scheduleDate',
    'scheduleTime',
    'mediaAccept',
  ]) assert.equal(campaign.includes(needle), true, `Gig Campaign client missing ${needle}`);

  assert.equal(smart.includes("'/gig-campaign.js'"), true);
  assert.equal(smart.includes("'/calendar-sync.js'"), true);
  assert.equal(sw.includes("'/gig-campaign.js'"), true);
  assert.equal(sw.includes("'/calendar-sync.js'"), true);
  assert.equal(sw.includes('social-publisher-shell-v740'), true);
  assert.equal(pkg.includes('public/gig-campaign.js'), true);
  assert.equal(pkg.includes('public/calendar-sync.js'), true);
  assert.equal(pkg.includes('"version": "0.7.4"'), true);
  assert.equal(entry.includes("const VERSION = '0.7.4'"), true);
});
