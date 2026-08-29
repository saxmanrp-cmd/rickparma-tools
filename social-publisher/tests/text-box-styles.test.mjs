import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('comic template metadata preserves shape, fill, opacity, border and corner radius', () => {
  const code = read('src/comic-templates.js');
  for (const field of ['shape','fillColor','fillOpacity','borderColor','borderOpacity','borderWidth','cornerRadius']) {
    assert.match(code, new RegExp(field));
  }
  assert.match(code, /shape:String\(value\.shape/);
  assert.match(code, /textAreas:textAreas\.length \? JSON\.stringify\(textAreas\)/);
});

test('Media editor exposes mobile box and circle controls', () => {
  const code = read('public/text-box-style-editor.js');
  assert.match(code, /Text Box Style/);
  assert.match(code, /▭ Box/);
  assert.match(code, /◯ Circle/);
  assert.match(code, /Background Opacity/);
  assert.match(code, /Border Width/);
  assert.match(code, /Corner Radius/);
  assert.match(code, /@media\(max-width:430px\)/);
});

test('saved mappings include visual style data', () => {
  const code = read('public/media-multi-text-save-fix.js');
  assert.match(code, /fillOpacity:number\(box\.dataset\.fillOpacity,0\)/);
  assert.match(code, /shape:box\.dataset\.shape === 'circle'/);
  assert.match(code, /borderWidth:number\(box\.dataset\.borderWidth,0\)/);
});

test('Create renderer draws shapes before text and owns generation in capture phase', () => {
  const code = read('public/comic-text-box-renderer.js');
  assert.match(code, /drawShape\(ctx,x,y,w,h,area,scale\)/);
  assert.match(code, /ctx\.ellipse/);
  assert.match(code, /event\.preventDefault\(\)/);
  assert.match(code, /event\.stopImmediatePropagation\(\)/);
  assert.match(code, /document\.addEventListener\('click',[\s\S]*,true\)/);
});

test('boot guard loads text box editor and Create renderer', () => {
  const loader = read('public/media-boot-guard.js');
  assert.match(loader, /text-box-style-editor\.js/);
  assert.match(loader, /comic-text-box-renderer\.js/);
});
