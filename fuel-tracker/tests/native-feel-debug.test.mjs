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


test('native iPhone shell owns bottom navigation instead of WKWebView',()=>{
  assert.match(swift,/FuelWebView\(selectedPage: selectedPage, navigationRevision: navigationRevision\)/);
  assert.match(swift,/fuelTab\(page: "home"/);
  assert.match(swift,/fuelTab\(page: "settings"/);
  assert.match(swift,/ignoresSafeArea\(\.keyboard, edges: \.bottom\)/);
  assert.match(swift,/fuel-native-shell-style/);
  assert.match(swift,/\.tabs\{display:none!important\}/);
  assert.match(swift,/func selectPage\(_ page: String/);
});


test('native tabs always send navigation even when Today is already selected in SwiftUI',()=>{
  assert.match(swift,/@State private var navigationRevision = 0/);
  assert.match(swift,/navigationRevision &\+= 1/);
  assert.match(swift,/FuelWebView\(selectedPage: selectedPage, navigationRevision: navigationRevision\)/);
  assert.match(swift,/selectPage\(selectedPage, in: webView, force: true\)/);
});
