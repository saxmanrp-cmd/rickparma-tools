import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('recovery build keeps the proven core while Comic Blast replaces the old standalone Text Blast card', () => {
  const html = read('public/index.html');
  const safeUi = read('public/recovery-easy-flyer.js');
  const polish = read('public/stage3-ui-polish.js');
  const textBlastLoader = read('public/recovery-text-blast.js');
  const helper = read('public/recovery-show-helper.js');
  const comic = read('public/comic-blast-studio.js');

  assert.equal(html.includes('<script src="/app.js"></script>'), true);
  assert.equal(html.includes('<script src="/reach-intelligence.js"></script>'), true);
  assert.equal(html.includes('<script src="/gig-campaign.js"></script>'), true);
  assert.equal(html.includes('<script src="/calendar-sync.js"></script>'), true);
  assert.equal(html.includes('<script src="/recovery-easy-flyer.js"></script>'), true);

  for (const asset of ['/passkeys.js','/smart-plan.js','/easy-mode.js','/flyer-first.js','/weekly-planner.js','/content-coach.js']) {
    assert.equal(html.includes(`<script src="${asset}"></script>`), false, `${asset} should remain disabled`);
  }

  assert.equal(safeUi.includes('Choose your flyer, photo, or video'), true);
  assert.equal(safeUi.includes('gig-phase-select'), true);
  assert.equal(safeUi.includes("polish.src = '/stage3-ui-polish.js'"), true);
  assert.equal(safeUi.includes("textBlast.src = '/recovery-text-blast.js'"), true);

  assert.equal(polish.includes('Help Me Get More Views'), true);
  assert.equal(polish.includes('Choose an event'), true);
  assert.equal(polish.includes('showDatePicker'), true);

  assert.equal(textBlastLoader.includes('Turn a Text Blast into a post'), false);
  assert.equal(textBlastLoader.includes("helper.src = '/recovery-show-helper.js'"), true);
  assert.equal(helper.includes('Make This Easy'), true);
  assert.equal(helper.includes('Help Me Post This Flyer'), true);
  assert.equal(helper.includes("script.src = '/comic-blast-studio.js'"), true);

  assert.equal(comic.includes('Comic Blast Studio'), true);
  assert.equal(comic.includes('Background Library'), true);
  assert.equal(comic.includes('Upload Package'), true);
  assert.equal(comic.includes('Create Category'), true);
  assert.equal(comic.includes('Text Blast admin password'), true);

  assert.equal(textBlastLoader.includes('setInterval'), false);
  assert.equal(helper.includes('setInterval'), false);
  assert.equal(comic.includes('setInterval'), false);
});
