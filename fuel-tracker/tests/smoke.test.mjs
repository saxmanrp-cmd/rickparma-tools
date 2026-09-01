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
const notifications=await readFile(new URL('../public/coach-notifications.js',import.meta.url),'utf8');
const cleanup=await readFile(new URL('../public/ui-cleanup.js',import.meta.url),'utf8');
const healthBridge=await readFile(new URL('../public/health-bridge.js',import.meta.url),'utf8');
const voice=await readFile(new URL('../public/fuel-voice-quality.js',import.meta.url),'utf8');
const swift=await readFile(new URL('../ios/Fuel/ContentView.swift',import.meta.url),'utf8');
const notifySwift=await readFile(new URL('../ios/Fuel/FuelNotificationManager.swift',import.meta.url),'utf8');
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

test('Fuel Tracker client scripts parse cleanly',()=>{
  assert.match(app,/Today's game plan/);
  assert.match(app,/Barcode lookup/);
  assert.match(app,/Restaurant search/);
  assert.match(app,/Receipt scanner/);
  assert.match(app,/Body composition/);
  assert.doesNotThrow(()=>new Function(client));
  assert.doesNotThrow(()=>new Function(portions));
  assert.doesNotThrow(()=>new Function(coach));
  assert.doesNotThrow(()=>new Function(maintenance));
  assert.doesNotThrow(()=>new Function(notifications));
  assert.doesNotThrow(()=>new Function(cleanup));
  assert.doesNotThrow(()=>new Function(healthBridge));
  assert.doesNotThrow(()=>new Function(voice));
});

test('portion editor uses label math and keeps review simple',()=>{
  assert.match(portions,/WEIGHT_TO_G/);
  assert.match(portions,/function servingQtyIn/);
  assert.match(portions,/Label serving:/);
  assert.match(portions,/How much did you eat\?/);
  assert.match(portions,/#portionBar\{display:none!important\}/);
  assert.doesNotMatch(portions,/\/api\/fuel\/analyze/);
  assert.match(portions,/new MutationObserver/);
  assert.match(coach,/portion-editor\.js\?v=5/);
});

test('Fuel Coach treats the first local log day as authoritative today',()=>{
  assert.match(coachApi,/function normalizeContext/);
  assert.match(coachApi,/localDate:today\?\.date/);
  assert.match(coachApi,/today:context\.today\|\|today/);
  assert.match(coachApi,/generatedAt is UTC/);
  assert.match(coachApi,/TRACKER DATA\.today/);
});

test('Fuel Coach stays low reasoning and sends less data for ordinary questions',()=>{
  assert.match(coach,/Talk to Fuel Coach/);
  assert.doesNotMatch(coach,/Analyze My Day/);
  assert.match(coach,/function needsFullHistory/);
  assert.match(coach,/dayCount=full\?7:3/);
  assert.match(coach,/context\(question\)/);
  assert.match(coachApi,/body\.mode===['"]scan['"]\?['"]medium['"]:['"]low['"]/);
  assert.match(coachApi,/max_output_tokens:notification\?180:650/);
  assert.match(coachApi,/slice\(0,24000\)/);
});

test('Fuel tracks maintenance with plain-language deficit labels',()=>{
  assert.match(maintenance,/DEFAULT_TDEE=2400/);
  assert.match(maintenance,/Calorie deficit/);
  assert.match(maintenance,/calories below maintenance/);
  assert.match(maintenance,/Target deficit/);
  assert.doesNotMatch(maintenance,/estimated deficit vs maintenance/);
  assert.match(coach,/estimatedTdee:maintenance/);
  assert.match(coach,/maintenance\.js\?v=2/);
  assert.match(coachApi,/function directAnswer/);
  assert.match(coachApi,/provider:'local-math'/);
});

test('Fuel removes instructional fine print while preserving data labels',()=>{
  assert.match(coach,/ui-cleanup\.js\?v=1/);
  assert.match(cleanup,/\.logAction small/);
  assert.match(cleanup,/#scannerWrap p\.note/);
  assert.match(cleanup,/#healthNote/);
  assert.match(cleanup,/choose a tool/);
  assert.match(cleanup,/font-size:13px/);
});

test('Coach notifications are AI-assisted fasting-aware native and testable',()=>{
  assert.match(maintenance,/coach-notifications\.js\?v=2/);
  assert.match(notifications,/function recentMealPattern/);
  assert.match(notifications,/estimatedFastingHours/);
  assert.match(notifications,/mode:'notification'/);
  assert.match(notifications,/SEND\\\|/);
  assert.match(notifications,/fuelNotifications/);
  assert.match(notifications,/fuel-health-synced/);
  assert.match(notifications,/fuel-app-active/);
  assert.match(notifications,/function testNotification/);
  assert.match(notifications,/Date\.now\(\)\+30000/);
  assert.match(notifications,/Send test notification/);
  assert.match(coachApi,/mode===['"]notification['"]/);
  assert.match(coachApi,/Avoid nagging/);
  assert.match(swift,/name: "fuelNotifications"/);
  assert.match(swift,/FuelNotificationManager/);
  assert.match(notifySwift,/UNUserNotificationCenter/);
  assert.match(notifySwift,/requestAuthorization/);
  assert.match(notifySwift,/removePendingNotificationRequests/);
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
