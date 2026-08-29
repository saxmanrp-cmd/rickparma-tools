import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const cfg = await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const app = await readFile(new URL('../public/index.html',import.meta.url),'utf8');

test('Fuel Tracker Worker exposes health, AI, and static app routes',()=>{
  assert.match(src,/\/api\/health/);
  assert.match(src,/\/api\/fuel\/analyze/);
  assert.match(src,/env\.AI\.toMarkdown/);
  assert.match(src,/env\.ASSETS\.fetch/);
  assert.match(src,/@cf\/google\/gemma-4-26b-a4b-it/);
});

test('Fuel Tracker has isolated AI and static asset bindings',()=>{
  assert.match(cfg,/"name"\s*:\s*"rick-fuel-tracker"/);
  assert.match(cfg,/"binding"\s*:\s*"AI"/);
  assert.match(cfg,/"binding"\s*:\s*"ASSETS"/);
  assert.match(cfg,/"directory"\s*:\s*"\.\/public"/);
});

test('Fuel Tracker rebuilt client has core daily controls and valid inline script',()=>{
  assert.match(app,/Today's game plan/);
  assert.match(app,/Quick add/);
  assert.match(app,/Analyze/);
  assert.match(app,/Manual macros/);
  assert.match(app,/Body composition/);
  assert.match(app,/Settings/);
  const match=app.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match);
  assert.doesNotThrow(()=>new Function(match[1]));
});
