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
  ]) assert.equal(smart.includes(needle), true, `Smart Plan missing ${needle}`);

  assert.equal(passkeys.includes("smartPlan.src = '/smart-plan.js'"), true);
  assert.equal(smart.includes("coach.src = '/content-coach.js'"), true);
  assert.equal(smart.includes("planner.src = '/weekly-planner.js'"), true);
  assert.equal(sw.includes("'/smart-plan.js'"), true);
  assert.equal(sw.includes("'/content-coach.js'"), true);
  assert.equal(sw.includes("'/weekly-planner.js'"), true);
  assert.equal(sw.includes('social-publisher-shell-v720'), true);
  assert.equal(pkg.includes('public/smart-plan.js'), true);
  assert.equal(pkg.includes('public/content-coach.js'), true);
  assert.equal(pkg.includes('public/weekly-planner.js'), true);
  assert.equal(pkg.includes('"version": "0.7.2"'), true);
});
