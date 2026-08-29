import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const cfg = await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const app = await readFile(new URL('../../nutrition-tracker.html',import.meta.url),'utf8');

test('Fuel Tracker Worker exposes app, health and AI routes',()=>{
  assert.match(src,/\/api\/health/);
  assert.match(src,/\/api\/fuel\/analyze/);
  assert.match(src,/env\.AI\.toMarkdown/);
  assert.match(src,/@cf\/google\/gemma-4-26b-a4b-it/);
});

test('Fuel Tracker has Workers AI binding',()=>{
  assert.match(cfg,/"name"\s*:\s*"rick-fuel-tracker"/);
  assert.match(cfg,/"ai"\s*:\s*\{/);
  assert.match(cfg,/"binding"\s*:\s*"AI"/);
});

test('Fuel Tracker app has complete daily UI and valid inline script',()=>{
  assert.match(app,/FUEL/);
  assert.match(app,/Analyze meal/);
  assert.match(app,/Current body composition/);
  assert.match(app,/Export data/);
  const match=app.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match);
  assert.doesNotThrow(()=>new Function(match[1]));
});
