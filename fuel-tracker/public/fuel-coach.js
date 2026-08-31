(()=>{
'use strict';
const $=id=>document.getElementById(id);
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch{return f}};
const localDay=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
let recognition=null,listening=false;
function totals(foods=[]){return foods.reduce((a,x)=>({cal:a.cal+(+x.cal||0),p:a.p+(+x.p||0),c:a.c+(+x.c||0),f:a.f+(+x.f||0)}),{cal:0,p:0,c:0,f:0})}
function healthBodyComposition(h){
  if(!h)return null;
  const out={source:'Apple Health',syncedAt:h.syncedAt||null};
  ['weightLb','bodyFatPercent','leanBodyMassLb','bmi','waistIn','fatMassLb','fatFreeMassLb'].forEach(k=>{if(Number.isFinite(Number(h[k])))out[k]=Number(h[k])});
  return Object.keys(out).length>2?out:null;
}
function context(){
  const raw=read('fuel-settings',{}),targets={cal:Number(raw.cal)||1900,pro:Number(raw.pro)||150};
  const days=[];
  for(let i=0;i<7;i++){
    const d=new Date();d.setDate(d.getDate()-i);const date=localDay(d),foods=read(`fuel-meals-${date}`,[]);
    days.push({date,foodLogStatus:foods.length?'logged':'no_entries',foodEntryCount:foods.length,foods,totals:foods.length?totals(foods):null,checkin:read(`fuel-checkin-${date}`,null)});
  }
  const appleHealth=read('fuel-apple-health-latest',null);
  return {generatedAt:new Date().toISOString(),targets,days,bodyScans:read('fuel-body-scans-v2',[]).slice(-5),appleHealth,appleHealthBodyComposition:healthBodyComposition(appleHealth)};
}
function setup(){
  if($('fuelCoachModal'))return;
  const css=document.createElement('style');
  css.textContent='.fcBar{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}.fcBtn{border:0;border-radius:14px;padding:14px 8px;font-weight:800;color:#fff;background:#129b68}.fcBtn:last-child{background:#5b49df}.fcModal{display:none;position:fixed;inset:0;background:#000b;z-index:99999;align-items:flex-end}.fcModal.open{display:flex}.fcSheet{width:100%;max-height:90vh;overflow:auto;background:#111827;color:#fff;border-radius:22px 22px 0 0;padding:18px}.fcHead{display:flex;justify-content:space-between;align-items:center}.fcInput{box-sizing:border-box;width:100%;min-height:82px;margin:12px 0;padding:12px;border-radius:12px;background:#0b1220;color:#fff;border:1px solid #ffffff30;font-size:16px}.fcSend,.fcTalk{width:100%;padding:14px;border:0;border-radius:12px;color:#fff;font-weight:800}.fcSend{background:#19c37d}.fcTalk{background:#2563eb;margin:10px 0}.fcTalk.listening{background:#d14343;box-shadow:0 0 0 5px #d1434330}.fcAnswer{white-space:pre-wrap;line-height:1.55;margin-top:14px;padding:14px;border-radius:12px;background:#ffffff0b}.fcClose{background:none;border:0;color:#fff;font-size:28px}.fcQuick{display:flex;gap:7px;overflow:auto;margin:10px 0 2px}.fcChip{white-space:nowrap;border:1px solid #ffffff2b;border-radius:999px;background:#ffffff0d;color:#fff;padding:8px 10px;font-size:12px}.fcVoiceNote{font-size:12px;color:#a7b3c8;text-align:center;margin-top:7px}';
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('beforeend','<div id="fuelCoachModal" class="fcModal"><div class="fcSheet"><div class="fcHead"><h2>💬 Fuel Coach</h2><button id="fcClose" class="fcClose">×</button></div><div id="fcIntro">Ask about your food log, targets and recent progress.</div><div id="fcQuick" class="fcQuick"><button class="fcChip">What should I eat next?</button><button class="fcChip">How is my protein?</button><button class="fcChip">How is this week going?</button></div><button id="fcTalk" class="fcTalk">🎙️ Tap to talk</button><textarea id="fcQuestion" class="fcInput" placeholder="Or type your question here"></textarea><button id="fcSend" class="fcSend">Ask Fuel Coach</button><div class="fcVoiceNote">Fuel Coach will speak every answer out loud.</div><div id="fcAnswer"></div></div></div>');
  $('fcClose').onclick=()=>closeCoach();
  $('fuelCoachModal').onclick=e=>{if(e.target===$('fuelCoachModal'))closeCoach()};
  $('fcSend').onclick=()=>run('question',$('fcQuestion').value);
  $('fcTalk').onclick=toggleListen;
  [...document.querySelectorAll('.fcChip')].forEach(b=>b.onclick=()=>{$('fcQuestion').value=b.textContent;run('question',b.textContent)});
}
function stopSpeaking(){
  try{speechSynthesis.cancel()}catch{}
  try{window.webkit?.messageHandlers?.fuelSpeech?.postMessage({action:'stop'})}catch{}
}
function speechCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition}
function ensureRecognition(){
  const C=speechCtor();if(!C)return null;
  if(recognition)return recognition;
  recognition=new C();recognition.lang='en-US';recognition.interimResults=true;recognition.continuous=false;
  recognition.onstart=()=>{listening=true;$('fcTalk').classList.add('listening');$('fcTalk').textContent='Listening… tap to stop'};
  recognition.onresult=e=>{let final='',interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)final+=t;else interim+=t}$('fcQuestion').value=(final||interim).trim();if(final.trim())setTimeout(()=>run('question',final.trim()),150)};
  recognition.onerror=e=>{if(e.error!=='aborted')$('fcAnswer').textContent='I could not hear that clearly. Tap the microphone and try again.'};
  recognition.onend=()=>{listening=false;if($('fcTalk')){$('fcTalk').classList.remove('listening');$('fcTalk').textContent='🎙️ Tap to talk'}};
  return recognition;
}
function toggleListen(){
  stopSpeaking();const r=ensureRecognition();
  if(!r){$('fcAnswer').textContent='Voice input is not available in this browser yet. You can still type your question.';return}
  if(listening){try{r.stop()}catch{};return}
  $('fcQuestion').value='';$('fcAnswer').textContent='';try{r.start()}catch{}
}
async function run(mode,question=''){
  const out=$('fcAnswer');out.className='fcAnswer';
  if(mode==='question'&&!String(question).trim()){out.textContent='Ask me a question first.';return}
  out.textContent=mode==='scan'?'Analyzing today and your recent week…':'Thinking…';
  try{
    const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,question:String(question).trim(),context:context()})});
    const d=await r.json();if(!d.ok)throw Error(d.error||'Unable to answer');
    out.textContent=d.answer+(d.provider==='openai'?'\n\nFuel Coach · OpenAI':'');
  }catch(e){out.textContent=e.message||'Fuel Coach could not answer right now.'}
}
function closeCoach(){
  try{if(recognition&&listening)recognition.abort()}catch{};stopSpeaking();$('fuelCoachModal')?.classList.remove('open');
}
function open(mode){
  setup();$('fuelCoachModal').classList.add('open');const scan=mode==='scan';
  $('fcQuestion').style.display=scan?'none':'block';$('fcSend').style.display=scan?'none':'block';$('fcQuick').style.display=scan?'none':'flex';$('fcTalk').style.display=scan?'none':'block';
  $('fcIntro').textContent=scan?'Reviewing today, the last 7 days, your targets, body scans and any synced Apple Health data.':'Talk to Fuel Coach naturally. Tap the microphone, ask your question, and Fuel Coach will answer out loud.';
  $('fcAnswer').textContent='';if(scan)run('scan');
}
function install(){
  setup();const home=$('home'),host=home?.querySelector('.card');
  if(!host||home.querySelector('.fcBar'))return;
  const b=document.createElement('div');b.className='fcBar';b.innerHTML='<button class="fcBtn">🎙️ Talk to Fuel Coach</button><button class="fcBtn">✨ Analyze My Day</button>';
  host.appendChild(b);b.children[0].onclick=()=>open('question');b.children[1].onclick=()=>open('scan');
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install):install();setTimeout(install,700);
})();
import('/portion-editor.js?v=1').catch(()=>{});
import('/fuel-voice-quality.js?v=4').catch(()=>{});