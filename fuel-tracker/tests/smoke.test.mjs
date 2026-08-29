import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const cfg=await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const app=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const client=await readFile(new URL('../public/app.js',import.meta.url),'utf8');

test('Fuel Tracker Worker exposes all nutrition routes',()=>{
  assert.match(src,/\/api\/health/);
  assert.match(src,/\/api\/fuel\/analyze/);
  assert.match(src,/\/api\/fuel\/barcode/);
  assert.match(src,/\/api\/fuel\/restaurant/);
  assert.match(src,/\/api\/fuel\/receipt/);
  assert.match(src,/world\.openfoodfacts\.org/);
  assert.match(src,/api\.nal\.usda\.gov/);
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

test('Fuel Tracker client has simple tracking plus barcode restaurant and receipt UI',()=>{
  assert.match(app,/Today's game plan/);
  assert.match(app,/Quick add/);
  assert.match(app,/Barcode lookup/);
  assert.match(app,/Restaurant search/);
  assert.match(app,/Receipt scanner/);
  assert.match(app,/Manual macros/);
  assert.match(app,/Body composition/);
  assert.doesNotMatch(app,/data-mode=/);
  assert.doesNotMatch(app,/>🥩 Carnivore<|>🥑 Keto<|>🍚 Flex</);
  assert.doesNotThrow(()=>new Function(client));
});
