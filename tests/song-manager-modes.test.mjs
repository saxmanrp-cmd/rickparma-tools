import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../song-manager.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('performance and DJ switches persist separately from the master switch', async () => {
  const elements = new Map();
  const context = vm.createContext({ document:{ getElementById(id){
    if(!elements.has(id)) elements.set(id,{ textContent:'', className:'' });
    return elements.get(id);
  } } });
  vm.runInContext(script.slice(script.indexOf('let activePollId ='), script.indexOf('let bulkCategory =')), context);
  let state;
  context.saveToCloud = async () => { state = vm.runInContext('({songRequestLive,performanceModeEnabled,djModeEnabled})',context); return true; };
  await context.toggleDjMode();
  assert.equal(state.djModeEnabled,true);
  assert.equal(state.performanceModeEnabled,true);
  assert.equal(state.songRequestLive,true);
  await context.togglePerformanceMode();
  assert.equal(state.performanceModeEnabled,false);
  assert.equal(state.djModeEnabled,true);
  assert.equal(elements.get('djModeToggleBtn').textContent,'DJ Mode: ON');
  assert.match(html,/songRequestLive, performanceModeEnabled, djModeEnabled, fanCamLive/);
});

test('performance and DJ request prices save independently', async () => {
  const fields = {priceGeneral:{value:'7.50'},priceDj:{value:'12'}};
  let saved;
  const context = vm.createContext({
    document:{getElementById(id){ return fields[id]; }},
    prices:{general:5,dj:5},
    alert(message){ throw new Error(message); },
    async saveToCloud(){ saved = vm.runInContext('({...prices})',context); return true; },
    renderList(){}
  });
  vm.runInContext(script.slice(script.indexOf('async function savePrices()'),script.indexOf('/* ============ EDIT / ADD SHEET ============ */')),context);
  await context.savePrices();
  assert.equal(saved.general,7.5);
  assert.equal(saved.dj,12);
  fields.priceDj.value='4';
  await assert.rejects(() => context.savePrices(),/at least \$5/);
  assert.equal(saved.dj,12);
});
