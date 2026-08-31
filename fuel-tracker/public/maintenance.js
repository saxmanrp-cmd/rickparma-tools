(()=>{
'use strict';
const DEFAULT_TDEE=2400;
const $=id=>document.getElementById(id);
function read(k,f){try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch{return f}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function localDay(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function settings(){const s=read('fuel-settings',{});return {cal:Number(s.cal)||1900,pro:Number(s.pro)||150,tdee:Number(s.tdee)||DEFAULT_TDEE}}
function meals(){return read('fuel-meals-'+localDay(),[])}
function calories(){return Math.round(meals().reduce((n,x)=>n+(+x.cal||0),0))}
function renderHome(){const home=$('home');if(!home)return;let card=$('fuelDeficitCard');if(!card){card=document.createElement('div');card.id='fuelDeficitCard';card.className='card';const first=home.querySelector('.card');if(first?.nextSibling)home.insertBefore(card,first.nextSibling);else home.appendChild(card)}const s=settings(),eaten=calories(),planned=s.tdee-s.cal,current=s.tdee-eaten;const label=current>=0?'calories below maintenance':'calories over maintenance';card.innerHTML=`<div class="sectiontitle"><h2>Calorie deficit</h2><span class="pill">maintenance ${Math.round(s.tdee)}</span></div><div class="grid"><div class="metric"><b>${Math.round(s.tdee)}</b><small>maintenance</small></div><div class="metric"><b>${Math.round(s.cal)}</b><small>daily target</small></div><div class="metric"><b>${Math.round(eaten)}</b><small>eaten today</small></div><div class="metric"><b>${Math.abs(Math.round(current))}</b><small>${label}</small></div></div><div class="deficitPlan">Target deficit: <b>${Math.max(0,Math.round(planned))} cal/day</b></div>`}
function installSettings(){const settingsPage=$('settings');if(!settingsPage)return;let card=$('fuelMaintenanceSettings');if(!card){card=document.createElement('div');card.id='fuelMaintenanceSettings';card.className='card';const reset=$('resetAll')?.closest('.card');card.innerHTML='<div class="sectiontitle"><h2>Maintenance calories</h2></div><label>Maintenance / TDEE<input id="sTdee" type="number" min="1000" max="6000" step="25"></label><div class="spacer"></div><button id="saveTdee" class="primary" style="width:100%">Save maintenance</button>';settingsPage.insertBefore(card,reset||null);$('saveTdee').addEventListener('click',()=>{const n=Number($('sTdee').value);if(!Number.isFinite(n)||n<1000||n>6000)return;const s=read('fuel-settings',{});write('fuel-settings',{...s,tdee:Math.round(n)});renderAll()})}$('sTdee').value=settings().tdee}
function installStyle(){if($('fuelMaintenanceStyle'))return;const style=document.createElement('style');style.id='fuelMaintenanceStyle';style.textContent='.deficitPlan{margin-top:11px;font-size:14px;color:var(--muted)}';document.head.appendChild(style)}
function renderAll(){installStyle();installSettings();renderHome()}
window.addEventListener('fuel-meals-changed',renderAll);
window.addEventListener('storage',renderAll);
document.addEventListener('click',e=>{if(e.target.closest('#saveAi,#manualAdd,.quick button,.del,.editMeal,#saveSettings'))setTimeout(renderAll,100)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{renderAll();setTimeout(renderAll,800)});else{renderAll();setTimeout(renderAll,800)}
window.FuelMaintenance={get:()=>settings().tdee,summary:()=>{const s=settings(),eaten=calories();return {estimatedMaintenance:s.tdee,calorieTarget:s.cal,plannedDeficit:s.tdee-s.cal,caloriesEatenToday:eaten,estimatedDeficitVsMaintenance:s.tdee-eaten}}};
})();
import('/coach-notifications.js?v=1').catch(()=>{});
