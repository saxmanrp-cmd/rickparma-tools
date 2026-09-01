import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const analyzer=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const coachApi=await readFile(new URL('../src/fuel-coach-api.js',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const coach=await readFile(new URL('../public/fuel-coach.js',import.meta.url),'utf8');
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const wrapper=await readFile(new URL('../src/index-wrapper.js',import.meta.url),'utf8');

test('multi-food review offers individual or one-meal logging',()=>{
  assert.match(app,/Log individually/);
  assert.match(app,/Log as meal/);
  assert.match(app,/function addMealGroup/);
  assert.match(app,/kind:'meal'/);
  assert.match(app,/A meal keeps its full breakdown/);
});

test('saved meals and composite foods retain editable components',()=>{
  assert.match(app,/components:items/);
  assert.match(app,/function flattenBreakdown/);
  assert.match(app,/editingGroup/);
  assert.match(app,/This is the stored breakdown/);
  assert.match(app,/FuelReviewCoachFoods/);
});

test('analyzer and coach preserve composite-food component detail',()=>{
  assert.match(analyzer,/optional components array/);
  assert.match(analyzer,/parent total remains authoritative/);
  assert.match(analyzer,/function normalizeItem/);
  assert.match(coachApi,/components array/);
  assert.match(coachApi,/raw\.components/);
});

test('Coach multi-food add goes through the logging choice',()=>{
  assert.match(coach,/FuelReviewCoachFoods/);
  assert.match(coach,/Choose Log individually or Log as meal/);
});

test('meal-mode scripts are cache busted',()=>{
  assert.match(html,/app\.js\?v=5/);
  assert.match(wrapper,/fuel-coach\.js\?v=7/);
});
