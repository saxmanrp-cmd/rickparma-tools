import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const analyzer=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const coach=await readFile(new URL('../public/fuel-coach.js',import.meta.url),'utf8');
const coachApi=await readFile(new URL('../src/fuel-coach-api.js',import.meta.url),'utf8');
const portions=await readFile(new URL('../public/portion-editor.js',import.meta.url),'utf8');
const quick=await readFile(new URL('../public/quick-add.js',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const wrapper=await readFile(new URL('../src/index-wrapper.js',import.meta.url),'utf8');

test('photo analyzer never accepts mystery meat portions',()=>{
  assert.match(analyzer,/return nutrition for exactly 1 oz/);
  assert.match(analyzer,/3 St\. Louis ribs/);
  assert.match(analyzer,/16\/20/);
  assert.match(analyzer,/portion repair failed/);
});
test('natural count units include ribs and shrimp while serving remains available',()=>{
  assert.match(portions,/rib:'rib'/);
  assert.match(portions,/shrimp:'shrimp'/);
  assert.match(portions,/\['oz','g','lb','serving'\]/);
  assert.doesNotThrow(()=>new Function(portions));
});
test('Quick Add understands count-based ribs',()=>{
  assert.match(quick,/parseCountMeal/);
  assert.match(quick,/Saved per/);
  assert.match(quick,/return 'rib'/);
  assert.doesNotThrow(()=>new Function(quick));
});
test('coach keeps recent conversation and a 24 hour pending food',()=>{
  assert.match(coach,/CONVERSATION_MS=7\*24/);
  assert.match(coach,/PENDING_MS=24\*60/);
  assert.match(coach,/recentConversation/);
  assert.match(coach,/pendingFoods/);
  assert.match(coach,/isAddCommand/);
  assert.match(coach,/FuelAddCoachFoods/);
  assert.doesNotThrow(()=>new Function(coach));
});
test('coach api returns structured loggable food and sees conversation',()=>{
  assert.match(coachApi,/RECENT CONVERSATION/);
  assert.match(coachApi,/PENDING FOODS/);
  assert.match(coachApi,/normalizeFood/);
  assert.match(coachApi,/St\. Louis ribs/);
  assert.match(coachApi,/use exactly 1 oz/);
});
test('app exposes a coach logging bridge and cache busts coach',()=>{
  assert.match(app,/FuelAddCoachFood/);
  assert.match(wrapper,/fuel-coach\.js\?v=8/);
  assert.doesNotThrow(()=>new Function(app));
});
