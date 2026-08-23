import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Gig Campaigns remain available while Flyer First collapses update scrolling', () => {
  const backend = read('src/content-plan.js');
  const campaign = read('public/gig-campaign.js');
  const flyer = read('public/flyer-first.js');
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

  assert.equal(flyer.includes('gig-phase-select'), true);
  assert.equal(flyer.includes('simplifyCampaignGroups'), true);
  for (const asset of ['/gig-campaign.js','/calendar-sync.js','/easy-mode.js','/flyer-first.js']) {
    assert.equal(smart.includes(`'${asset}'`), true);
    assert.equal(sw.includes(`'${asset}'`), true);
  }
  assert.equal(sw.includes('social-publisher-shell-v760'), true);
  for (const pathName of ['public/gig-campaign.js','public/calendar-sync.js','public/easy-mode.js','public/flyer-first.js']) assert.equal(pkg.includes(pathName), true);
  assert.equal(pkg.includes('"version": "0.7.6"'), true);
  assert.equal(entry.includes("const VERSION = '0.7.6'"), true);
});
