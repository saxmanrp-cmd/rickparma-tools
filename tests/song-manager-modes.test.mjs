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
