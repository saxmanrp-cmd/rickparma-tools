(()=>{
'use strict';
const $=id=>document.getElementById(id);
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch{return f}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const KEY='fuel-coach-notifications-v1';
const SETTINGS_KEY='fuel-coach-notification-settings-v1';
const bridge=()=>window.webkit?.messageHandlers?.fuelNotifications;
const day=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function totals(foods=[]){return foods.reduce((a,x)=>({cal:a.cal+(+x.cal||0),p:a.p+(+x.p||0)}),{cal:0,p:0})}
function settings(){const s=read(SETTINGS_KEY,{});return {enabled:s.enabled!==false,quietStart:s.quietStart||'22:00',quietEnd:s.quietEnd||'08:00'}}
function tracker(){const raw=read('fuel-settings',{}),foods=read('fuel-meals-'+day(),[]),t=totals(foods),health=read('fuel-apple-health-latest',null),checkin=read('fuel-checkin-'+day(),null);return {targets:{cal:Number(raw.cal)||1900,pro:Number(raw.pro)||150},maintenance:Number(raw.tdee)||2400,foods,totals:t,health,checkin}}
function parseClock(s,base=new Date()){const [h,m]=String(s||'').split(':').map(Number);const d=new Date(base);d.setHours(Number.isFinite(h)?h:0,Number.isFinite(m)?m:0,0,0);return d}
function inQuiet(d,s){const start=parseClock(s.quietStart,d),end=parseClock(s.quietEnd,d);if(start<=end)return d>=start&&d<end;return d>=start||d<end}
function nextAllowed(d,s){const out=new Date(d);if(!inQuiet(out,s))return out;const end=parseClock(s.quietEnd,out);if(out>=parseClock(s.quietStart,out))end.setDate(end.getDate()+1);return end}
function scheduleAt(hour,minute,offsetDays=0){const d=new Date();d.setDate(d.getDate()+offsetDays);d.setHours(hour,minute,0,0);if(d<=new Date())d.setDate(d.getDate()+1);return d}
function buildPlan(){const s=settings();if(!s.enabled)return[];const d=tracker(),now=new Date(),out=[];const foods=d.foods||[],cal=d.totals.cal||0,pro=d.totals.p||0,calLeft=Math.max(0,d.targets.cal-cal),proLeft=Math.max(0,d.targets.pro-pro);
  const times=foods.map(x=>{const dt=new Date(`${day()} ${x.time||''}`);return Number.isFinite(dt.getTime())?dt:null}).filter(Boolean);
  let firstHour=13,lastHour=17;if(times.length){firstHour=Math.max(10,Math.min(...times.map(x=>x.getHours())));lastHour=Math.min(20,Math.max(...times.map(x=>x.getHours()))+1)}
  if(!foods.length){let when=new Date();when.setHours(firstHour+1,0,0,0);if(when<=now)when=new Date(now.getTime()+60*60*1000);when=nextAllowed(when,s);out.push({id:'fuel-log-nudge',title:'Fuel Coach',body:'No food is logged yet. When you eat, log it so I can coach the rest of your day accurately.',at:when.toISOString()})}
  if(foods.length&&proLeft>=35){let when=new Date();when.setHours(Math.min(20,lastHour),15,0,0);if(when<=now)when=new Date(now.getTime()+75*60*1000);when=nextAllowed(when,s);out.push({id:'fuel-protein-nudge',title:'Fuel Coach',body:`You’re about ${Math.round(proLeft)}g short on protein. Make the next meal protein-heavy if you’re still eating today.`,at:when.toISOString()})}
  if(foods.length&&calLeft>=350){let when=new Date();when.setHours(Math.min(20,lastHour),30,0,0);if(when<=now)when=new Date(now.getTime()+90*60*1000);when=nextAllowed(when,s);out.push({id:'fuel-calorie-nudge',title:'Fuel Coach',body:`You’re about ${Math.round(calLeft)} calories under today’s target. If your eating window is still open, use that room deliberately.`,at:when.toISOString()})}
  const evening=nextAllowed(scheduleAt(20,15),s);out.push({id:'fuel-day-review',title:'Fuel Coach',body:'Quick check: if you’re done eating, your day is set. If not, log anything missing so tomorrow’s coaching stays accurate.',at:evening.toISOString()});
  const morning=nextAllowed(scheduleAt(9,0),s);out.push({id:'fuel-morning-check',title:'Fuel Coach',body:'Morning check-in: open Fuel when you’re ready and I’ll refresh your health data and adjust today’s plan.',at:morning.toISOString()});
  return out.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).slice(0,5)
}
async function call(action,payload={}){const h=bridge();if(!h)return {ok:false,native:false};try{return await h.postMessage({action,...payload})}catch(e){return {ok:false,error:e?.message||'Notification bridge failed'}}}
async function recalc(){const s=settings();if(!s.enabled){await call('cancelAll');write(KEY,{at:new Date().toISOString(),plan:[]});return}const plan=buildPlan();const result=await call('replace',{notifications:plan});write(KEY,{at:new Date().toISOString(),plan,result});renderSettings()}
async function enable(){const r=await call('authorize');if(r?.ok){const s=settings();write(SETTINGS_KEY,{...s,enabled:true});await recalc()}renderSettings()}
async function disable(){const s=settings();write(SETTINGS_KEY,{...s,enabled:false});await call('cancelAll');renderSettings()}
function renderSettings(){const page=$('settings');if(!page)return;let card=$('fuelNotificationSettings');if(!card){card=document.createElement('div');card.id='fuelNotificationSettings';card.className='card';const reset=$('resetAll')?.closest('.card');page.insertBefore(card,reset||null)}const s=settings(),native=!!bridge();card.innerHTML=`<div class="sectiontitle"><h2>Coach Notifications</h2><span class="pill">${s.enabled?'on':'off'}</span></div><div class="row"><button id="fuelNotifyToggle" class="${s.enabled?'secondary':'primary'}">${s.enabled?'Turn off':'Turn on'}</button><button id="fuelNotifyRefresh" class="secondary" ${native?'':'disabled'}>Refresh plan</button></div>`;$('fuelNotifyToggle').onclick=()=>s.enabled?disable():enable();$('fuelNotifyRefresh').onclick=recalc}
function install(){renderSettings();recalc()}
['fuel-health-synced','fuel-app-active','fuel-meals-changed'].forEach(name=>window.addEventListener(name,()=>setTimeout(recalc,250)));
document.addEventListener('click',e=>{if(e.target.closest('#saveAi,#manualAdd,.quick button,.del,.editMeal,#saveSettings,#saveTdee'))setTimeout(recalc,500)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
window.FuelCoachNotifications={recalc,buildPlan,settings};
})();
