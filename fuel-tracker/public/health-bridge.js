(function(){
'use strict';
const $=id=>document.getElementById(id);
const STORAGE_KEY='fuel-apple-health-latest';
const hasNative=()=>!!window.webkit?.messageHandlers?.healthKit;
function fmt(v,d=0){const n=Number(v);return Number.isFinite(n)?n.toFixed(d).replace(/\.0$/,''):'—'}
function install(){
  const section=$('progress');
  if(!section||section.dataset.healthBridge)return;
  section.dataset.healthBridge='1';
  const cards=[...section.querySelectorAll('.card')];
  const card=cards.find(c=>c.querySelector('h2')?.textContent.trim()==='Apple Health');
  if(!card)return;
  card.innerHTML=`<div class="sectiontitle"><h2>Apple Health</h2><span id="healthState" class="pill">${hasNative()?'available':'iPhone app required'}</span></div>
    <p id="healthNote" class="note" style="margin-top:0">${hasNative()?'Apple Health is Fuel’s main health-data source.':'Apple Health access works through the native Fuel iPhone app. Your web tracker still works normally.'}</p>
    <div id="healthMetrics" class="grid" style="display:none;margin:10px 0"></div>
    <div class="row"><button id="healthConnect" class="primary" ${hasNative()?'':'disabled'}>${hasNative()?' Connect Apple Health':' Apple Health — native app required'}</button><button id="healthSync" class="secondary" style="display:none">Sync now</button></div>
    <div id="healthStatus" class="status"></div>`;
  const saved=load(); if(saved)render(saved);
  $('healthConnect')?.addEventListener('click',authorize);
  $('healthSync')?.addEventListener('click',()=>sync(false));
  if(hasNative()) sync(true);
}
function load(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
function save(x){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(x))}catch{}}
function status(msg){const el=$('healthStatus');if(!el)return;el.style.display='block';el.textContent=msg}
async function call(action){
  const h=window.webkit?.messageHandlers?.healthKit;
  if(!h)throw new Error('Open Fuel in the native iPhone app to use Apple Health.');
  const result=await h.postMessage({action});
  if(result?.error)throw new Error(result.error);
  return result;
}
async function authorize(){
  status('Requesting Apple Health permission…');
  try{const r=await call('authorize');if(!r?.ok)throw new Error('Apple Health permission was not granted.');$('healthState').textContent='connected';await sync(false)}catch(e){status(e.message||'Could not connect Apple Health.')}
}
async function sync(silent){
  if(!silent)status('Syncing Apple Health…');
  try{const r=await call('today');if(!r?.ok)throw new Error(r?.error||'Apple Health sync failed.');const data={...r.data,syncedAt:new Date().toISOString()};save(data);render(data);if(!silent)status('Apple Health synced.')}catch(e){if(!silent)status(e.message||'Apple Health sync failed.')}
}
function render(d){
  const grid=$('healthMetrics');if(!grid)return;grid.style.display='grid';
  const extra=[];
  if(Number.isFinite(Number(d.bodyFatPercent)))extra.push(`<div class="metric"><b>${fmt(d.bodyFatPercent,1)}%</b><small>body fat</small></div>`);
  if(Number.isFinite(Number(d.leanBodyMassLb)))extra.push(`<div class="metric"><b>${fmt(d.leanBodyMassLb,1)}</b><small>lean body mass lb</small></div>`);
  if(Number.isFinite(Number(d.bmi)))extra.push(`<div class="metric"><b>${fmt(d.bmi,1)}</b><small>BMI</small></div>`);
  if(Number.isFinite(Number(d.waistInches)))extra.push(`<div class="metric"><b>${fmt(d.waistInches,1)}</b><small>waist in</small></div>`);
  if(Number.isFinite(Number(d.fatMassLb)))extra.push(`<div class="metric"><b>${fmt(d.fatMassLb,1)}</b><small>fat mass lb</small></div>`);
  if(Number.isFinite(Number(d.fatFreeMassLb)))extra.push(`<div class="metric"><b>${fmt(d.fatFreeMassLb,1)}</b><small>fat-free mass lb</small></div>`);
  grid.innerHTML=`<div class="metric"><b>${fmt(d.steps)}</b><small>steps today</small></div>
    <div class="metric"><b>${fmt(d.activeCalories)}</b><small>active calories</small></div>
    <div class="metric"><b>${fmt(d.distanceMiles,1)}</b><small>walking/running mi</small></div>
    <div class="metric"><b>${fmt(d.restingHeartRate)}</b><small>resting HR bpm</small></div>
    <div class="metric"><b>${fmt(d.sleepHours,1)}</b><small>sleep hours</small></div>
    <div class="metric"><b>${fmt(d.weightLb,1)}</b><small>latest weight lb</small></div>${extra.join('')}`;
  $('healthSync').style.display=hasNative()?'block':'none';
  if(hasNative()){$('healthState').textContent='connected';$('healthConnect').textContent='Health connected'}
  if(d.syncedAt)$('healthNote').textContent='Last sync '+new Date(d.syncedAt).toLocaleString()+'. Fuel reads compatible data written to Apple Health by connected devices and apps.';
  window.dispatchEvent(new CustomEvent('fuel-health-synced',{detail:d}));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
