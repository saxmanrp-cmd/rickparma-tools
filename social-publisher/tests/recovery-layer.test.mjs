import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('recovery stage 2 boots core, Reach Intelligence, and Calendar/Gig tools only', () => {
  const html = read('public/index.html');
  assert.equal(html.includes('<script src="/app.js"></script>'), true);
  assert.equal(html.includes('<script src="/reach-intelligence.js"></script>'), true);
  assert.equal(html.includes('<script src="/gig-campaign.js"></script>'), true);
  assert.equal(html.includes('<script src="/calendar-sync.js"></script>'), true);
  for (const asset of ['/passkeys.js','/smart-plan.js','/easy-mode.js','/flyer-first.js','/weekly-planner.js','/content-coach.js']) {
    assert.equal(html.includes(`<script src="${asset}"></script>`), false, `${asset} should remain disabled in stage 2`);
  }
  assert.equal(html.includes('Recovery Stage 2'), true);
});
