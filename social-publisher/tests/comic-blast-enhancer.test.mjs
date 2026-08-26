import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Comic Blast retires the full-screen editor while keeping social-ready image optimization', () => {
  const helper = read('public/recovery-show-helper.js');
  const enhancer = read('public/comic-blast-enhancer.js');
  const retirement = read('public/comic-fullscreen-retire.js');
  const sync = read('public/comic-blast-editor-sync.js');

  assert.equal(helper.includes("retirement.src = '/comic-fullscreen-retire.js'"), true);
  assert.equal(helper.includes("enhancer.src = '/comic-blast-enhancer.js'"), true);
  assert.equal(helper.includes("sync.src = '/comic-blast-editor-sync.js'"), true);
  assert.equal(helper.includes("script.addEventListener('load',loadComicEnhancer"), true);
  assert.equal(helper.includes("loadComicFullscreenRetirement(loadComicEnhancer)"), true);
  assert.equal(helper.includes('window.retireComicFullscreenEditor();'), true);

  assert.equal(retirement.includes('#comicFullscreenOpenBtn'), true);
  assert.equal(retirement.includes('#comicFullscreenEditor'), true);
  assert.equal(retirement.includes('comicFullscreenOpenBtn') && retirement.includes('?.remove()'), true);
  assert.equal(retirement.includes('overlay?.remove()'), true);
  assert.equal(retirement.includes('display:none!important'), true);
  assert.equal(retirement.includes('MutationObserver'), false);

  assert.equal(enhancer.includes('const MAX_WIDTH = 1080'), true);
  assert.equal(enhancer.includes('const MAX_HEIGHT = 1920'), true);
  assert.equal(enhancer.includes("'image/jpeg'"), true);
  assert.equal(enhancer.includes('window.normalizeImage = optimizedNormalize'), true);
  assert.equal(enhancer.includes('#comicUploadPackageBtn'), true);
  assert.equal(enhancer.includes('Optimize Existing Backgrounds'), true);
  assert.equal(enhancer.includes('/api/comic-templates'), true);

  assert.equal(sync.includes("target?.id !== 'comicFullscreenText'"), true);
  assert.equal(sync.includes('stopImmediatePropagation'), true);
  assert.equal(sync.includes("inline.dispatchEvent(new Event('input'"), true);

  assert.equal(enhancer.includes('setInterval'), false);
  assert.equal(enhancer.includes('new MutationObserver'), false);
  assert.equal(sync.includes('setInterval'), false);
});
