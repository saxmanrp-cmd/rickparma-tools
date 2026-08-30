(function(){
'use strict';
const KEY='fuel-body-scans-v2';
const BASELINE={
  id:'inbody-2026-08-29',date:'2026-08-29',source:'InBody',weight:213.5,bodyFat:35.5,muscle:78.0,
  fatMass:75.7,ffm:137.8,bmr:1719,visceral:16,tbw:101.0,smi:8.9,score:67,waist:null
};
const $=id=>document.getElementById(id);
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=1)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(d).replace(/\.0$/,'');
function load(){
  let a=[];try{a=JSON.parse(localStorage.getItem(KEY)||'[]')}catch{}
  if(!Array.isArray(a)||!a.length){a=[BASELINE];save(a)}
  return a.map(x=>({...x})).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function save(a){localStorage.setItem(KEY,JSON.stringify(a))}
function diff(now,prev,key,unit='',invert=false){
  if(!prev||num(now?.[key])==null||num(prev?.[key])==null)return '';
  const d=num(now[key])-num(prev[key]);
  if(Math.abs(d)<0.05)return `<span class="pill">no change</span>`;
  const good=invert?d<0:d>0;
  const arrow=d>0?'↑':'↓';
  return `<span class="pill" style="${good?'border-color:#2f8f6c;color:#8ff1c8':'border-color:#80515a;color:#ffc2ca'}">${arrow} ${Math.abs(d).toFixed(1)}${unit}</span>`;
}
function install(){
  const section=$('progress');if(!section||section.dataset.bodyScanV2)return;
  section.dataset.bodyScanV2='1';
  section.innerHTML=`
    <div class="card">
      <div class="sectiontitle"><h2>Body composition</h2><span id="bsLatestDate" class="pill">latest scan</span></div>
      <div id="bsLatestGrid" class="grid"></div>
      <div id="bsLatestMore" class="note" style="margin-top:10px"></div>
      <div id="bsChange" style="margin-top:12px"></div>
    </div>
    <div class="card">
      <div class="sectiontitle"><h2>Add / update scan</h2><span class="pill">InBody or manual</span></div>
      <input id="bsId" type="hidden">
      <div class="grid">
        <label>Date<input id="bsDate" type="date"></label>
        <label>Source<input id="bsSource" placeholder="InBody"></label>
        <label>Weight lb<input id="bsWeight" type="number" step="0.1"></label>
        <label>Body fat %<input id="bsBodyFat" type="number" step="0.1"></label>
        <label>Skeletal muscle lb<input id="bsMuscle" type="number" step="0.1"></label>
        <label>Fat mass lb<input id="bsFatMass" type="number" step="0.1"></label>
        <label>Fat-free mass lb<input id="bsFfm" type="number" step="0.1"></label>
        <label>BMR<input id="bsBmr" type="number" step="1"></label>
        <label>Visceral fat level<input id="bsVisceral" type="number" step="0.1"></label>
        <label>Total body water lb<input id="bsTbw" type="number" step="0.1"></label>
        <label>SMI<input id="bsSmi" type="number" step="0.1"></label>
        <label>InBody score<input id="bsScore" type="number" step="1"></label>
        <label>Waist in<input id="bsWaist" type="number" step="0.1"></label>
      </div>
      <div class="spacer"></div>
      <div class="row"><button id="bsCancel" class="secondary" style="display:none">Cancel edit</button><button id="bsSave" class="primary">Save scan</button></div>
      <div id="bsStatus" class="status"></div>
    </div>
    <div class="card">
      <div class="sectiontitle"><h2>Scan history</h2><span id="bsCount" class="pill"></span></div>
      <div id="bsHistory"></div>
      <div id="scanList" style="display:none"></div>
    </div>
    <div class="card">
      <div class="sectiontitle"><h2>Apple Health</h2><span class="pill">next phase</span></div>
      <p class="note" style="margin-top:0">This section is ready for the native iPhone HealthKit bridge. Your body-scan history is being stored separately so Apple Health data can be added later without replacing your InBody records.</p>
      <button class="secondary" style="width:100%" disabled> Connect Apple Health — coming next</button>
    </div>`;
  $('bsDate').value=new Date().toISOString().slice(0,10);$('bsSource').value='InBody';
  $('bsSave').addEventListener('click',saveForm);$('bsCancel').addEventListener('click',clearForm);
  $('bsHistory').addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;const id=b.dataset.id;if(b.dataset.action==='edit')edit(id);if(b.dataset.action==='delete')remove(id)});
  render();
}
function latestCard(scan,prev){
  $('bsLatestDate').textContent=scan?`${scan.source||'Scan'} · ${scan.date}`:'No scans';
  $('bsLatestGrid').innerHTML=scan?`
    <div class="metric"><b>${fmt(scan.weight)}</b><small>weight lb</small></div>
    <div class="metric"><b>${fmt(scan.bodyFat)}%</b><small>body fat</small></div>
    <div class="metric"><b>${fmt(scan.muscle)}</b><small>skeletal muscle lb</small></div>
    <div class="metric"><b>${fmt(scan.bmr,0)}</b><small>BMR</small></div>`:'<div class="muted">Add your first scan.</div>';
  $('bsLatestMore').innerHTML=scan?`Fat mass ${fmt(scan.fatMass)} lb · Fat-free mass ${fmt(scan.ffm)} lb · Visceral fat ${fmt(scan.visceral)} · TBW ${fmt(scan.tbw)} lb · SMI ${fmt(scan.smi)} · Score ${fmt(scan.score,0)}${scan.waist!=null?` · Waist ${fmt(scan.waist)} in`:''}`:'';
  if(!scan||!prev){$('bsChange').innerHTML='<span class="note">Add another scan to see changes from your previous measurement.</span>';return}
  $('bsChange').innerHTML=`<div class="note" style="margin-bottom:7px">Change since ${esc(prev.date)}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${diff(scan,prev,'weight',' lb',true)} ${diff(scan,prev,'bodyFat','%',true)} ${diff(scan,prev,'fatMass',' lb',true)} ${diff(scan,prev,'muscle',' lb',false)} ${diff(scan,prev,'waist',' in',true)}</div>`;
}
function render(){
  const a=load(),scan=a[a.length-1],prev=a[a.length-2];latestCard(scan,prev);$('bsCount').textContent=`${a.length} scan${a.length===1?'':'s'}`;
  $('bsHistory').innerHTML=a.slice().reverse().map((x,i)=>{const older=a[a.length-2-i];return `<div class="scanrow"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><b>${esc(x.date)}</b> <span class="pill">${esc(x.source||'Scan')}</span><div class="note" style="margin-top:5px">${fmt(x.weight)} lb · ${fmt(x.bodyFat)}% fat · ${fmt(x.muscle)} lb muscle · BMR ${fmt(x.bmr,0)}${older?` · Δ fat ${num(x.bodyFat)!=null&&num(older.bodyFat)!=null?(num(x.bodyFat)-num(older.bodyFat)).toFixed(1)+'%':'—'}`:''}</div></div><div style="white-space:nowrap"><button class="secondary" data-action="edit" data-id="${esc(x.id)}" style="padding:5px 8px;font-size:12px">edit</button> <button class="danger" data-action="delete" data-id="${esc(x.id)}" style="padding:5px 8px;font-size:12px">delete</button></div></div></div>`}).join('');
}
function readField(id){const el=$(id);return el&&el.value!==''?num(el.value):null}
function saveForm(){
  const date=$('bsDate').value;if(!date){showStatus('Choose a scan date.');return}
  const id=$('bsId').value||`scan-${Date.now()}`;
  const item={id,date,source:$('bsSource').value.trim()||'InBody',weight:readField('bsWeight'),bodyFat:readField('bsBodyFat'),muscle:readField('bsMuscle'),fatMass:readField('bsFatMass'),ffm:readField('bsFfm'),bmr:readField('bsBmr'),visceral:readField('bsVisceral'),tbw:readField('bsTbw'),smi:readField('bsSmi'),score:readField('bsScore'),waist:readField('bsWaist')};
  if(item.weight==null&&item.bodyFat==null&&item.muscle==null){showStatus('Enter at least weight, body fat, or skeletal muscle.');return}
  const a=load(),idx=a.findIndex(x=>String(x.id)===String(id));if(idx>=0)a[idx]=item;else a.push(item);save(a);clearForm();render();showStatus(idx>=0?'Scan updated.':'Scan saved.');
}
function edit(id){const x=load().find(s=>String(s.id)===String(id));if(!x)return;$('bsId').value=x.id;$('bsDate').value=x.date||'';$('bsSource').value=x.source||'';[['bsWeight','weight'],['bsBodyFat','bodyFat'],['bsMuscle','muscle'],['bsFatMass','fatMass'],['bsFfm','ffm'],['bsBmr','bmr'],['bsVisceral','visceral'],['bsTbw','tbw'],['bsSmi','smi'],['bsScore','score'],['bsWaist','waist']].forEach(([id,k])=>$(id).value=x[k]??'');$('bsCancel').style.display='block';$('bsSave').textContent='Update scan';$('bsDate').scrollIntoView({behavior:'smooth',block:'center'})}
function remove(id){const a=load();const x=a.find(s=>String(s.id)===String(id));if(!x)return;if(!confirm(`Delete the ${x.date} body scan?`))return;save(a.filter(s=>String(s.id)!==String(id)));render();showStatus('Scan deleted.')}
function clearForm(){$('bsId').value='';$('bsDate').value=new Date().toISOString().slice(0,10);$('bsSource').value='InBody';['bsWeight','bsBodyFat','bsMuscle','bsFatMass','bsFfm','bsBmr','bsVisceral','bsTbw','bsSmi','bsScore','bsWaist'].forEach(id=>$(id).value='');$('bsCancel').style.display='none';$('bsSave').textContent='Save scan'}
function showStatus(msg){const el=$('bsStatus');if(!el)return;el.style.display='block';el.textContent=msg;setTimeout(()=>{if(el.textContent===msg)el.style.display='none'},2800)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
