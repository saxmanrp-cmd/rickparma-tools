import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../song-manager.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function setup(){
  const elements = new Map();
  const getElementById = id => {
    if(!elements.has(id)) elements.set(id, {
      value:'', innerHTML:'', textContent:'', disabled:false,
      classList:{ add(){}, remove(){} },
      querySelectorAll(){
        if(this.inputsMarkup === this.innerHTML) return this.inputs;
        this.inputsMarkup = this.innerHTML;
        this.inputs = [...this.innerHTML.matchAll(/<input type="checkbox" data-index="(\d+)"( checked)?\s*>/g)]
          .map(match => ({ dataset:{ index:match[1] }, checked:!!match[2],
            addEventListener(_name, handler){ this.change = handler; } }));
        return this.inputs;
      }
    });
    return elements.get(id);
  };
  const context = vm.createContext({ document:{getElementById}, alert: message => { throw new Error(message); } });
  const code = script.slice(script.indexOf('let bulkCategory ='), script.indexOf('/* Seed data'));
  vm.runInContext(`let songs=[{id:'a',t:'A Song',a:'Artist',powerSong:true},
    {id:'b',t:'B Song',a:'Another Artist',dinnerMusic:true},
    {id:'c',t:'C Song',a:'Third Artist'}];
    let dinnerMusicOnly=false; let powerSongsAvailable=false;
    function escapeHtml(value){return value;} function renderList(){}; ${code}`, context);
  const state = () => JSON.parse(vm.runInContext('JSON.stringify({songs,dinnerMusicOnly,powerSongsAvailable})', context));
  return { context, elements, getElementById, state };
}

test('selecting several dinner songs and saving does not activate guest mode', async () => {
  const { context, getElementById, state } = setup();
  let saved;
  context.saveToCloud = async () => { saved = state(); return true; };
  context.openBulkSongs('dinnerMusic');
  assert.match(getElementById('bulkCount').textContent, /1 selected/);
  getElementById('bulkSearch').value = 'A Song';
  context.renderBulkSongs();
  const [checkbox] = getElementById('bulkList').querySelectorAll();
  checkbox.checked = true; checkbox.change();
  assert.match(getElementById('bulkCount').textContent, /2 selected/);
  await context.saveBulkSongs();
  assert.deepEqual(saved.songs.map(s => !!s.dinnerMusic), [true,true,false]);
  assert.equal(saved.dinnerMusicOnly, false);
  assert.equal(saved.songs[0].powerSong, true);
});

test('power selection is independent; Cancel and failed Save discard edits', async () => {
  const { context, getElementById, state } = setup();
  context.openBulkSongs('powerSong');
  const checkboxes = getElementById('bulkList').querySelectorAll();
  checkboxes[0].checked = false; checkboxes[0].change();
  context.closeBulkSongs();
  assert.equal(state().songs[0].powerSong, true);
  context.openBulkSongs('powerSong');
  const powerChecks = getElementById('bulkList').querySelectorAll();
  powerChecks[1].checked = true; powerChecks[1].change();
  context.saveToCloud = async () => false;
  await context.saveBulkSongs();
  assert.equal(state().songs[1].powerSong, undefined);
  assert.equal(state().songs[1].dinnerMusic, true);
  assert.equal(getElementById('bulkSaveBtn').disabled, false);
});
