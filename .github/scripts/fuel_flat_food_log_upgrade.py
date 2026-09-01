from pathlib import Path
import re

root = Path('fuel-tracker')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    return text.replace(old, new, 1)

def sub_once(text, pattern, repl, label, flags=0):
    out, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f'{label} marker count={n}')
    return out

# 1) Food analyzer: distinct foods must be distinct items.
p = root/'src/index.js'
s = p.read_text()
needle = 'Every item MUST have a non-empty amount and its calories/macros MUST correspond to that amount. Include sauces, butter, oils, breading, cheese and cooking fats when mentioned or clearly visible.'
replacement = 'Every item MUST have a non-empty amount and its calories/macros MUST correspond to that amount. If the user describes multiple distinct foods (for example 4 oz ribeye and 6 oz grilled chicken thighs), return them as separate item objects with separate amounts and separate macros. Do not combine distinct foods into one item. Keep a truly mixed or inseparable dish such as chili, stew, casserole, burrito, or sandwich as one item unless its components are explicitly being logged separately. Include sauces, butter, oils, breading, cheese and cooking fats when mentioned or clearly visible.'
s = replace_once(s, needle, replacement, 'analyzer flat item rule')
p.write_text(s)

# 2) App: batch-save each review item as its own Today entry and expose a multi-food Coach bridge.
p = root/'public/app.js'
s = p.read_text()
old_bridge = "function addMeal(o){const a=meals();o.id=Date.now()+Math.floor(Math.random()*1000);o.time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});a.push(o);setMeals(a);render();showPage('home')}\nwindow.FuelAddCoachFood=function(food){if(!food||typeof food!=='object')return false;const name=String(food.name||'').trim(),amount=String(food.amount||'').trim();if(!name||!amount)return false;const nums=['calories','protein','carbs','fat'].map(k=>Number(food[k]));if(!nums.every(Number.isFinite))return false;addMeal({name:`${amount} · ${name}`,cal:nums[0],p:nums[1],c:nums[2],f:nums[3],source:'Fuel Coach'});return true};"
new_bridge = """function addMeal(o){const a=meals();o.id=Date.now()+Math.floor(Math.random()*1000);o.time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});a.push(o);setMeals(a);render();showPage('home')}
function addFoods(rows,source='AI/review'){if(!Array.isArray(rows)||!rows.length)return false;const a=meals(),stamp=Date.now(),time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});let added=0;rows.forEach((row,i)=>{if(!row||typeof row!=='object')return;const name=String(row.name||'').trim(),amount=String(row.amount||'').trim();const cal=Number(row.calories??row.cal),p=Number(row.protein??row.p),c=Number(row.carbs??row.c),f=Number(row.fat??row.f);if(!name||![cal,p,c,f].every(Number.isFinite))return;a.push({id:stamp+i+Math.floor(Math.random()*1000),time,name:amount?`${amount} ${name}`:name,cal,p,c,f,source});added++});if(!added)return false;setMeals(a);render();showPage('home');return true}
window.FuelAddCoachFoods=function(foods){return addFoods(Array.isArray(foods)?foods:[], 'Fuel Coach')};
window.FuelAddCoachFood=function(food){return window.FuelAddCoachFoods([food])};"""
s = replace_once(s, old_bridge, new_bridge, 'app multi food bridge')
old_open = "$('saveAi').textContent=draft.editingMealId?'Save changes':'Save meal';"
new_open = "$('saveAi').textContent=draft.editingMealId?'Save changes':(draft.items.length>1?'Save foods':'Save food');"
s = replace_once(s, old_open, new_open, 'review save label')
pattern = r"function saveReview\(\)\{.*?\}\nasync function requestAnalysis"
new_save = """function saveReview(){const items=readReview();if(draft?.editingMealId){const x=items[0];if(x){const a=meals(),i=a.findIndex(m=>String(m.id)===String(draft.editingMealId));if(i>=0){a[i]={...a[i],name:x.amount?`${x.amount} ${x.name}`:x.name,cal:x.calories,p:x.protein,c:x.carbs,f:x.fat};setMeals(a);render();showPage('home')}}}else addFoods(items,draft?.source||'AI/review');$('review').classList.remove('open');$('saveAi').textContent='Save food';if($('foodText'))$('foodText').value='';if($('photo'))$('photo').value='';draft=null}
async function requestAnalysis"""
s = sub_once(s, pattern, new_save, 'save review flat list', re.S)
p.write_text(s)

# 3) Coach API: return an array of structured foods, one object per distinct food.
p = root/'src/fuel-coach-api.js'
s = p.read_text()
s = replace_once(s, 'Keep conversational continuity with RECENT CONVERSATION and PENDING FOOD.', 'Keep conversational continuity with RECENT CONVERSATION and PENDING FOODS.', 'coach pending wording')
s = replace_once(s, 'When the user asks about a specific loggable food, provide a structured food object whose macros match its amount.', 'When the user asks about loggable food, provide a structured foods array whose macros match each amount. Every distinct food must be its own object; never combine steak and chicken, eggs and bacon, ribs and potatoes, or other separate foods into one log object. A truly mixed or inseparable dish can remain one object.', 'coach system flat foods')
old_unpack = "function unpackQuestionAnswer(text){const parsed=parseJsonLoose(text);if(parsed&&typeof parsed.answer==='string'&&parsed.answer.trim())return {answer:cleanAnswer(parsed.answer),food:normalizeFood(parsed.food)};return {answer:cleanAnswer(text),food:null}}"
new_unpack = "function normalizeFoods(raw){const list=Array.isArray(raw)?raw:(raw?[raw]:[]);return list.map(normalizeFood).filter(Boolean).slice(0,12)}\nfunction unpackQuestionAnswer(text){const parsed=parseJsonLoose(text);if(parsed&&typeof parsed.answer==='string'&&parsed.answer.trim())return {answer:cleanAnswer(parsed.answer),foods:normalizeFoods(parsed.foods??parsed.food)};return {answer:cleanAnswer(text),foods:[]}}"
s = replace_once(s, old_unpack, new_unpack, 'coach unpack foods')
old_task = 'Use RECENT CONVERSATION to resolve references like it, that, those ribs, add it, or what we just discussed. PENDING FOOD is the specific food from the recent exchange that can be logged. If the user asks for nutrition for a specific food, return that food in the structured food field with a natural amount. Preserve an explicit count or ounce amount. For meat with unknown weight, use exactly 1 oz as the reference. If you return a food, end the answer naturally with "Want me to log that?" Return ONLY JSON in this shape: {"answer":"natural conversational answer","food":null OR {"name":"food name","amount":"12 oz or 3 ribs or 10 shrimp","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0}}.'
new_task = 'Use RECENT CONVERSATION to resolve references like it, that, those ribs, add it, or what we just discussed. PENDING FOODS are the specific foods from the recent exchange that can be logged. If the user asks for nutrition for food, return every distinct food in the structured foods array with its own natural amount and macros. Example: "4 oz ribeye and 6 oz grilled chicken thighs" MUST return two food objects, one 4 oz ribeye and one 6 oz chicken thighs; the conversational answer may give the combined total, but the structured foods must stay separate. Preserve explicit count or ounce amounts. For meat with unknown weight, use exactly 1 oz as the reference. If you return one or more foods, end the answer naturally with "Want me to log that?" Return ONLY JSON in this shape: {"answer":"natural conversational answer","foods":[] OR [{"name":"food name","amount":"12 oz or 3 ribs or 10 shrimp","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0}]}.'
s = replace_once(s, old_task, new_task, 'coach question schema')
s = replace_once(s, "const pending=JSON.stringify(body?.pendingFood||null).slice(0,3000);", "const pending=JSON.stringify(body?.pendingFoods??body?.pendingFood??[]).slice(0,6000);", 'coach pending payload')
s = replace_once(s, 'PENDING FOOD:\\n${pending}', 'PENDING FOODS:\\n${pending}', 'coach pending heading')
s = s.replace('answer:parsedAnswer.answer,food:parsedAnswer.food', 'answer:parsedAnswer.answer,foods:parsedAnswer.foods')
if s.count('foods:parsedAnswer.foods') < 2:
    raise SystemExit('coach response foods replacements missing')
p.write_text(s)

# 4) Coach client: pending payload is an array; "add it" logs every item separately.
p = root/'public/fuel-coach.js'
s = p.read_text()
s = replace_once(s, "const PENDING_KEY='fuel-coach-pending-food-v1';", "const PENDING_KEY='fuel-coach-pending-foods-v2';", 'pending storage version')
pattern = r"function pendingFood\(\).*?function esc\(s\)"
helpers = r'''function pendingFoods(){const x=read(PENDING_KEY,null);if(!x||!x.at||Date.now()-new Date(x.at).getTime()>PENDING_MS){try{localStorage.removeItem(PENDING_KEY)}catch{};return null}const foods=Array.isArray(x.foods)?x.foods:(x.food?[x.food]:[]);return foods.length?{...x,foods}:null}
function setPendingFoods(foods){const list=Array.isArray(foods)?foods.filter(x=>x&&x.name&&x.amount):[];if(list.length)write(PENDING_KEY,{at:new Date().toISOString(),foods:list});else try{localStorage.removeItem(PENDING_KEY)}catch{}}
function isAddCommand(q=''){return /^(?:yes|yep|yeah|sure|ok|okay|do it|go ahead|add it|add that|log it|log that|save it|save that|add this|log this)[.! ]*$/i.test(String(q).trim())}
function pendingLabel(){const foods=pendingFoods()?.foods||[];if(!foods.length)return '';if(foods.length===1)return `${foods[0].amount} ${foods[0].name}`;return `${foods.length} foods`}
function renderPendingAction(){const b=$('fcAddFood');if(!b)return;const label=pendingLabel();b.style.display=label?'block':'none';b.textContent=label?`＋ Log ${label}`:'Log food'}
function addPending(question='add it'){const p=pendingFoods(),foods=p?.foods||[];if(!foods.length||typeof window.FuelAddCoachFoods!=='function'){setState('There is no food waiting to be logged.');return false}const ok=window.FuelAddCoachFoods(foods);if(!ok){setState('I could not add that food yet.');return false}const description=foods.length===1?`${foods[0].amount} ${foods[0].name}`:`${foods.length} foods separately`;const answer=`Logged ${description}.`;saveHistory(question,answer,'question');setPendingFoods([]);renderPendingAction();$('fuelCoachModal')?.classList.remove('open');setState(answer);window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:answer}}));return true}

function esc(s)'''
s = sub_once(s, pattern, helpers, 'coach pending array helpers', re.S)
old_run = "async function run(mode,question=''){question=String(question||'').trim();if(!question){setState('Ask me a question first.');return}if(isAddCommand(question)&&pendingFood()){addPending(question);return}stopSpeaking();setState('Thinking…');try{const pending=pendingFood();const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'question',question,context:context(question),conversation:recentConversation(),pendingFood:pending?.food||null})});const d=await r.json();if(!d.ok)throw Error(d.error||'Unable to answer');if(d.food)setPendingFood(d.food);saveHistory(question,d.answer,'question');renderPendingAction();setState(d.food?'Ready to log when you are.':'Speaking…');window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:d.answer}}))}catch(e){setState(e.message||'Fuel Coach could not answer right now.')}}"
new_run = "async function run(mode,question=''){question=String(question||'').trim();if(!question){setState('Ask me a question first.');return}if(isAddCommand(question)&&pendingFoods()){addPending(question);return}stopSpeaking();setState('Thinking…');try{const pending=pendingFoods();const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'question',question,context:context(question),conversation:recentConversation(),pendingFoods:pending?.foods||[]})});const d=await r.json();if(!d.ok)throw Error(d.error||'Unable to answer');const foods=Array.isArray(d.foods)?d.foods:(d.food?[d.food]:[]);if(foods.length)setPendingFoods(foods);saveHistory(question,d.answer,'question');renderPendingAction();setState(foods.length?'Ready to log when you are.':'Speaking…');window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:d.answer}}))}catch(e){setState(e.message||'Fuel Coach could not answer right now.')}}"
s = replace_once(s, old_run, new_run, 'coach run multiple foods')
p.write_text(s)

# 5) Cache bust app + Coach client.
p = root/'public/index.html'
s = p.read_text()
s = replace_once(s, '/app.js?v=3', '/app.js?v=4', 'app cache bust')
p.write_text(s)

p = root/'src/index-wrapper.js'
s = p.read_text()
s = replace_once(s, '/fuel-coach.js?v=5', '/fuel-coach.js?v=6', 'coach cache bust')
p.write_text(s)

# 6) Tests lock the flat-food behavior.
p = root/'tests/smoke.test.mjs'
s = p.read_text()
s = replace_once(s, "  assert.match(coach,/portion-editor\\.js\\?v=5/);", "  assert.match(coach,/portion-editor\\.js\\?v=5/);\n  assert.match(client,/function addFoods/);\n  assert.match(client,/FuelAddCoachFoods/);", 'smoke flat app assertions')
insert = """

test('Fuel stores distinct foods as separate Today entries',()=>{
  assert.match(client,/draft\.items\.length>1\?'Save foods':'Save food'/);
  assert.match(client,/else addFoods\(items,draft\?\.source\|\|'AI\/review'\)/);
  assert.doesNotMatch(client,/items\.map\(x=>x\.amount\?`\$\{x\.amount\} \$\{x\.name\}`:x\.name\)\.join/);
  assert.match(coachApi,/structured foods array/);
  assert.match(coachApi,/MUST return two food objects/);
  assert.match(coachApi,/foods:parsedAnswer\.foods/);
  assert.match(coach,/pendingFoods/);
  assert.match(coach,/FuelAddCoachFoods/);
  assert.match(src,/Do not combine distinct foods into one item/);
});
"""
s += insert
p.write_text(s)

print('Fuel flat food log upgrade patched successfully')
