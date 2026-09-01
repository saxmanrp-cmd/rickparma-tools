import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const swift=fs.readFileSync(new URL('../ios/Fuel/ContentView.swift', import.meta.url),'utf8');

test('Fuel locks browser zoom and iOS focus zoom without intercepting normal taps',()=>{
  assert.match(html,/maximum-scale=1/);
  assert.match(html,/user-scalable=no/);
  assert.match(html,/input,textarea,select\{font-size:16px!important/);
  assert.doesNotMatch(html,/addEventListener\('gesturestart'/);
  assert.doesNotMatch(html,/lastTapAt=0/);
  assert.doesNotMatch(html,/\.macrogrid input\{padding:8px;font-size:14px\}/);
  assert.match(swift,/pinchGestureRecognizer\?\.isEnabled = false/);
  assert.match(swift,/numberOfTapsRequired > 1/);
});

test('Fuel web canvas cannot reveal white rubber-band gaps',()=>{
  assert.match(html,/html\{background:#08111f/);
  assert.match(html,/overscroll-behavior:none/);
  assert.match(html,/\.tabs\{transform:translateZ\(0\)/);
});

test('native Fuel disables bounce and native pinch zoom',()=>{
  assert.match(swift,/fuelBackground\.ignoresSafeArea\(\)/);
  assert.match(swift,/webView\.isOpaque = false/);
  assert.match(swift,/contentInsetAdjustmentBehavior = \.never/);
  assert.match(swift,/webView\.scrollView\.bounces = false/);
  assert.match(swift,/alwaysBounceVertical = false/);
  assert.match(swift,/maximumZoomScale = 1\.0/);
  assert.match(swift,/pinchGestureRecognizer\?\.isEnabled = false/);
});
