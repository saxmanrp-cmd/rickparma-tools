import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const cfg=await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const app=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const client=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const portions=await readFile(new URL('../public/portion-editor.js',import.meta.url),'utf8');
const coach=await readFile(new URL('../public/fuel-coach.js',import.meta.url),'utf8');
const coachApi=await readFile(new URL('../src/fuel-coach-api.js',import.meta.url),'utf8');
const maintenance=await readFile(new URL('../public/maintenance.js',import.meta.url),'utf8');
const healthBridge=await readFile(new URL('../public/health-bridge.js',import.meta.url),'utf8');
const voice=await readFile(new URL('../public/fuel-voice-quality.js',import.meta.url),'utf8');
const swift=await readFile(new URL('../ios/Fuel/ContentView.swift',import.meta.url),'utf8');
const info=await readFile(new URL('../ios/Fuel/Info.plist',import.meta.url),'utf8');
const entitlements=await readFile(new URL('../ios/Fuel/Fuel.entitlements',import.meta.url),'utf8');
const project=await readFile(new URL('../ios/project.yml',import.meta.url),'utf8');

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
  assert.doesNotMatch(app,/>🥩 Carnivore<|>🥑 Keto<|>🍚 Flex/);
  assert.doesNotThrow(()=>new Function(client));
  assert.doesNotThrow(()=>new Function(portions));
  assert.doesNotThrow(()=>new Function(coach));
  assert.doesNotThrow(()=>new Function(maintenance));
  assert.doesNotThrow(()=>new Function(healthBridge));
  assert.doesNotThrow(()=>new Function(voice));
});

test('portion editor does not create a MutationObserver feedback loop',()=>{
  assert.match(portions,/save\.textContent!==['"]Re-analyze & save['"]/);
  assert.match(portions,/new MutationObserver/);
});

test('Fuel Coach treats the first local log day as authoritative today',()=>{
  assert.match(coachApi,/function normalizeContext/);
  assert.match(coachApi,/localDate:today\?\.date/);
  assert.match(coachApi,/today:context\.today\|\|today/);
  assert.match(coachApi,/NEVER use generatedAt to decide which calendar date is today/);
  assert.match(coachApi,/TRACKER DATA\.today as the authoritative local-day record/);
});

test('Fuel Coach uses one talk button and low reasoning for normal questions',()=>{
  assert.match(coach,/Talk to Fuel Coach/);
  assert.doesNotMatch(coach,/Analyze My Day/);
  assert.match(coachApi,/body\.mode===['"]scan['"]\?['"]medium['"]:['"]low['"]/);
  assert.match(coachApi,/max_output_tokens:1000/);
});

test('Fuel tracks maintenance and deficit as first-class data',()=>{
  assert.match(maintenance,/DEFAULT_TDEE=2400/);
  assert.match(maintenance,/Calorie deficit/);
  assert.match(maintenance,/estimated maintenance/);
  assert.match(maintenance,/planned deficit/);
  assert.match(coach,/estimatedTdee:maintenance/);
  assert.match(coach,/estimatedDeficitVsMaintenance/);
  assert.match(coach,/maintenance\.js\?v=1/);
  assert.match(coachApi,/function directAnswer/);
  assert.match(coachApi,/provider:'local-math'/);
  assert.match(coachApi,/maintenance\.estimatedTdee/);
});

test('Apple Health refreshes when native Fuel returns to foreground',()=>{
  assert.match(healthBridge,/fuel-app-active/);
  assert.match(healthBridge,/syncOnForeground/);
  assert.match(swift,/UIApplication\.didBecomeActiveNotification/);
  assert.match(swift,/fuel-app-active/);
});

test('native Fuel contains all required privacy and bundle metadata',()=>{
  assert.match(info,/CFBundleExecutable/);
  assert.match(info,/NSHealthShareUsageDescription/);
  assert.match(info,/NSMicrophoneUsageDescription/);
  assert.match(info,/NSSpeechRecognitionUsageDescription/);
  assert.match(info,/NSCameraUsageDescription/);
  assert.match(entitlements,/com\.apple\.developer\.healthkit/);
  assert.match(project,/CFBundleExecutable/);
  assert.match(project,/NSCameraUsageDescription/);
  assert.match(project,/NSMicrophoneUsageDescription/);
  assert.match(project,/NSSpeechRecognitionUsageDescription/);
});

test('native Fuel registers HealthKit speech recognition speech stop and OpenAI audio bridges',()=>{
  assert.match(swift,/name: "healthKit"/);
  assert.match(swift,/name: "fuelSpeech"/);
  assert.match(swift,/name: "fuelRecognition"/);
  assert.match(swift,/name: "fuelAudio"/);
  assert.match(swift,/AVAudioPlayer/);
  assert.match(swift,/SFSpeechRecognizer/);
});
