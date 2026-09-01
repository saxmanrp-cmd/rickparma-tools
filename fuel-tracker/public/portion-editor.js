(()=>{
'use strict';
const $=id=>document.getElementById(id);
const UNITS=['oz','g','lb','cup','tbsp','tsp','piece','slice','wing','corner','serving'];
const WEIGHT_TO_G={oz:28.349523125,g:1,lb:453.59237};
const VOLUME_TO_TSP={cup:48,tbsp:3,tsp:1};
const UNIT_MAP={ounce:'oz',ounces:'oz',oz:'oz',gram:'g',grams:'g',g:'g',pound:'lb',pounds:'lb',lb:'lb',lbs:'lb',cup:'cup',cups:'cup',tablespoon:'tbsp',tablespoons:'tbsp',tbsp:'tbsp',teaspoon:'tsp',teaspoons:'tsp',tsp:'tsp',piece:'piece',pieces:'piece',slice:'slice',slices:'slice',wing:'wing',wings:'wing',corner:'corner',corners:'corner',serving:'serving',servings:'serving',portion:'serving',portions:'serving'};
const UNIT_WORDS='oz|ounces?|g|grams?|lbs?|pounds?|cups?|tbsp|tablespoons?|tsp|teaspoons?|pieces?|slices?|wings?|corners?|servings?|portions?';
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function numberValue(v){const s=String(v??'').trim();if(/^\d+\/\d+$/.test(s)){const [a,b]=s.split('/').map(Number);return b?a/b:NaN}const n=Number(s);return Number.isFinite(n)?n:NaN}
function unit(v){return UNIT_MAP[String(v||'').toLowerCase()]||String(v||'').toLowerCase()}
function fmt(n,d=2){if(!Number.isFinite(n))return '';const r=Math.round(n*10**d)/10**d;return String(Number(r.toFixed(d)))}
function macro(n){return Math.round((Number(n)||0)*10)/10}
function parseServing(text=''){
  const s=String(text).trim();if(!s)return null;
  const par=new RegExp(`\\(\\s*([0-9]+(?:\\.[0-9]+)?|\\d+\\/\\d+)\\s*(${UNIT_WORDS})\\s*\\)`,'i').exec(s);
  if(par){
    const before=s.slice(0,par.index).trim(),after=s.slice(par.index+par[0].length).trim();
    if(!before||/^(?:[0-9]+(?:\.[0-9]+)?|\d+\/\d+)?\s*(?:portion|serving)s?$/i.test(before))return {qty:numberValue(par[1]),unit:unit(par[2]),rest:after,raw:s};
  }
  const direct=new RegExp(`^\\s*([0-9]+(?:\\.[0-9]+)?|\\d+\\/\\d+)\\s*(${UNIT_WORDS})\\b\\s*(.*)$`,'i').exec(s);
  if(direct)return {qty:numberValue(direct[1]),unit:unit(direct[2]),rest:direct[3].trim().replace(/^of\s+/i,''),raw:s};
  return null;
}
function family(u){if(u in WEIGHT_TO_G)return 'weight';if(u in VOLUME_TO_TSP)return 'volume';if(['piece','slice','wing','corner'].includes(u))return 'count';if(u==='serving')return 'serving';return 'other'}
function compatibleUnits(base){const f=family(base);if(f==='weight')return ['oz','g','lb','serving'];if(f==='volume')return ['cup','tbsp','tsp','serving'];if(f==='count')return [base,'serving'];return ['serving']}
function snapServing(n,u){if(!Number.isFinite(n)||n<=0)return n;if(u==='g')return Math.round(n*10)/10;const common=[0.125,0.25,0.333,0.5,0.75,1,1.5,2,2.5,3,4,5,6,8,10,12,16];let best=n,delta=Infinity;for(const c of common){const d=Math.abs(n-c)/Math.max(c,.001);if(d<delta){delta=d;best=c}}return delta<=0.02?best:Math.round(n*100)/100}
function convert(n,from,to){if(from===to)return n;const f=family(from);if(f!==family(to))return NaN;if(f==='weight')return n*WEIGHT_TO_G[from]/WEIGHT_TO_G[to];if(f==='volume')return n*VOLUME_TO_TSP[from]/VOLUME_TO_TSP[to];return NaN}
function servingQtyIn(state,targetUnit){if(targetUnit==='serving')return 1;if(targetUnit===state.base.unit)return state.base.qty;const n=convert(state.base.qty,state.base.unit,targetUnit);return snapServing(n,targetUnit)}
function preferredUnit(base){if(family(base)==='weight')return 'oz';return base}
function getMacros(row){return {cal:+row.querySelector('.rCal')?.value||0,p:+row.querySelector('.rPro')?.value||0,c:+row.querySelector('.rCarb')?.value||0,f:+row.querySelector('.rFat')?.value||0}}
function setMacros(row,m){row.querySelector('.rCal').value=macro(m.cal);row.querySelector('.rPro').value=macro(m.p);row.querySelector('.rCarb').value=macro(m.c);row.querySelector('.rFat').value=macro(m.f)}
function updateTotals(){const rows=[...document.querySelectorAll('#reviewItems .reviewItem')];const t=rows.reduce((a,row)=>{const m=getMacros(row);a.cal+=m.cal;a.p+=m.p;a.c+=m.c;a.f+=m.f;return a},{cal:0,p:0,c:0,f:0});const el=$('reviewTotals');if(el)el.textContent=`${Math.round(t.cal)} cal · ${Math.round(t.p)}P · ${Math.round(t.c)}C · ${Math.round(t.f)}F`}
function optionHtml(units,selected){return units.map(u=>`<option value="${u}"${u===selected?' selected':''}>${u}</option>`).join('')}
function addStyles(){if($('portionEditorStyle'))return;const s=document.createElement('style');s.id='portionEditorStyle';s.textContent='#portionBar{display:none!important}.reviewItem>.rAmt{display:none!important}.peSimple{margin:10px 0 4px}.peServing{background:#0c1628;border:1px solid #2a3b5d;border-radius:14px;padding:11px 12px;color:#dce9ff;font-size:13px;line-height:1.35}.peQuestion{display:block;font-size:14px;font-weight:800;color:#f7fbff;margin:12px 0 6px}.pePortion{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pePortion input,.pePortion select{font-size:21px;font-weight:800;padding:13px}.peResult{margin:9px 0 2px;font-size:14px;font-weight:800;color:#9fd6ff}.peError{color:#ffb1bb}.receiptItem{flex-wrap:wrap}.receiptPortion{display:grid;grid-template-columns:1fr 1fr;gap:7px;width:100%;padding:7px 0 2px 34px}.receiptPortion input,.receiptPortion select{padding:8px;font-size:14px}';document.head.appendChild(s)}
function buildState(row){
  const amt=row.querySelector('.rAmt'),name=row.querySelector('.rName');
  let parsed=parseServing(amt?.value||''),fromName=false;
  if(!parsed&&name){parsed=parseServing(name.value);fromName=!!parsed}
  if(!parsed||!Number.isFinite(parsed.qty)||parsed.qty<=0)return null;
  if(fromName&&parsed.rest)name.value=parsed.rest;
  const base={qty:parsed.qty,unit:parsed.unit,macros:getMacros(row),raw:parsed.raw};
  const displayUnit=preferredUnit(base.unit),displayQty=servingQtyIn({base},displayUnit);
  return {base,displayUnit,displayQty:Number.isFinite(displayQty)&&displayQty>0?displayQty:base.qty,originalLabel:parsed.raw};
}
function servingLabel(state){const b=state.base,du=state.displayUnit,dq=state.displayQty;const primary=`${fmt(dq)} ${du}`;const original=`${fmt(b.qty)} ${b.unit}`;return primary===original?primary:`${primary} (${original})`}
function recalcRow(row){
  const state=row._peState;if(!state)return false;
  const q=numberValue(row.querySelector('.peQty')?.value),u=row.querySelector('.peUnit')?.value;if(!Number.isFinite(q)||q<=0)return false;
  const one=servingQtyIn(state,u);if(!Number.isFinite(one)||one<=0)return false;
  const ratio=q/one,m=state.base.macros;
  const next={cal:m.cal*ratio,p:m.p*ratio,c:m.c*ratio,f:m.f*ratio};setMacros(row,next);
  const amt=row.querySelector('.rAmt');if(amt)amt.value=`${fmt(q)} ${u}`;
  const out=row.querySelector('.peResult');if(out){out.classList.remove('peError');const unitText=u==='serving'?`serving${Math.abs(q-1)<.0001?'':'s'}`:u;out.textContent=`${fmt(q)} ${unitText} = ${fmt(ratio)} serving${Math.abs(ratio-1)<.0001?'':'s'} → ${Math.round(next.cal)} cal · ${fmt(macro(next.p),1)}P · ${fmt(macro(next.c),1)}C · ${fmt(macro(next.f),1)}F`}
  row.dataset.peDirty='0';updateTotals();return true;
}
function enhanceReview(){
  const box=$('reviewItems');if(!box)return;const bar=$('portionBar');if(bar)bar.style.display='none';
  [...box.querySelectorAll('.reviewItem')].forEach(row=>{
    if(row.querySelector('.peSimple'))return;
    const state=buildState(row);if(!state)return;row._peState=state;
    row.dataset.peBase=JSON.stringify({qty:state.base.qty,unit:state.base.unit,cal:state.base.macros.cal,p:state.base.macros.p,c:state.base.macros.c,f:state.base.macros.f});
    const wrap=document.createElement('div');wrap.className='peSimple';
    const units=compatibleUnits(state.base.unit);if(!units.includes(state.displayUnit))state.displayUnit=units[0];state.displayQty=servingQtyIn(state,state.displayUnit);
    wrap.innerHTML=`<div class="peServing">Label serving: <b>${esc(servingLabel(state))}</b> · <b>${Math.round(state.base.macros.cal)} cal</b> · ${fmt(macro(state.base.macros.p),1)}P · ${fmt(macro(state.base.macros.c),1)}C · ${fmt(macro(state.base.macros.f),1)}F</div><label class="peQuestion">How much did you eat?</label><div class="pePortion"><input class="peQty" inputmode="decimal" value="${esc(fmt(state.displayQty))}" aria-label="Amount eaten"><select class="peUnit" aria-label="Measurement">${optionHtml(units,state.displayUnit)}</select></div><div class="peResult"></div>`;
    const grid=row.querySelector('.macrogrid');row.insertBefore(wrap,grid);
    const amt=row.querySelector('.rAmt');if(amt)amt.value=`${fmt(state.displayQty)} ${state.displayUnit}`;
    recalcRow(row);
  });
}
function enhanceReceipt(){
  const btn=$('receiptAnalyze');if(!btn)return;let items=[];try{items=JSON.parse(btn.dataset.items||'[]')}catch{}
  [...document.querySelectorAll('[data-receipt]')].forEach(cb=>{
    const label=cb.closest('.receiptItem');if(!label||label.querySelector('.receiptPortion'))return;
    const item=items[+cb.dataset.receipt]||{},p=parseServing(item.quantity||'');const base=p?.unit||(/wing/i.test(item.name||'')?'wing':/pizza/i.test(item.name||'')?'corner':'piece'),units=compatibleUnits(base);
    const box=document.createElement('div');box.className='receiptPortion';box.innerHTML=`<input class="receiptQty" inputmode="decimal" placeholder="How many?" value="${esc(p?.qty?fmt(p.qty):'')}"><select class="receiptUnit">${optionHtml(units,p?.unit||base)}</select>`;label.appendChild(box);
  })
}
function updateReceiptDataset(){const btn=$('receiptAnalyze');if(!btn)return;let items=[];try{items=JSON.parse(btn.dataset.items||'[]')}catch{return}[...document.querySelectorAll('[data-receipt]')].forEach(cb=>{const item=items[+cb.dataset.receipt];if(!item)return;const label=cb.closest('.receiptItem'),q=label?.querySelector('.receiptQty')?.value.trim(),u=label?.querySelector('.receiptUnit')?.value;if(q)item.quantity=`${q} ${u}`});btn.dataset.items=JSON.stringify(items)}
function observe(){
  const mo=new MutationObserver(()=>{enhanceReview();enhanceReceipt()});mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-items']});
  document.addEventListener('input',e=>{const row=e.target.closest('#reviewItems .reviewItem');if(row&&e.target.matches('.peQty'))recalcRow(row)});
  document.addEventListener('change',e=>{const row=e.target.closest('#reviewItems .reviewItem');if(row&&e.target.matches('.peQty,.peUnit'))recalcRow(row);const receipt=e.target.closest('#receiptAnalyze');if(receipt)updateReceiptDataset()});
  document.addEventListener('click',e=>{const receipt=e.target.closest('#receiptAnalyze');if(receipt)updateReceiptDataset()},true);
  enhanceReview();enhanceReceipt();
}
addStyles();document.readyState==='loading'?document.addEventListener('DOMContentLoaded',observe):observe();
})();
