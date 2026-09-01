from pathlib import Path

root = Path('fuel-tracker')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# 1) Analyzer keeps useful subcomponents for composite foods.
# ---------------------------------------------------------------------------
p = root / 'src/index.js'
s = p.read_text()
old = """function normalize(data){
  const items=Array.isArray(data?.items)?data.items.slice(0,20).map(item=>({
    name:String(item?.name||'Food').slice(0,100),amount:String(item?.amount||'').slice(0,60),
    calories:Math.round(num(item?.calories,5000)),protein:round1(item?.protein),carbs:round1(item?.carbs),fat:round1(item?.fat),
    confidence:Math.max(0,Math.min(1,Number(item?.confidence)||0.6)),source:String(item?.source||'AI estimate').slice(0,80)
  })):[];
  return {items,note:String(data?.note||'Nutrition is an estimate; review portions before saving.').slice(0,400)};
}
"""
new = """function normalizeItem(item,depth=0){
  if(!item||typeof item!=='object'||depth>2)return null;
  const out={
    name:String(item?.name||'Food').slice(0,100),amount:String(item?.amount||'').slice(0,60),
    calories:Math.round(num(item?.calories,5000)),protein:round1(item?.protein),carbs:round1(item?.carbs),fat:round1(item?.fat),
    confidence:Math.max(0,Math.min(1,Number(item?.confidence)||0.6)),source:String(item?.source||'AI estimate').slice(0,80)
  };
  const components=depth<2&&Array.isArray(item?.components)?item.components.slice(0,16).map(x=>normalizeItem(x,depth+1)).filter(Boolean):[];
  if(components.length)out.components=components;
  return out;
}
function normalize(data){
  const items=Array.isArray(data?.items)?data.items.slice(0,20).map(item=>normalizeItem(item)).filter(Boolean):[];
  return {items,note:String(data?.note||'Nutrition is an estimate; review portions before saving.').slice(0,400)};
}
"""
s = replace_once(s, old, new, 'analyzer normalize')
s = replace_once(
    s,
    "Keep a truly mixed or inseparable dish such as chili, stew, casserole, burrito, or sandwich as one item unless its components are explicitly being logged separately. Include sauces, butter, oils, breading, cheese and cooking fats when mentioned or clearly visible. Do not invent unsupported foods.",
    "Keep a truly mixed or inseparable dish such as chili, stew, casserole, burrito, burger, or sandwich as one top-level item. For a composite food whose parts are known from the user or a well-known menu build, also include an optional components array with nutritionally meaningful parts such as bun, meat patties, cheese, bacon, mayonnaise, ketchup, pickles, sauce, butter, oil, or breading. Component macros should add approximately to the parent item's macros; the parent total remains authoritative. This breakdown is for later editing and substitution decisions. Do not invent unsupported components.",
    'analyzer component guidance',
)
s = replace_once(
    s,
    '{"items":[{"name":"food","amount":"natural amount such as 12 oz, 3 ribs, or 10 shrimp","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0,"source":"official/known data or AI estimate"}],"note":"short uncertainty note"}',
    '{"items":[{"name":"food","amount":"natural amount such as 12 oz, 3 ribs, or 1 sandwich","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0,"source":"official/known data or AI estimate","components":[{"name":"bun or mayo or cheese","amount":"1 bun or 1 tbsp or 2 slices","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0,"source":"component estimate"}]}],"note":"short uncertainty note"}',
    'analyzer json schema',
)
p.write_text(s)

# ---------------------------------------------------------------------------
# 2) Coach can preserve the same nested breakdown.
# ---------------------------------------------------------------------------
p = root / 'src/fuel-coach-api.js'
s = p.read_text()
s = replace_once(
    s,
    "A truly mixed or inseparable dish can remain one object. For example, three St. Louis ribs with no sauce should remain 3 ribs, not be converted to an arbitrary ounce count.",
    "A truly mixed or inseparable dish can remain one top-level object. For a composite food whose build is known, optionally include components such as bun, patties, cheese, bacon, mayonnaise, ketchup, pickles, sauce, butter, or oil so Fuel can show a useful edit breakdown later. Component macros should approximately add to the parent total, while the parent total remains authoritative. For example, three St. Louis ribs with no sauce should remain 3 ribs, not be converted to an arbitrary ounce count.",
    'coach system component guidance',
)
old = "function normalizeFood(raw){if(!raw||typeof raw!=='object')return null;const name=String(raw.name||'').trim().slice(0,120),amount=String(raw.amount||'').trim().slice(0,80);const calories=Number(raw.calories),protein=Number(raw.protein),carbs=Number(raw.carbs),fat=Number(raw.fat);if(!name||!amount||![calories,protein,carbs,fat].every(Number.isFinite))return null;return {name,amount,calories:Math.max(0,Math.round(calories)),protein:Math.max(0,Math.round(protein*10)/10),carbs:Math.max(0,Math.round(carbs*10)/10),fat:Math.max(0,Math.round(fat*10)/10),confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0.65))}}"
new = "function normalizeFood(raw,depth=0){if(!raw||typeof raw!=='object'||depth>2)return null;const name=String(raw.name||'').trim().slice(0,120),amount=String(raw.amount||'').trim().slice(0,80);const calories=Number(raw.calories),protein=Number(raw.protein),carbs=Number(raw.carbs),fat=Number(raw.fat);if(!name||!amount||![calories,protein,carbs,fat].every(Number.isFinite))return null;const out={name,amount,calories:Math.max(0,Math.round(calories)),protein:Math.max(0,Math.round(protein*10)/10),carbs:Math.max(0,Math.round(carbs*10)/10),fat:Math.max(0,Math.round(fat*10)/10),confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0.65))};const components=depth<2&&Array.isArray(raw.components)?raw.components.map(x=>normalizeFood(x,depth+1)).filter(Boolean).slice(0,16):[];if(components.length)out.components=components;return out}"
s = replace_once(s, old, new, 'coach normalize food')
s = replace_once(
    s,
    "For meat with unknown weight, use exactly 1 oz as the reference. If you return one or more foods, end the answer naturally with \"Want me to log that?\" Return ONLY JSON in this shape: {\"answer\":\"natural conversational answer\",\"foods\":[] OR [{\"name\":\"food name\",\"amount\":\"12 oz or 3 ribs or 10 shrimp\",\"calories\":0,\"protein\":0,\"carbs\":0,\"fat\":0,\"confidence\":0.0}]}. User question: ${question||'No question supplied.'}`;",
    "For meat with unknown weight, use exactly 1 oz as the reference. For a composite restaurant or assembled food, keep it as one top-level food but include a components array when its build is known so the user can later see things like bun, patties, cheese, bacon, mayonnaise, ketchup, and pickles separately. If you return one or more foods, end the answer naturally with \"Want me to log that?\" Return ONLY JSON in this shape: {\"answer\":\"natural conversational answer\",\"foods\":[] OR [{\"name\":\"food name\",\"amount\":\"12 oz or 3 ribs or 1 sandwich\",\"calories\":0,\"protein\":0,\"carbs\":0,\"fat\":0,\"confidence\":0.0,\"components\":[{\"name\":\"bun or mayo or cheese\",\"amount\":\"1 bun or 1 tbsp or 2 slices\",\"calories\":0,\"protein\":0,\"carbs\":0,\"fat\":0,\"confidence\":0.0}]}]}. User question: ${question||'No question supplied.'}`;",
    'coach json schema',
)
s = s.replace('max_output_tokens:notification?180:650', 'max_output_tokens:notification?180:900')
p.write_text(s)

# ---------------------------------------------------------------------------
# 3) Client stores either individual foods or one meal with a durable breakdown.
# ---------------------------------------------------------------------------
p = root / 'public/app.js'
s = p.read_text()
add_meal = "function addMeal(o){const a=meals();o.id=Date.now()+Math.floor(Math.random()*1000);o.time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});a.push(o);setMeals(a);render();showPage('home')}"
helpers = r'''
function copyRows(rows=[]){return (Array.isArray(rows)?rows:[]).map(x=>({...x,components:Array.isArray(x?.components)?copyRows(x.components):[]}))}
function rowTotals(rows=[]){return (Array.isArray(rows)?rows:[]).reduce((a,x)=>({cal:a.cal+(+x.calories||+x.cal||0),p:a.p+(+x.protein||+x.p||0),c:a.c+(+x.carbs||+x.c||0),f:a.f+(+x.fat||+x.f||0)}),{cal:0,p:0,c:0,f:0})}
function mealTitle(rows=[]){const names=(Array.isArray(rows)?rows:[]).map(x=>String(x?.name||'').trim()).filter(Boolean);if(!names.length)return 'Meal';return names.length<=3?names.join(' + '):names.slice(0,3).join(' + ')+` + ${names.length-3} more`}
function flattenBreakdown(rows=[]){const out=[];const walk=(x,parent='')=>{if(!x||typeof x!=='object')return;const kids=Array.isArray(x.components)?x.components:[];if(kids.length){kids.forEach(k=>walk(k,String(x.name||parent||'').trim()));return}out.push({...x,name:parent?`${parent} — ${String(x.name||'Part').trim()}`:String(x.name||'Part').trim(),components:[]})};(Array.isArray(rows)?rows:[]).forEach(x=>walk(x));return out.length?out:copyRows(rows)}
function addMealGroup(rows,source='AI/review',title=''){const items=copyRows(rows),t=rowTotals(items),a=meals();a.push({id:Date.now()+Math.floor(Math.random()*1000),time:new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),name:title||mealTitle(items),cal:t.cal,p:t.p,c:t.c,f:t.f,source,kind:'meal',components:items});setMeals(a);render();showPage('home');return true}
function ensureLogModeChooser(){let box=$('logModeChooser');if(box)return box;box=document.createElement('div');box.id='logModeChooser';box.style.cssText='display:none;margin:14px 0;padding:12px;border:1px solid #35517c;border-radius:14px;background:#0b1629';box.innerHTML='<div style="font-weight:800;margin-bottom:9px">How should this appear on Today?</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" class="secondary" data-logmode="individual">Log individually</button><button type="button" class="secondary" data-logmode="meal">Log as meal</button></div><div class="muted" style="font-size:12px;margin-top:8px">A meal stays one line, but Edit keeps the full breakdown.</div>';$('saveAi').parentNode.insertBefore(box,$('saveAi'));box.querySelectorAll('[data-logmode]').forEach(btn=>btn.addEventListener('click',()=>{if(!draft)return;draft.logMode=btn.dataset.logmode;syncLogModeChooser()}));return box}
function syncLogModeChooser(){const box=ensureLogModeChooser(),show=!draft?.editingMealId&&Array.isArray(draft?.items)&&draft.items.length>1;box.style.display=show?'block':'none';box.querySelectorAll('[data-logmode]').forEach(btn=>{const active=(draft?.logMode||'individual')===btn.dataset.logmode;btn.setAttribute('aria-pressed',active?'true':'false');btn.style.opacity=active?'1':'.58';btn.style.outline=active?'2px solid #79c7ff':'none'});if(!draft?.editingMealId)$('saveAi').textContent=show?((draft?.logMode||'individual')==='meal'?'Log as meal':'Log individually'):'Save food'}
'''
s = replace_once(s, add_meal, add_meal + helpers, 'app meal helpers')
old = "function addFoods(rows,source='AI/review'){if(!Array.isArray(rows)||!rows.length)return false;const a=meals(),stamp=Date.now(),time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});let added=0;rows.forEach((row,i)=>{if(!row||typeof row!=='object')return;const name=String(row.name||'').trim(),amount=String(row.amount||'').trim();const cal=Number(row.calories??row.cal),p=Number(row.protein??row.p),c=Number(row.carbs??row.c),f=Number(row.fat??row.f);if(!name||![cal,p,c,f].every(Number.isFinite))return;a.push({id:stamp+i+Math.floor(Math.random()*1000),time,name:amount?`${amount} ${name}`:name,cal,p,c,f,source});added++});if(!added)return false;setMeals(a);render();showPage('home');return true}"
new = "function addFoods(rows,source='AI/review'){if(!Array.isArray(rows)||!rows.length)return false;const a=meals(),stamp=Date.now(),time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});let added=0;rows.forEach((row,i)=>{if(!row||typeof row!=='object')return;const name=String(row.name||'').trim(),amount=String(row.amount||'').trim();const cal=Number(row.calories??row.cal),p=Number(row.protein??row.p),c=Number(row.carbs??row.c),f=Number(row.fat??row.f);if(!name||![cal,p,c,f].every(Number.isFinite))return;a.push({id:stamp+i+Math.floor(Math.random()*1000),time,name:amount?`${amount} ${name}`:name,cal,p,c,f,source,kind:'food',components:Array.isArray(row.components)?copyRows(row.components):[]});added++});if(!added)return false;setMeals(a);render();showPage('home');return true}"
s = replace_once(s, old, new, 'app add foods components')
s = replace_once(
    s,
    "window.FuelAddCoachFood=function(food){return window.FuelAddCoachFoods([food])};",
    "window.FuelAddCoachFood=function(food){return window.FuelAddCoachFoods([food])};\nwindow.FuelReviewCoachFoods=function(foods){const items=copyRows(Array.isArray(foods)?foods:[]);if(!items.length)return false;openReview({items,source:'Fuel Coach',logMode:'individual',note:'Choose Log individually or Log as meal. A meal keeps its full breakdown for Edit.'});return true};",
    'coach review bridge',
)
s = replace_once(
    s,
    "${esc(x.time||'')} · ${esc(x.source||'logged')} · <button",
    "${esc(x.time||'')} · ${esc(x.source||'logged')}${x.kind==='meal'?' · meal':''} · <button",
    'render meal label',
)
old = "function editMeal(id){const x=meals().find(m=>String(m.id)===String(id));if(!x)return;openReview({editingMealId:x.id,source:x.source||'edited',baseMacros:{cal:+x.cal||0,p:+x.p||0,c:+x.c||0,f:+x.f||0},items:[{name:x.name,amount:'',calories:+x.cal||0,protein:+x.p||0,carbs:+x.c||0,fat:+x.f||0}],note:'Edit the food or tap a portion button. Example: tap ½ if you only ate half.'})}"
new = "function editMeal(id){const x=meals().find(m=>String(m.id)===String(id));if(!x)return;const hasBreakdown=Array.isArray(x.components)&&x.components.length>0,items=hasBreakdown?flattenBreakdown(copyRows(x.components)):[{name:x.name,amount:'',calories:+x.cal||0,protein:+x.p||0,carbs:+x.c||0,fat:+x.f||0}];openReview({editingMealId:x.id,editingGroup:hasBreakdown,originalName:x.name,source:x.source||'edited',baseMacros:hasBreakdown?null:{cal:+x.cal||0,p:+x.p||0,c:+x.c||0,f:+x.f||0},items,note:hasBreakdown?'This is the stored breakdown. The total updates from these parts when you save.':'Edit the food or tap a portion button. Example: tap ½ if you only ate half.'})}"
s = replace_once(s, old, new, 'edit breakdown')
old = "function openReview(data){draft=data;if(!draft||!Array.isArray(draft.items)||!draft.items.length)return;$('reviewItems').innerHTML=draft.items.map(x=>`<div class=\"reviewItem\"><input class=\"rName\" value=\"${esc(x.name||'Food')}\"><input class=\"rAmt\" value=\"${esc(x.amount||'')}\" placeholder=\"Amount\"><div class=\"macrogrid\"><label>Cal<input class=\"rCal\" type=\"number\" value=\"${x.calories||0}\"></label><label>Protein<input class=\"rPro\" type=\"number\" value=\"${x.protein||0}\"></label><label>Carbs<input class=\"rCarb\" type=\"number\" value=\"${x.carbs||0}\"></label><label>Fat<input class=\"rFat\" type=\"number\" value=\"${x.fat||0}\"></label></div></div>`).join('');$('reviewNote').textContent=draft.note||'Review the estimate before saving.';const bar=ensurePortionBar();bar.style.display=draft.editingMealId?'block':'none';$('saveAi').textContent=draft.editingMealId?'Save changes':(draft.items.length>1?'Save foods':'Save food');updateReviewTotals();$('review').classList.add('open')}"
new = "function openReview(data){draft=data;if(!draft||!Array.isArray(draft.items)||!draft.items.length)return;draft.logMode=draft.logMode||'individual';$('reviewItems').innerHTML=draft.items.map(x=>`<div class=\"reviewItem\"><input class=\"rName\" value=\"${esc(x.name||'Food')}\"><input class=\"rAmt\" value=\"${esc(x.amount||'')}\" placeholder=\"Amount\"><div class=\"macrogrid\"><label>Cal<input class=\"rCal\" type=\"number\" value=\"${x.calories||0}\"></label><label>Protein<input class=\"rPro\" type=\"number\" value=\"${x.protein||0}\"></label><label>Carbs<input class=\"rCarb\" type=\"number\" value=\"${x.carbs||0}\"></label><label>Fat<input class=\"rFat\" type=\"number\" value=\"${x.fat||0}\"></label></div></div>`).join('');$('reviewNote').textContent=draft.note||'Review the estimate before saving.';const bar=ensurePortionBar();bar.style.display=draft.editingMealId&&!draft.editingGroup?'block':'none';$('saveAi').textContent=draft.editingMealId?'Save changes':'Save food';syncLogModeChooser();updateReviewTotals();$('review').classList.add('open')}"
s = replace_once(s, old, new, 'open review meal mode')
old = "function readReview(){return [...document.querySelectorAll('.reviewItem')].map(row=>({name:row.querySelector('.rName').value.trim()||'Food',amount:row.querySelector('.rAmt').value.trim(),calories:+row.querySelector('.rCal').value||0,protein:+row.querySelector('.rPro').value||0,carbs:+row.querySelector('.rCarb').value||0,fat:+row.querySelector('.rFat').value||0}))}"
new = "function readReview(){return [...document.querySelectorAll('.reviewItem')].map((row,i)=>({name:row.querySelector('.rName').value.trim()||'Food',amount:row.querySelector('.rAmt').value.trim(),calories:+row.querySelector('.rCal').value||0,protein:+row.querySelector('.rPro').value||0,carbs:+row.querySelector('.rCarb').value||0,fat:+row.querySelector('.rFat').value||0,components:Array.isArray(draft?.items?.[i]?.components)?copyRows(draft.items[i].components):[]}))}"
s = replace_once(s, old, new, 'read review components')
old = "function saveReview(){const items=readReview();if(draft?.editingMealId){const x=items[0];if(x){const a=meals(),i=a.findIndex(m=>String(m.id)===String(draft.editingMealId));if(i>=0){a[i]={...a[i],name:x.amount?`${x.amount} ${x.name}`:x.name,cal:x.calories,p:x.protein,c:x.carbs,f:x.fat};setMeals(a);render();showPage('home')}}}else addFoods(items,draft?.source||'AI/review');$('review').classList.remove('open');$('saveAi').textContent='Save food';if($('foodText'))$('foodText').value='';if($('photo'))$('photo').value='';draft=null}"
new = "function saveReview(){const items=readReview();if(draft?.editingMealId){const a=meals(),i=a.findIndex(m=>String(m.id)===String(draft.editingMealId));if(i>=0){if(draft.editingGroup){const t=rowTotals(items);a[i]={...a[i],name:draft.originalName||a[i].name,cal:t.cal,p:t.p,c:t.c,f:t.f,components:copyRows(items)}}else{const x=items[0];if(x)a[i]={...a[i],name:x.amount?`${x.amount} ${x.name}`:x.name,cal:x.calories,p:x.protein,c:x.carbs,f:x.fat}}setMeals(a);render();showPage('home')}}else if((draft?.logMode||'individual')==='meal')addMealGroup(items,draft?.source||'AI/review',draft?.mealName||'');else addFoods(items,draft?.source||'AI/review');$('review').classList.remove('open');$('saveAi').textContent='Save food';if($('foodText'))$('foodText').value='';if($('photo'))$('photo').value='';draft=null}"
s = replace_once(s, old, new, 'save review meal mode')
p.write_text(s)

# ---------------------------------------------------------------------------
# 4) Coach's "add it" opens the review choice when several foods are pending.
# ---------------------------------------------------------------------------
p = root / 'public/fuel-coach.js'
s = p.read_text()
old = "function addPending(question='add it'){const p=pendingFoods(),foods=p?.foods||[];if(!foods.length||typeof window.FuelAddCoachFoods!=='function'){setState('There is no food waiting to be logged.');return false}const ok=window.FuelAddCoachFoods(foods);if(!ok){setState('I could not add that food yet.');return false}const description=foods.length===1?`${foods[0].amount} ${foods[0].name}`:`${foods.length} foods separately`;const answer=`Logged ${description}.`;saveHistory(question,answer,'question');setPendingFoods([]);renderPendingAction();$('fuelCoachModal')?.classList.remove('open');setState(answer);window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:answer}}));return true}"
new = "function addPending(question='add it'){const p=pendingFoods(),foods=p?.foods||[];if(!foods.length||typeof window.FuelAddCoachFoods!=='function'){setState('There is no food waiting to be logged.');return false}if(foods.length>1&&typeof window.FuelReviewCoachFoods==='function'){const ok=window.FuelReviewCoachFoods(foods);if(!ok){setState('I could not open that food review yet.');return false}const answer=`Ready to review ${foods.length} foods. Choose Log individually or Log as meal.`;saveHistory(question,answer,'question');setPendingFoods([]);renderPendingAction();$('fuelCoachModal')?.classList.remove('open');setState(answer);return true}const ok=window.FuelAddCoachFoods(foods);if(!ok){setState('I could not add that food yet.');return false}const description=`${foods[0].amount} ${foods[0].name}`;const answer=`Logged ${description}.`;saveHistory(question,answer,'question');setPendingFoods([]);renderPendingAction();$('fuelCoachModal')?.classList.remove('open');setState(answer);window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:answer}}));return true}"
s = replace_once(s, old, new, 'coach review choice')
p.write_text(s)

# ---------------------------------------------------------------------------
# 5) Cache bust and tests.
# ---------------------------------------------------------------------------
p = root / 'public/index.html'
s = p.read_text()
s = replace_once(s, '/app.js?v=4', '/app.js?v=5', 'app cache bust')
p.write_text(s)

p = root / 'src/index-wrapper.js'
s = p.read_text()
s = replace_once(s, '/fuel-coach.js?v=6', '/fuel-coach.js?v=7', 'coach cache bust')
p.write_text(s)

p = root / 'tests/meal-mode.test.mjs'
p.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const analyzer=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const coachApi=await readFile(new URL('../src/fuel-coach-api.js',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const coach=await readFile(new URL('../public/fuel-coach.js',import.meta.url),'utf8');
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const wrapper=await readFile(new URL('../src/index-wrapper.js',import.meta.url),'utf8');

test('multi-food review offers individual or one-meal logging',()=>{
  assert.match(app,/Log individually/);
  assert.match(app,/Log as meal/);
  assert.match(app,/function addMealGroup/);
  assert.match(app,/kind:'meal'/);
  assert.match(app,/A meal keeps its full breakdown/);
});

test('saved meals and composite foods retain editable components',()=>{
  assert.match(app,/components:items/);
  assert.match(app,/function flattenBreakdown/);
  assert.match(app,/editingGroup/);
  assert.match(app,/This is the stored breakdown/);
  assert.match(app,/FuelReviewCoachFoods/);
});

test('analyzer and coach preserve composite-food component detail',()=>{
  assert.match(analyzer,/optional components array/);
  assert.match(analyzer,/parent total remains authoritative/);
  assert.match(analyzer,/function normalizeItem/);
  assert.match(coachApi,/components array/);
  assert.match(coachApi,/raw\.components/);
});

test('Coach multi-food add goes through the logging choice',()=>{
  assert.match(coach,/FuelReviewCoachFoods/);
  assert.match(coach,/Choose Log individually or Log as meal/);
});

test('meal-mode scripts are cache busted',()=>{
  assert.match(html,/app\.js\?v=5/);
  assert.match(wrapper,/fuel-coach\.js\?v=7/);
});
""")

print('Fuel meal mode upgrade patched successfully')
