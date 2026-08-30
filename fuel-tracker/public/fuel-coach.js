(()=>{
'use strict';
const $=id=>document.getElementById(id);
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch{return f}};
const localDay=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function totals(foods=[]){return foods.reduce((a,x)=>({cal:a.cal+(+x.cal||0),p:a.p+(+x.p||0),c:a.c+(+x.c||0),f:a.f+(+x.f||0)}),{cal:0,p:0,c:0,f:0})}
function context(){
  const raw=read('fuel-settings',{}),targets={cal:Number(raw.cal)||1900,pro:Number(raw.pro)||150};
  const days=[];
  for(let i=0;i<7;i++){
    const d=new Date();d.setDate(d.getDate()-i);const date=localDay(d),foods=read(`fuel-meals-${date}`,[]);
    days.push({date,foods,totals:totals(foods),checkin:read(`fuel-checkin-${date}`,null)});
  }
  return {generatedAt:new Date().toISOString(),targets,days,bodyScans:read('fuel-body-scans-v2',[]).slice(-5),appleHealth:read('fuel-apple-health-latest',null)};
}
function setup(){
  if($('fuelCoachModal'))return;
  const css=document.createElement('style');
  css.textContent='.fcBar{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}.fcBtn{border:0;border-radius:14px;padding:14px 8px;font-weight:800;color:#fff;background:#129b68}.fcBtn:last-child{background:#5b49df}.fcModal{display:none;position:fixed;inset:0;background:#000b;z-index:99999;align-items:flex-end}.fcModal.open{display:flex}.fcSheet{width:100%;max-height:90vh;overflow:auto;background:#111827;color:#fff;border-radius:22px 22px 0 0;padding:18px}.fcHead{display:flex;justify-content:space-between;align-items:center}.fcInput{box-sizing:border-box;width:100%;min-height:96px;margin:14px 0;padding:12px;border-radius:12px;background:#0b1220;color:#fff;border:1px solid #ffffff30;font-size:16px}.fcSend{width:100%;padding:14px;border:0;border-radius:12px;background:#19c37d;color:#fff;font-weight:800}.fcAnswer{white-space:pre-wrap;line-height:1.55;margin-top:14px;padding:14px;border-radius:12px;background:#ffffff0b}.fcClose{background:none;border:0;color:#fff;font-size:28px}.fcQuick{display:flex;gap:7px;overflow:auto;margin:10px 0 2px}.fcChip{white-space:nowrap;border:1px solid #ffffff2b;border-radius:999px;background:#ffffff0d;color:#fff;padding:8px 10px;font-size:12px}';
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('beforeend','<div id="fuelCoachModal" class="fcModal"><div class="fcSheet"><div class="fcHead"><h2>💬 Fuel Coach</h2><button id="fcClose" class="fcClose">×</button></div><div id="fcIntro">Ask about your food log, targets and recent progress.</div><div id="fcQuick" class="fcQuick"><button class="fcChip">What should I eat next?</button><button class="fcChip">How is my protein?</button><button class="fcChip">How is this week going?</button></div><textarea id="fcQuestion" class="fcInput" placeholder="What should I eat for the rest of today?"></textarea><button id="fcSend" class="fcSend">Ask Fuel Coach</button><div id="fcAnswer"></div></div></div>');
  $('fcClose').onclick=()=> $('fuelCoachModal').classList.remove('open');
  $('fuelCoachModal').onclick=e=>{if(e.target===$('fuelCoachModal'))$('fuelCoachModal').classList.remove('open')};
  $('fcSend').onclick=()=>run('question',$('fcQuestion').value);
  [...document.querySelectorAll('.fcChip')].forEach(b=>b.onclick=()=>{$('fcQuestion').value=b.textContent;run('question',b.textContent)});
}
async function run(mode,question=''){
  const out=$('fcAnswer');out.className='fcAnswer';
  if(mode==='question'&&!String(question).trim()){out.textContent='Type a question first.';return}
  out.textContent=mode==='scan'?'Analyzing today and your recent week…':'Thinking…';
  try{
    const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,question:String(question).trim(),context:context()})});
    const d=await r.json();if(!d.ok)throw Error(d.error||'Unable to answer');
    out.textContent=d.answer+(d.provider==='openai'?'\n\nFuel Coach · OpenAI':'');
  }catch(e){out.textContent=e.message||'Fuel Coach could not answer right now.'}
}
function open(mode){
  setup();$('fuelCoachModal').classList.add('open');const scan=mode==='scan';
  $('fcQuestion').style.display=scan?'none':'block';$('fcSend').style.display=scan?'none':'block';$('fcQuick').style.display=scan?'none':'flex';
  $('fcIntro').textContent=scan?'Reviewing today, the last 7 days, your targets, body scans and any synced Apple Health data.':'Ask Fuel Coach anything about your nutrition and progress.';
  $('fcAnswer').textContent='';if(scan)run('scan');else setTimeout(()=>$('fcQuestion').focus(),100);
}
function install(){
  setup();const host=document.querySelector('#today .card')||document.querySelector('main .card')||document.querySelector('main');
  if(!host||host.querySelector('.fcBar'))return;
  const b=document.createElement('div');b.className='fcBar';b.innerHTML='<button class="fcBtn">💬 Ask Fuel Coach</button><button class="fcBtn">✨ Analyze My Day</button>';
  host.appendChild(b);b.children[0].onclick=()=>open('question');b.children[1].onclick=()=>open('scan');
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install):install();setTimeout(install,700);
})();