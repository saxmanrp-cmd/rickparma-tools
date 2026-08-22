import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('worker health and auth guard', async () => {
  let response = await worker.fetch(new Request('https://social.test/api/health'), {}, { waitUntil() {} });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.version, '0.6.7');

  response = await worker.fetch(new Request('https://social.test/api/auth/status'), {}, { waitUntil() {} });
  const auth = await response.json();
  assert.deepEqual(auth, { configured: false, authenticated: false });

  response = await worker.fetch(new Request('https://social.test/api/posts'), {}, { waitUntil() {} });
  assert.equal(response.status, 503);
});

test('fresh schema and v0.6.4 migration both produce instagram_options', () => {
  const freshSchema = read('schema.sql');
  const migration = read('migrations/0001_instagram_options.sql');

  const fresh = new DatabaseSync(':memory:');
  fresh.exec(freshSchema);
  const freshColumns = fresh.prepare('PRAGMA table_info(posts)').all().map(row => row.name);
  assert.equal(freshColumns.filter(name => name === 'instagram_options').length, 1);

  const previousSchema = freshSchema.replace(/\n\s*instagram_options TEXT,/, '');
  const upgraded = new DatabaseSync(':memory:');
  upgraded.exec(previousSchema);
  assert.equal(upgraded.prepare('PRAGMA table_info(posts)').all().some(row => row.name === 'instagram_options'), false);
  upgraded.exec(migration);
  assert.equal(upgraded.prepare('PRAGMA table_info(posts)').all().filter(row => row.name === 'instagram_options').length, 1);
});

test('frontend literal ID selectors exist and static shell is complete', () => {
  const html = read('public/index.html');
  const js = read('public/app.js');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML id found');

  const usedIds = [...js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(match => match[1]);
  const htmlIds = new Set(ids);
  const missing = [...new Set(usedIds)].filter(id => !htmlIds.has(id));
  assert.deepEqual(missing, []);

  for (const rel of [
    'public/app.js',
    'public/styles.css',
    'public/manifest.webmanifest',
    'public/service-worker.js',
    'public/icons/icon-180.png',
    'public/icons/icon-192.png',
    'public/icons/icon-512.png',
  ]) assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} missing`);

  assert.doesNotThrow(() => JSON.parse(read('public/manifest.webmanifest')));
});

test('Instagram people fields are wired into backend and frontend', () => {
  const backend = read('src/index.js');
  const frontend = read('public/app.js');
  const migration = read('migrations/0001_instagram_options.sql');

  for (const needle of ['instagram_options', "createForm.set('collaborators'", "createForm.set('user_tags'", 'validateInstagramOptions']) {
    assert.equal(backend.includes(needle), true, `backend missing ${needle}`);
  }
  for (const needle of ['igTagUsername', 'igCollabUsername', 'openTagPosition', 'instagramOptions']) {
    assert.equal(frontend.includes(needle), true, `frontend missing ${needle}`);
  }
  assert.match(migration, /ALTER TABLE posts ADD COLUMN instagram_options TEXT/i);
});


test('Instagram Reel original audio name is wired end to end', () => {
  const backend = read('src/index.js');
  const frontend = read('public/app.js');
  const html = read('public/index.html');

  assert.equal(backend.includes("createForm.set('audio_name', igOptions.audioName)"), true);
  assert.equal(backend.includes('audioName'), true);
  assert.equal(frontend.includes('igAudioName'), true);
  assert.equal(frontend.includes('audioName'), true);
  assert.equal(html.includes('id="instagramReelAudioWrap"'), true);
  assert.equal(html.includes('id="igAudioName"'), true);
});


test('Instagram type selector is isolated from timing selector', () => {
  const frontend = read('public/app.js');
  assert.equal(frontend.includes("$$('.timing-segmented .segment').forEach(segment"), true);
  assert.equal(frontend.includes("$$('.segment').forEach(segment => segment.addEventListener('click'"), false);
  assert.equal(frontend.includes('updateInstagramReelAudioVisibility();'), true);
});


test('Max Reach and Facebook Reel are wired end to end', () => {
  const backend = read('src/index.js');
  const frontend = read('public/app.js');
  const html = read('public/index.html');

  for (const needle of ["facebook_reel", 'publishFacebookReel', '/me/video_reels', "'file_url':mediaUrl"]) assert.equal(backend.includes(needle), true, `backend missing ${needle}`);
  for (const needle of ['getMaxReachRecommendation', 'applyMaxReachRecommendation', 'currentFacebookType', 'readVideoMetadata', 'facebook_reel']) assert.equal(frontend.includes(needle), true, `frontend missing ${needle}`);
  for (const needle of ['id="maxReachCard"', 'id="applyMaxReachBtn"', 'id="facebookTypeWrap"', 'name="fbType"']) assert.equal(html.includes(needle), true, `HTML missing ${needle}`);
});


test('Threads video jobs and retries are cron-owned and failed-only', () => {
  const backend = read('src/index.js');
  assert.equal(backend.includes("p === 'facebook_reel' || p === 'threads'"), true);
  assert.equal(backend.includes('const attempts = 17;'), true);
  assert.equal(backend.includes('const intervalMs = 15_000;'), true);
  assert.equal(backend.includes('SELECT status, publish_results FROM posts WHERE id=?'), true);
  assert.equal(backend.includes("post.platforms.filter(platform => !previousResults[platform]?.ok)"), true);
  assert.equal(backend.includes("const results = isRetry ? { ...previousResults } : {};"), true);
  const retryBlock = backend.match(/if \(url\.pathname\.match\(\/\^\\\/api\\\/posts.*?failedPlatforms \}\);\n    \}/s)?.[0] || '';
  assert.equal(retryBlock.includes('ctx.waitUntil(processPost(env, id))'), false);
});

test('Reach Intelligence is wired into Max Reach', () => {
  const html = read('public/index.html');
  const reach = read('public/reach-intelligence.js');
  const css = read('public/styles.css');
  const sw = read('public/service-worker.js');
  for (const needle of ['id="reachIntelligence"','id="reachFitScore"','id="useReachTimeBtn"','id="useReachCaptionBtn"','/reach-intelligence.js','Learning mode:']) assert.equal(html.includes(needle), true, 'HTML missing ' + needle);
  for (const needle of ['buildReachIntelligence','classifyIntent','nextSuggestedSlot','timingMode','Caption starter added']) assert.equal(reach.includes(needle), true, 'Reach Intelligence missing ' + needle);
  assert.equal(css.includes('v0.6.7 Reach Intelligence'), true);
  assert.equal(sw.includes('/reach-intelligence.js'), true);
  assert.equal(sw.includes('social-publisher-shell-v680'), true);
});
