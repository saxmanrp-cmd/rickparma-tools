import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function env(){
  return { ASSETS:{ fetch:async()=>new Response('asset') } };
}

test('health endpoint reports web-search mode',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/health'),env());
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.service,'rick-lyrics-finder');
  assert.equal(body.mode,'web-search');
});

test('non-api routes fall through to static assets',async()=>{
  const response=await worker.fetch(new Request('https://example.test/'),env());
  assert.equal(await response.text(),'asset');
});
