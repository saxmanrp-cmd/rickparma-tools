import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const swift=fs.readFileSync(new URL('../ios/Fuel/ContentView.swift', import.meta.url),'utf8');

test('native Fuel leaves normal web taps alone',()=>{
  assert.doesNotMatch(html,/lastTapAt=0/);
  assert.doesNotMatch(html,/addEventListener\('gesturestart'/);
  assert.doesNotMatch(html,/touch-action:pan-y/);
  assert.match(html,/#home\.page\.active\{pointer-events:auto!important\}/);
  assert.match(html,/\.fcModal:not\(\.open\)\{pointer-events:none!important\}/);
  assert.match(swift,/pinchGestureRecognizer\?\.isEnabled = false/);
  assert.match(swift,/numberOfTapsRequired > 1/);
});
