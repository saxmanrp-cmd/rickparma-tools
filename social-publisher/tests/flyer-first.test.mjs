import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handleTextBlastRequest } from '../src/text-blast-bridge.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Text Blast bridge forwards the on-device password and normalizes blast history', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedToken = '';
  globalThis.fetch = async (url, options={}) => {
    assert.equal(String(url), 'https://sms-blast.saxmanrp.workers.dev/api/blastlog');
    forwardedToken = options.headers['X-Admin-Token'];
    return new Response(JSON.stringify({ log:[{
      blastId:'blast-123', at:'2026-08-23T19:00:00Z', message:'Tonight at Easy’s!', mediaUrl:'', segmentLabel:'All Fans', sent:55, failed:1,
    }] }), { headers:{'content-type':'application/json'} });
  };
  try {
    const request = new Request('https://social.test/api/text-blast/history', { headers:{'x-text-blast-token':'secret-local-token'} });
    const response = await handleTextBlastRequest(request);
    assert.equal(response.status, 200);
    assert.equal(forwardedToken, 'secret-local-token');
    const data = await response.json();
    assert.equal(data.connected, true);
    assert.equal(data.log.length, 1);
    assert.equal(data.log[0].id, 'blast-123');
    assert.equal(data.log[0].sent, 55);
    assert.equal(data.log[0].message, 'Tonight at Easy’s!');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Text Blast bridge requires a token', async () => {
  const response = await handleTextBlastRequest(new Request('https://social.test/api/text-blast/history'));
  assert.equal(response.status, 401);
});

test('Flyer First makes optional content secondary and turns Text Blast into social graphics', () => {
  const flyer = read('public/flyer-first.js');
  const bridge = read('src/text-blast-bridge.js');
  const entry = read('src/entry.js');
  const smart = read('public/smart-plan.js');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');

  for (const needle of [
    'More post ideas · optional',
    'Extra content ideas for the week · optional',
    'gig-phase-select',
    'Text Blast → Social',
    '/api/text-blast/history',
    'x-text-blast-token',
    'Make Bubble Post',
    'socialPublisherTextBlastToken',
    'canvas.width = 1080',
    'canvas.height = 1350',
    'handleMedia(file)',
    'A QUICK TEXT FROM ME',
  ]) assert.equal(flyer.includes(needle), true, `Flyer First missing ${needle}`);

  for (const needle of [
    'https://sms-blast.saxmanrp.workers.dev',
    '/api/blastlog',
    'X-Admin-Token',
    '/api/text-blast/history',
  ]) assert.equal(bridge.includes(needle), true, `Text Blast bridge missing ${needle}`);

  assert.equal(entry.includes('handleTextBlastRequest'), true);
  assert.equal(entry.includes("url.pathname.startsWith('/api/text-blast')"), true);
  assert.equal(entry.includes("const VERSION = '0.7.6'"), true);
  assert.equal(smart.includes("loadScript('/flyer-first.js','flyer-first'"), true);
  assert.equal(sw.includes("'/flyer-first.js'"), true);
  assert.equal(sw.includes('social-publisher-shell-v760'), true);
  assert.equal(pkg.includes('src/text-blast-bridge.js'), true);
  assert.equal(pkg.includes('public/flyer-first.js'), true);
  assert.equal(pkg.includes('"version": "0.7.6"'), true);
});
