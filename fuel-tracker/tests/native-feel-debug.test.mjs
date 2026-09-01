import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const swift=fs.readFileSync(new URL('../ios/Fuel/ContentView.swift', import.meta.url),'utf8');

test('logging tools never auto-focus and trigger iOS visual zoom',()=>{
  assert.doesNotMatch(html,/input\)input\.focus\(/);
  assert.match(html,/window\.scrollTo\(\{top,behavior:'smooth'\}\)/);
});

test('bottom tabs stay native-feeling around the iOS keyboard',()=>{
  assert.match(html,/fuel-keyboard-open/);
  assert.match(html,/visualViewport/);
  assert.match(html,/body\.fuel-keyboard-open \.tabs\{visibility:hidden/);
  assert.match(html,/\.tabs\{background:#08111f!important/);
});

test('native WKWebView cannot reveal white under-page areas or smart zoom',()=>{
  assert.match(swift,/underPageBackgroundColor = fuelBackground/);
  assert.match(swift,/scrollView\.clipsToBounds = true/);
  assert.match(swift,/webView\.pageZoom = 1\.0/);
  assert.match(swift,/numberOfTapsRequired > 1/);
  assert.match(swift,/setZoomScale\(1\.0, animated: false\)/);
});
