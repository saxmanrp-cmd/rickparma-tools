import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../song-manager.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('Dinner Music switch requires a selected song and persists the mode', async () => {
  const buttons = new Map();
  const context = vm.createContext({ document:{ getElementById(id) {
    if(!buttons.has(id)) buttons.set(id, { textContent:'', className:'' });
    return buttons.get(id);
  } }, alert: message => { throw new Error(message); } });
  const section = script.slice(script.indexOf('let activePollId ='), script.indexOf('/* Seed data'));
  vm.runInContext('let songs=[]; '+section, context);
  context.saveToCloud = async () => true;
  await assert.rejects(context.toggleDinnerMusic(), /Mark at least one/);
  vm.runInContext("songs=[{id:'s1', dinnerMusic:true}];", context);
  await context.toggleDinnerMusic();
  assert.equal(buttons.get('dinnerMusicToggleBtn').textContent, 'Dinner Music: ON');
  await context.toggleDinnerMusic();
  assert.equal(buttons.get('dinnerMusicToggleBtn').textContent, 'Dinner Music: OFF');
  assert.match(html, /id="fDinnerMusic"/);
  assert.match(html, /dinnerMusicOnly, rnbSoulOnly, smsRequestsEnabled/);
  assert.match(html, /'powerSong','dinnerMusic','rnbSoul'/);
});

test('R&B and Soul uses its own selection and switches off Dinner Music', async () => {
  const buttons = new Map();
  const context = vm.createContext({ document:{ getElementById(id) {
    if(!buttons.has(id)) buttons.set(id, { textContent:'', className:'' });
    return buttons.get(id);
  } }, alert: message => { throw new Error(message); } });
  const section = script.slice(script.indexOf('let activePollId ='), script.indexOf('/* Seed data'));
  vm.runInContext('let songs=[]; '+section, context);
  context.saveToCloud = async () => true;
  await assert.rejects(context.toggleRnbSoul(), /Mark at least one/);
  vm.runInContext("songs=[{id:'s1',dinnerMusic:true},{id:'s2',rnbSoul:true}];", context);
  await context.toggleDinnerMusic();
  await context.toggleRnbSoul();
  assert.equal(buttons.get('dinnerMusicToggleBtn').textContent, 'Dinner Music: OFF');
  assert.equal(buttons.get('rnbSoulToggleBtn').textContent, 'R&B and Soul: ON');
  await context.toggleDinnerMusic();
  assert.equal(buttons.get('rnbSoulToggleBtn').textContent, 'R&B and Soul: OFF');
  assert.match(html, /id="fRnbSoul"/);
});
