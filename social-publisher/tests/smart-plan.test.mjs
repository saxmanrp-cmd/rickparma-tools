import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Smart Plan composes existing reach controls without overwriting captions', () => {
  const smart = read('public/smart-plan.js');
  const passkeys = read('public/passkeys.js');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');

  for (const needle of [
    'Build My Smart Plan',
    'Build My Personalized Plan',
    "q('#applyMaxReachBtn')",
    "q('#useReachTimeBtn')?.click()",
    "if (!hadCaption) q('#useReachCaptionBtn')?.click()",
    'Existing caption text is never overwritten',
    'platformSummary',
    'Smart Plan applied.',
    "loadScript('/content-coach.js','content-coach')",
    "loadScript('/weekly-planner.js','weekly-planner')",
    "loadScript('/gig-campaign.js','gig-campaign'",
    "'/calendar-sync.js','calendar-sync'",
    'stampVersion',
  ]) assert.equal(smart.includes(needle), true, `Smart Plan missing ${needle}`);

  assert.equal(passkeys.includes("smartPlan.src = '/smart-plan.js'"), true);
  for (const asset of ['/smart-plan.js','/content-coach.js','/weekly-planner.js','/gig-campaign.js','/calendar-sync.js']) {
    assert.equal(sw.includes(`'${asset}'`), true, `shell missing ${asset}`);
  }
  assert.equal(sw.includes('social-publisher-shell-v740'), true);
  for (const pathName of ['public/smart-plan.js','public/content-coach.js','public/weekly-planner.js','public/gig-campaign.js','public/calendar-sync.js']) {
    assert.equal(pkg.includes(pathName), true, `package check missing ${pathName}`);
  }
  assert.equal(pkg.includes('"version": "0.7.4"'), true);
});
