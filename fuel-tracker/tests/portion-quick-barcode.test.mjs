import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const portions=await readFile(new URL('../public/portion-editor.js',import.meta.url),'utf8');
const quick=await readFile(new URL('../public/quick-add.js',import.meta.url),'utf8');
const barcode=await readFile(new URL('../public/barcode-bridge.js',import.meta.url),'utf8');

test('simple portion selector includes servings and deterministic serving math',()=>{
  assert.match(portions,/\['oz','g','lb','serving'\]/);
  assert.match(portions,/targetUnit===['"]serving['"]\)return 1/);
  assert.match(portions,/Label serving:/);
  assert.doesNotThrow(()=>new Function(portions));
});

test('Quick Add supports count-based foods such as shrimp',()=>{
  assert.match(quick,/mode==='count'/);
  assert.match(quick,/How many/);
  assert.match(quick,/never have to think about ounces again/);
  assert.match(quick,/pieceWeight/);
  assert.doesNotThrow(()=>new Function(quick));
});

test('barcode scan clears stale codes and uses a full-frame focused scanner',()=>{
  assert.match(barcode,/clearBarcode/);
  assert.match(barcode,/focusMode:'continuous'/);
  assert.match(barcode,/zoom:Math\.min\(1\.35/);
  assert.match(barcode,/barcodeLookupPending/);
  assert.doesNotThrow(()=>new Function(barcode));
});

test('new Fuel tools are cache-busted in the app shell',()=>{
  assert.match(app,/quick-add\.js\?v=2/);
  assert.match(app,/barcode-bridge\.js\?v=1/);
  assert.match(app,/portion-editor\.js\?v=4/);
});
