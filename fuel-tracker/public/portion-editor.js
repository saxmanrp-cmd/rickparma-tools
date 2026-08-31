(()=>{
'use strict';
const $=id=>document.getElementById(id);
const UNITS=['oz','cup','tbsp','tsp','g','lb','piece','slice','wing','corner','serving'];
let bypassSave=false;
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function parseAmount(text=''){
  const s=String(text).trim();
  const m=s.match(/^([0-9]+(?:\.[0-9]+)?|\d+\/\d+)\s*(oz|ounces?|cups?|tbsp|tablespoons?|tsp|teaspoons?|grams?|g|lbs?|pounds?|pieces?|slices?|wings?|corners?|servings?)\b/i);
  if(!m)return {qty:'',unit:'oz',rest:s};
  const map={ounce:'oz',ounces:'oz',cup:'cup',cups:'cup',tablespoon:'tbsp',tablespoons:'tbsp',teaspoon:'tsp',teaspoons:'tsp',gram:'g',grams:'g',pound:'lb',pounds:'lb',lbs:'lb',pieces:'piece',piece:'piece',slices:'slice',slice:'slice',wings:'wing',wing:'wing',corners:'corner',corner:'corner',servings:'serving',serving:'serving'};
  const raw=m[2].toLowerCase();
  return {qty:m[1],unit:map[raw]||raw.replace(/s$/,''),rest:s.slice(m[0].length).trim().replace(/^of\s+/i,'')};
}
function unitOptions(selected){return UNITS.map(u=>`<option value="${u}"${u===selected?' selected':''}>${u}</option>`).join('')}
function addStyles(){if($('portionEditorStyle'))return;const s=document.createElement('style');s.id='portionEditorStyle';s.textContent='.pePortion{display:grid;grid-template-columns:1fr 1.2fr;gap:8px;margin:8px 0}.pePortion label{font-size:11px;color:#9aaac3}.pePortion input,.pePortion select{margin-top:4px}.peHint{font-size:11px;color:#9aaac3;margin:3px 0 8px}.receiptItem{flex-wrap:wrap}.receiptPortion{display:grid;grid-template-columns:1fr 1fr;gap:7px;width:100%;padding:7px 0 2px 34px}.receiptPortion input,.receiptPortion select{padding:8px;font-size:14px}';document.head.appendChild(s)}
function enhanceReview(){
  const box=$('reviewItems');if(!box)return;
  [...box.querySelectorAll('.reviewItem')].forEach(row=>{
    if(row.querySelector('.pePortion'))return;
    const amt=row.querySelector('.rAmt'),name=row.querySelector('.rName');
    let parsed=parseAmount(amt?.value||'');
    if(!parsed.qty&&name){const fromName=parseAmount(name.value);if(fromName.qty){parsed=fromName;name.value=fromName.rest||name.value}}
    const wrap=document.createElement('div');wrap.className='pePortion';
    wrap.innerHTML=`<label>Amount I ate<input class="peQty" inputmode="decimal" placeholder="ex. 3" value="${esc(parsed.qty)}"></label><label>Measurement<select class="peUnit">${unitOptions(parsed.unit||'oz')}</select></label>`;
    const grid=row.querySelector('.macrogrid');row.insertBefore(wrap,grid);
    const hint=document.createElement('div');hint.className='peHint';hint.textContent='Change the amount or measurement and Save will re-analyze the nutrition before logging it.';row.insertBefore(hint,grid);
    row.dataset.peDirty='0';
  });
  const save=$('saveAi');if(save&&$('review')?.classList.contains('open')&&save.textContent!=='Re-analyze & save') save.textContent='Re-analyze & save';
}
function enhanceReceipt(){
  const btn=$('receiptAnalyze');if(!btn)return;
  let items=[];try{items=JSON.parse(btn.dataset.items||'[]')}catch{}
  [...document.querySelectorAll('[data-receipt]')].forEach(cb=>{
    const label=cb.closest('.receiptItem');if(!label||label.querySelector('.receiptPortion'))return;
    const item=items[+cb.dataset.receipt]||{};const p=parseAmount(item.quantity||'');
    const box=document.createElement('div');box.className='receiptPortion';
    box.innerHTML=`<input class="receiptQty" inputmode="decimal" placeholder="How many?" value="${esc(p.qty)}"><select class="receiptUnit">${unitOptions(p.unit||(/wing/i.test(item.name||'')?'wing':/pizza/i.test(item.name||'')?'corner':'piece'))}</select>`;
    label.appendChild(box);
  });
}
function updateReceiptDataset(){
  const btn=$('receiptAnalyze');if(!btn)return;
  let items=[];try{items=JSON.parse(btn.dataset.items||'[]')}catch{return}
  [...document.querySelectorAll('[data-receipt]')].forEach(cb=>{
    const item=items[+cb.dataset.receipt];if(!item)return;
    const label=cb.closest('.receiptItem'),q=label?.querySelector('.receiptQty')?.value.trim(),u=label?.querySelector('.receiptUnit')?.value;
    if(q)item.quantity=`${q} ${u}`;
  });
  btn.dataset.items=JSON.stringify(items);
}
async function analyzeRow(row){
  const name=row.querySelector('.rName')?.value.trim()||'food';
  const qty=row.querySelector('.peQty')?.value.trim();const unit=row.querySelector('.peUnit')?.value;
  const amt=row.querySelector('.rAmt')?.value.trim();
  const portion=qty?`${qty} ${unit}`:(amt||'the logged amount');
  const fd=new FormData();
  fd.append('text',`I actually ate ${portion} of ${name}. Recalculate the calories, protein, carbs and fat for exactly that eaten amount. Treat this as one food item.`);
  const r=await fetch('/api/fuel/analyze',{method:'POST',body:fd});const j=await r.json();if(!r.ok)throw Error(j.error||'Could not re-analyze portion');
  const xs=Array.isArray(j.items)?j.items:[];if(!xs.length)throw Error('No nutrition estimate returned');
  const t=xs.reduce((a,x)=>({cal:a.cal+(+x.calories||0),p:a.p+(+x.protein||0),c:a.c+(+x.carbs||0),f:a.f+(+x.fat||0)}),{cal:0,p:0,c:0,f:0});
  row.querySelector('.rCal').value=Math.round(t.cal*10)/10;row.querySelector('.rPro').value=Math.round(t.p*10)/10;row.querySelector('.rCarb').value=Math.round(t.c*10)/10;row.querySelector('.rFat').value=Math.round(t.f*10)/10;
  if(qty&&row.querySelector('.rAmt'))row.querySelector('.rAmt').value=`${qty} ${unit}`;
  row.dataset.peDirty='0';
}
async function reanalyzeAndSave(btn){
  const rows=[...document.querySelectorAll('#reviewItems .reviewItem')];
  const dirty=rows.filter(r=>r.dataset.peDirty==='1');
  if(!dirty.length){bypassSave=true;btn.click();return}
  btn.disabled=true;btn.textContent=dirty.length>1?'Re-analyzing items…':'Re-analyzing portion…';
  try{for(const row of dirty)await analyzeRow(row);bypassSave=true;btn.disabled=false;btn.textContent='Saving…';btn.click()}catch(e){btn.disabled=false;btn.textContent='Re-analyze & save';const note=$('reviewNote');if(note)note.textContent=e.message||'Could not re-analyze. Try again.'}
}
function observe(){
  const mo=new MutationObserver(()=>{enhanceReview();enhanceReceipt()});mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-items']});
  document.addEventListener('input',e=>{const row=e.target.closest('#reviewItems .reviewItem');if(row&&e.target.matches('input,select'))row.dataset.peDirty='1'});
  document.addEventListener('change',e=>{const row=e.target.closest('#reviewItems .reviewItem');if(row&&e.target.matches('input,select'))row.dataset.peDirty='1'});
  document.addEventListener('click',e=>{
    if(e.target.closest('.portionBtn')){const row=document.querySelector('#reviewItems .reviewItem');if(row)row.dataset.peDirty='1'}
    const receipt=e.target.closest('#receiptAnalyze');if(receipt)updateReceiptDataset();
  },true);
  document.addEventListener('click',e=>{
    const btn=e.target.closest('#saveAi');if(!btn||bypassSave)return;
    const dirty=document.querySelector('#reviewItems .reviewItem[data-pe-dirty="1"]');if(!dirty)return;
    e.preventDefault();e.stopImmediatePropagation();reanalyzeAndSave(btn);
  },true);
  document.addEventListener('click',e=>{if(e.target.closest('#saveAi')&&bypassSave)bypassSave=false});
  enhanceReview();enhanceReceipt();
}
addStyles();document.readyState==='loading'?document.addEventListener('DOMContentLoaded',observe):observe();
})();