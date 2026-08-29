(function(){
'use strict';
const $=id=>document.getElementById(id);
const defaults={cal:1900,pro:150};
const fav=[
  ['🥩 Ribeye 8 oz',656,56,0,48],['🍳 Eggs x3',216,19,1,14],
  ['🥓 Bacon x3',129,9,0,10],['🍤 Shrimp 6 oz',168,40,1,2],
  ['🍗 Chicken 8 oz',416,64,0,16],['🧀 Cheese 1 oz',115,7,1,10],
  ['🥔 Potato',130,3,30,0],['🍚 Rice 1/2 cup',103,2,23,0]
];
let draft=null;
let scanner=null;

function safeGet(k,f){try{const x=localStorage.getItem(k);return x?JSON.parse(x):f}catch{return f}}
function safeSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function day(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function settings(){const s=safeGet('fuel-settings',{});return {cal:Number(s.cal)||defaults.cal,pro:Number(s.pro)||defaults.pro}}
function meals(){return safeGet('fuel-meals-'+day(),[])}
function setMeals(a){safeSet('fuel-meals-'+day(),a)}
function status(msg){$('status').style.display='block';$('status').textContent=msg}
function apiStatus(id,msg){const el=$(id);el.style.display='block';el.textContent=msg}

function showPage(name){
  document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===name));
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.page===name));
  window.scrollTo(0,0);
  if(name==='progress')renderScans();
}

function render(){
  const s=settings(),a=meals();
  const t=a.reduce((n,x)=>({cal:n.cal+(+x.cal||0),p:n.p+(+x.p||0),c:n.c+(+x.c||0),f:n.f+(+x.f||0)}),{cal:0,p:0,c:0,f:0});
  $('calNow').textContent=Math.round(t.cal);
  $('proNow').textContent=Math.round(t.p)+'g';
  $('carbNow').textContent=Math.round(t.c)+'g';
  $('fatNow').textContent=Math.round(t.f)+'g';
  $('calGoal').textContent=s.cal;
  $('proGoal').textContent=s.pro;
  $('calLeft').textContent=Math.max(0,Math.round(s.cal-t.cal));
  $('proLeft').textContent=Math.max(0,Math.round(s.pro-t.p));
  $('meals').innerHTML=a.length?a.slice().reverse().map(x=>`<div class="meal"><div><b>${esc(x.name)}</b><br><small>${esc(x.time||'')} · ${esc(x.source||'logged')} · <button class="danger del" data-id="${x.id}">delete</button></small></div><div class="mealnums"><b>${Math.round(x.cal)} cal</b><small>${Math.round(x.p)}P · ${Math.round(x.c)}C · ${Math.round(x.f)}F</small></div></div>`).join(''):'<div class="muted">Nothing logged yet.</div>';
  $('sCal').value=s.cal;$('sPro').value=s.pro;
}

function addMeal(o){
  const a=meals();
  o.id=Date.now()+Math.floor(Math.random()*1000);
  o.time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  a.push(o);setMeals(a);render();showPage('home');
}

function openReview(data){
  draft=data;
  if(!draft||!Array.isArray(draft.items)||!draft.items.length)return;
  $('reviewItems').innerHTML=draft.items.map((x,i)=>`<div class="reviewItem" data-i="${i}"><input class="rName" value="${esc(x.name||'Food')}"><input class="rAmt" value="${esc(x.amount||'')}" placeholder="Amount"><div class="macrogrid"><label>Cal<input class="rCal" type="number" value="${x.calories||0}"></label><label>Protein<input class="rPro" type="number" value="${x.protein||0}"></label><label>Carbs<input class="rCarb" type="number" value="${x.carbs||0}"></label><label>Fat<input class="rFat" type="number" value="${x.fat||0}"></label></div></div>`).join('');
  $('reviewNote').textContent=draft.note||'Review the estimate before saving.';
  updateReviewTotals();
  $('review').classList.add('open');
}

function readReview(){
  return [...document.querySelectorAll('.reviewItem')].map(row=>({
    name:row.querySelector('.rName').value.trim()||'Food',amount:row.querySelector('.rAmt').value.trim(),
    calories:+row.querySelector('.rCal').value||0,protein:+row.querySelector('.rPro').value||0,
    carbs:+row.querySelector('.rCarb').value||0,fat:+row.querySelector('.rFat').value||0
  }));
}
function updateReviewTotals(){
  const t=readReview().reduce((a,x)=>({cal:a.cal+x.calories,p:a.p+x.protein,c:a.c+x.carbs,f:a.f+x.fat}),{cal:0,p:0,c:0,f:0});
  $('reviewTotals').textContent=`${Math.round(t.cal)} cal · ${Math.round(t.p)}P · ${Math.round(t.c)}C · ${Math.round(t.f)}F`;
}

async function requestAnalysis(text,file){
  const fd=new FormData();fd.append('text',text||'');if(file)fd.append('image',file,file.name||'meal.jpg');
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),40000);
  try{
    const r=await fetch('/api/fuel/analyze',{method:'POST',body:fd,signal:ctl.signal});
    const j=await r.json();if(!r.ok)throw new Error(j.error||'Analysis failed');return j;
  }finally{clearTimeout(timer)}
}

async function analyze(){
  const text=$('foodText').value.trim(),file=$('photo').files?.[0];
  if(!text&&!file){status('Type a meal or choose a photo first.');return}
  const b=$('analyze');b.disabled=true;b.textContent='Analyzing…';status('Working on it…');
  try{openReview(await requestAnalysis(text,file));status('Estimate ready — review it before saving.')}catch(e){status(e.name==='AbortError'?'Analysis took too long. Try again.':(e.message||'Analysis failed.'))}finally{b.disabled=false;b.textContent='✨ Analyze meal'}
}

async function lookupBarcode(code){
  code=String(code||'').replace(/\D/g,'');
  if(!code){apiStatus('barcodeStatus','Enter or scan a barcode first.');return}
  apiStatus('barcodeStatus','Looking up barcode…');
  try{
    const r=await fetch('/api/fuel/barcode?code='+encodeURIComponent(code));const j=await r.json();
    if(!r.ok)throw new Error(j.error||'Barcode not found');
    apiStatus('barcodeStatus',`${j.product.brand?j.product.brand+' · ':''}${j.product.name}`);
    openReview({items:[j.product],note:j.note||'Barcode nutrition from product data. Check the serving size.'});
  }catch(e){apiStatus('barcodeStatus',e.message||'Barcode lookup failed.')}
}

async function startScanner(){
  $('scannerWrap').classList.add('open');
  if(!window.Html5Qrcode){apiStatus('scannerMsg','Scanner library did not load. You can type the UPC number instead.');return}
  try{
    scanner=new Html5Qrcode('reader');
    await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:280,height:150}},async decoded=>{
      $('barcodeCode').value=decoded;await stopScanner();lookupBarcode(decoded);
    },()=>{});
  }catch(e){apiStatus('scannerMsg','Camera scanner could not start. You can type the UPC number instead.');}
}
async function stopScanner(){
  try{if(scanner){await scanner.stop();await scanner.clear();}}catch{}scanner=null;$('scannerWrap').classList.remove('open');
}

async function searchRestaurant(){
  const q=$('restaurantQuery').value.trim();if(!q){apiStatus('restaurantStatus','Type a restaurant item first.');return}
  const b=$('restaurantSearch');b.disabled=true;b.textContent='Searching…';apiStatus('restaurantStatus','Searching nutrition data…');$('restaurantResults').innerHTML='';
  try{
    const r=await fetch('/api/fuel/restaurant?q='+encodeURIComponent(q));const j=await r.json();if(!r.ok)throw new Error(j.error||'Search failed');
    $('restaurantStatus').textContent=j.note||'Tap the closest match.';
    $('restaurantResults').innerHTML=(j.results||[]).map((x,i)=>`<button class="resultBtn" data-ri="${i}"><b>${esc(x.name)}</b><small>${esc(x.brand||x.source||'')} · ${Math.round(x.calories)} cal · ${Math.round(x.protein)}P · ${Math.round(x.carbs)}C · ${Math.round(x.fat)}F</small></button>`).join('')||'<div class="muted">No matches.</div>';
    $('restaurantResults').querySelectorAll('[data-ri]').forEach(btn=>btn.addEventListener('click',()=>openReview({items:[j.results[+btn.dataset.ri]],note:`Source: ${j.results[+btn.dataset.ri].source||'nutrition search'}. Verify portion before saving.`})));
  }catch(e){apiStatus('restaurantStatus',e.message||'Restaurant search failed.')}finally{b.disabled=false;b.textContent='🔎 Search restaurant food'}
}

async function scanReceipt(){
  const file=$('receiptPhoto').files?.[0];if(!file){apiStatus('receiptStatus','Take or choose a receipt photo first.');return}
  const b=$('receiptScan');b.disabled=true;b.textContent='Reading…';apiStatus('receiptStatus','Reading receipt…');$('receiptItems').innerHTML='';
  try{
    const fd=new FormData();fd.append('image',file,file.name||'receipt.jpg');
    const r=await fetch('/api/fuel/receipt',{method:'POST',body:fd});const j=await r.json();if(!r.ok)throw new Error(j.error||'Receipt scan failed');
    apiStatus('receiptStatus','Check the items you personally ate, then analyze them.');
    $('receiptItems').innerHTML=(j.items||[]).map((x,i)=>`<label class="receiptItem"><input type="checkbox" data-receipt="${i}" checked><span><b>${esc(x.name)}</b><small>${esc(x.quantity||'')}</small></span></label>`).join('')||'<div class="muted">No food items found.</div>';
    $('receiptAnalyze').style.display=(j.items||[]).length?'block':'none';$('receiptAnalyze').dataset.items=JSON.stringify(j.items||[]);
  }catch(e){apiStatus('receiptStatus',e.message||'Receipt scan failed.')}finally{b.disabled=false;b.textContent='🧾 Read receipt'}
}
async function analyzeReceiptSelection(){
  const items=JSON.parse($('receiptAnalyze').dataset.items||'[]');
  const picked=[...document.querySelectorAll('[data-receipt]:checked')].map(x=>items[+x.dataset.receipt]).filter(Boolean);
  if(!picked.length){apiStatus('receiptStatus','Select at least one item.');return}
  const text='Restaurant or receipt items I ate: '+picked.map(x=>`${x.quantity||''} ${x.name}`.trim()).join(', ');
  $('receiptAnalyze').disabled=true;$('receiptAnalyze').textContent='Analyzing selected…';
  try{openReview(await requestAnalysis(text,null));}catch(e){apiStatus('receiptStatus',e.message||'Could not analyze selected items.')}finally{$('receiptAnalyze').disabled=false;$('receiptAnalyze').textContent='✨ Analyze selected items'}
}

function renderScans(){
  const a=safeGet('fuel-scans',[]);
  $('scanList').innerHTML=a.length?a.slice().reverse().map(x=>`<div class="scanrow"><b>${esc(x.date)}</b> · ${x.weight||'—'} lb · ${x.bf||'—'}% BF · ${x.mm||'—'} lb muscle</div>`).join(''):'No extra scans saved yet.';
}

function init(){
  $('quick').innerHTML=fav.map((x,i)=>`<button data-fav="${i}"><b>${x[0]}</b><small>${x[1]} cal · ${x[2]}P</small></button>`).join('');
  document.addEventListener('click',e=>{
    const favBtn=e.target.closest('[data-fav]');if(favBtn){const x=fav[+favBtn.dataset.fav];addMeal({name:x[0].replace(/^\S+\s/,''),cal:x[1],p:x[2],c:x[3],f:x[4],source:'quick add'});return}
    const del=e.target.closest('.del');if(del){setMeals(meals().filter(x=>String(x.id)!==del.dataset.id));render();return}
    const go=e.target.closest('[data-go]');if(go){showPage(go.dataset.go);return}
  });
  document.querySelectorAll('.tab').forEach(x=>x.addEventListener('click',()=>showPage(x.dataset.page)));
  $('analyze').addEventListener('click',analyze);
  $('manualAdd').addEventListener('click',()=>{const name=$('mName').value.trim();if(!name)return;addMeal({name,cal:+$('mCal').value||0,p:+$('mPro').value||0,c:+$('mCarb').value||0,f:+$('mFat').value||0,source:'manual'});});
  $('saveCheck').addEventListener('click',()=>{safeSet('fuel-checkin-'+day(),{weight:$('weight').value,waist:$('waist').value,miles:$('miles').value,activeCal:$('activeCal').value});$('saveCheck').textContent='Saved ✓';setTimeout(()=>$('saveCheck').textContent='Save check-in',1200)});
  const ci=safeGet('fuel-checkin-'+day(),{});['weight','waist','miles','activeCal'].forEach(k=>{if(ci[k]!=null)$(k).value=ci[k]});
  $('closeReview').addEventListener('click',()=>$('review').classList.remove('open'));
  $('reviewItems').addEventListener('input',updateReviewTotals);
  $('saveAi').addEventListener('click',()=>{const items=readReview();const t=items.reduce((a,x)=>({cal:a.cal+x.calories,p:a.p+x.protein,c:a.c+x.carbs,f:a.f+x.fat}),{cal:0,p:0,c:0,f:0});addMeal({name:items.map(x=>x.amount?`${x.amount} ${x.name}`:x.name).join(', '),cal:t.cal,p:t.p,c:t.c,f:t.f,source:draft?.source||'AI/review'});$('review').classList.remove('open');$('foodText').value='';$('photo').value='';});
  $('barcodeLookup').addEventListener('click',()=>lookupBarcode($('barcodeCode').value));
  $('barcodeScan').addEventListener('click',startScanner);$('stopScanner').addEventListener('click',stopScanner);
  $('restaurantSearch').addEventListener('click',searchRestaurant);$('restaurantQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchRestaurant()});
  $('receiptScan').addEventListener('click',scanReceipt);$('receiptAnalyze').addEventListener('click',analyzeReceiptSelection);
  $('saveScan').addEventListener('click',()=>{const a=safeGet('fuel-scans',[]);a.push({date:$('scanDate').value||day(),weight:$('scanWeight').value,bf:$('scanBf').value,mm:$('scanMm').value});safeSet('fuel-scans',a);renderScans()});
  $('scanDate').value=day();
  $('saveSettings').addEventListener('click',()=>{safeSet('fuel-settings',{cal:+$('sCal').value||1900,pro:+$('sPro').value||150});render();$('saveSettings').textContent='Saved ✓';setTimeout(()=>$('saveSettings').textContent='Save settings',1200)});
  $('resetAll').addEventListener('click',()=>{if(!confirm('Clear all Fuel Tracker data on this device?'))return;Object.keys(localStorage).filter(k=>k.startsWith('fuel-')).forEach(k=>localStorage.removeItem(k));location.reload()});
  render();
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
