import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const swift = await readFile(new URL('../ios/LyricsFinder/ContentView.swift', import.meta.url), 'utf8');
const project = await readFile(new URL('../ios/project.yml', import.meta.url), 'utf8');

test('native Lyrics Finder uses WKWebView as top-level app web content', () => {
  assert.match(swift, /import WebKit/);
  assert.match(swift, /WKWebView/);
  assert.match(swift, /UIViewRepresentable/);
  assert.match(swift, /fullScreenCover/);
  assert.doesNotMatch(swift, /iframe/i);
});

test('native app builds the DuckDuckGo lyrics card URL', () => {
  assert.ok(swift.includes('lyrics to \\(cleanTitle) by \\(cleanArtist)'));
  assert.match(swift, /URLQueryItem\(name: "t", value: "iphone"\)/);
  assert.match(swift, /URLQueryItem\(name: "ia", value: "web"\)/);
  assert.match(swift, /URLQueryItem\(name: "iax", value: "lyrics"\)/);
});

test('native app has its own iPhone target', () => {
  assert.match(project, /name: LyricsFinder/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER: com\.rickparma\.lyricsfinder/);
  assert.match(project, /TARGETED_DEVICE_FAMILY: 1/);
});
