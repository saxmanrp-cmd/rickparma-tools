import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('recovery stage 4 boots core, Reach, Calendar/Gig, safe Easy/Flyer, and isolated Text Blast only', () => {
  const html = read('public/index.html');
  const safeUi = read('public/recovery-easy-flyer.js');
  const polish = read('public/stage3-ui-polish.js');
  const textBlast = read('public/recovery-text-blast.js');
  assert.equal(html.includes('<script src="/app.js"></script>'), true);
  assert.equal(html.includes('<script src="/reach-intelligence.js"></script>'), true);
  assert.equal(html.includes('<script src="/gig-campaign.js"></script>'), true);
  assert.equal(html.includes('<script src="/calendar-sync.js"></script>'), true);
  assert.equal(html.includes('<script src="/recovery-easy-flyer.js"></script>'), true);
  for (const asset of ['/passkeys.js','/smart-plan.js','/easy-mode.js','/flyer-first.js','/weekly-planner.js','/content-coach.js']) {
    assert.equal(html.includes(`<script src="${asset}"></script>`), false, `${asset} should remain disabled in recovery stage 4`);
  }
  assert.equal(safeUi.includes('Choose your flyer, photo, or video'), true);
  assert.equal(safeUi.includes('gig-phase-select'), true);
  assert.equal(safeUi.includes("polish.src = '/stage3-ui-polish.js'"), true);
  assert.equal(safeUi.includes("textBlast.src = '/recovery-text-blast.js'"), true);
  assert.equal(polish.includes('Help Me Get More Views'), true);
  assert.equal(polish.includes('Choose an event'), true);
  assert.equal(polish.includes('dateOnlyLabel'), true);
  assert.equal(polish.includes('showDatePicker'), true);
  assert.equal(polish.includes('is-selected-show'), true);
  assert.equal(polish.includes('More Promo Plans'), true);
  assert.equal(polish.includes('Scheduled Posts'), true);
  assert.equal(polish.includes('Event Name Calendar'), true);
  assert.equal(textBlast.includes('Turn a Text Blast into a post'), true);
  assert.equal(textBlast.includes('/api/text-blast/history'), true);
  assert.equal(textBlast.includes('Make Social Bubble'), true);
  assert.equal(textBlast.includes('canvas.width = 1080'), true);
  assert.equal(textBlast.includes('canvas.height = 1350'), true);
  assert.equal(textBlast.includes('new MutationObserver'), false);
  assert.equal(textBlast.includes('setInterval'), false);
  assert.equal(safeUi.includes('Recovery Stage 4'), true);
});
