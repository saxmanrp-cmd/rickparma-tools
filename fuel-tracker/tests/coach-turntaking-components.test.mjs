import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const coach=fs.readFileSync(new URL('../public/fuel-coach.js',import.meta.url),'utf8');
const voice=fs.readFileSync(new URL('../public/fuel-voice-quality.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../src/fuel-coach-api.js',import.meta.url),'utf8');
const analyzer=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const swift=fs.readFileSync(new URL('../ios/Fuel/ContentView.swift',import.meta.url),'utf8');
const wrapper=fs.readFileSync(new URL('../src/index-wrapper.js',import.meta.url),'utf8');

test('Coach visibly separates listening thinking speaking and ready',()=>{
  assert.match(coach,/LISTENING — SAY IT NOW/);
  assert.match(coach,/COACH SPEAKING — WAIT/);
  assert.match(coach,/fuelCoachSpeechEnded/);
  assert.match(coach,/scheduleAutoListen/);
  assert.match(coach,/fuelCoachSpeechStart/);
  assert.match(coach,/setAnswer\(d\.answer\)/);
});

test('native voice reports exact playback completion to Coach',()=>{
  assert.match(swift,/fuelCoachNativeAudioEnded/);
  assert.match(voice,/fuelCoachNativeAudioEnded/);
  assert.match(voice,/fuelCoachSpeechEnded/);
});

test('short speech-recognition variants still open pending food review',()=>{
  assert.match(coach,/go ahead and/);
  assert.match(coach,/today's/);
  assert.match(coach,/retryAutoListen/);
  assert.match(coach,/950/);
});

test('composite restaurant foods stay top-level while ingredients get real names',()=>{
  assert.match(api,/CRITICAL COMPONENT NAMING RULE/);
  assert.match(api,/repairRepeatedCompositeFoods/);
  assert.match(api,/Beef patties/);
  assert.match(api,/Mayonnaise/);
  assert.match(api,/Ketchup/);
  assert.match(analyzer,/must NEVER repeat the parent food\/menu-item name/);
  assert.match(app,/name:String\(x\.name\|\|'Ingredient'\)\.trim\(\)/);
});

test('raw Coach JSON is unwrapped and never shown as the answer',()=>{
  assert.match(coach,/decodeCoachEnvelope/);
  assert.match(api,/NEVER JSON-encode/);
  assert.match(api,/structured food data did not finish cleanly/);
});

test('Coach cache is bumped for the new conversation UX',()=>{
  assert.match(wrapper,/fuel-coach\.js\?v=9/);
  assert.match(coach,/fuel-voice-quality\.js\?v=7/);
});
