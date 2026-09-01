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

# ---------------------------------------------------------------------------
# 1) Type/photo analyzer: natural units and no nutrition without an amount.
# ---------------------------------------------------------------------------
p = root / 'src/index.js'
s = p.read_text()
new_prompt = r'''    const prompt=`Estimate nutrition for one meal from the information below. Be practical and conservative. Prefer exact known branded or restaurant nutrition when the user names a specific chain/menu item. Preserve any quantity or weight the user explicitly gives. Use the unit normal people naturally use for that food: meat, poultry and fish should normally be in ounces; countable foods such as ribs, wings, shrimp, eggs, meatballs and scallops should stay in counts when a count is given. If a photo clearly identifies a meat such as steak/ribeye but its total weight cannot be estimated confidently, DO NOT invent a whole-steak calorie total: return nutrition for exactly 1 oz and set amount to "1 oz" so the user can enter the ounces actually eaten. If the photo gives enough visual evidence to estimate total weight, show that estimated ounce amount. A shrimp size such as 16/20 means 16-20 shrimp per pound, so one shrimp is roughly 16 divided by the midpoint count in ounces (about 0.89 oz for 16/20). For "3 St. Louis ribs, no sauce", keep the amount as "3 ribs" and estimate three ribs without sauce; do not force it into ounces. Every item MUST have a non-empty amount and its calories/macros MUST correspond to that amount. Include sauces, butter, oils, breading, cheese and cooking fats when mentioned or clearly visible. Do not invent unsupported foods.\n\nUSER TEXT:\n${text||'(none)'}\n\nIMAGE DESCRIPTION:\n${imageDescription||'(none)'}\n\nReturn ONLY valid JSON:\n{"items":[{"name":"food","amount":"natural amount such as 12 oz, 3 ribs, or 10 shrimp","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0,"source":"official/known data or AI estimate"}],"note":"short uncertainty note"}`;'''
s = sub_once(
    s,
    r"    const prompt=`Estimate nutrition for one meal from the information below\..*?`;\n    const result=await env\.AI\.run",
    new_prompt + "\n    const result=await env.AI.run",
    'analyze prompt',
    re.S,
)
old_parse = """    const parsed=parseJsonLoose(readAiText(result));
    if(!parsed)return json({error:'I could not read that meal clearly. Add portion sizes and try again.'},{status:422});
    const out=normalize(parsed);if(!out.items.length)return json({error:'I could not identify enough food to calculate.'},{status:422});
"""
new_parse = """    let parsed=parseJsonLoose(readAiText(result));
    if(parsed&&Array.isArray(parsed.items)&&parsed.items.some(item=>!String(item?.amount||'').trim())){
      const repairPrompt=`The previous nutrition result identified the food but omitted an amount. Repair it using the same evidence. Every item must have a natural human amount and the macros must match that amount. Preserve explicit user quantities. For meat/poultry/fish use ounces. If a meat is identified but total size cannot be estimated confidently, normalize that item to exactly 1 oz and recalculate calories/protein/carbs/fat for 1 oz. Preserve counts for ribs, wings, shrimp, eggs, meatballs and scallops. Return ONLY the complete repaired JSON object.\n\nUSER TEXT:\n${text||'(none)'}\n\nIMAGE DESCRIPTION:\n${imageDescription||'(none)'}\n\nPREVIOUS RESULT:\n${JSON.stringify(parsed).slice(0,6000)}`;
      try{
        const repairedResult=await env.AI.run(AI_MODEL,{messages:[{role:'system',content:'You repair nutrition logging JSON. Output JSON only.'},{role:'user',content:repairPrompt}],temperature:0,max_completion_tokens:1000,chat_template_kwargs:{enable_thinking:false}});
        const repaired=parseJsonLoose(readAiText(repairedResult));
        if(repaired&&Array.isArray(repaired.items)&&repaired.items.length)parsed=repaired;
      }catch(error){console.warn('portion repair failed',error)}
    }
    if(!parsed)return json({error:'I could not read that meal clearly. Add portion sizes and try again.'},{status:422});
    const out=normalize(parsed);if(!out.items.length)return json({error:'I could not identify enough food to calculate.'},{status:422});
    if(out.items.some(item=>!String(item.amount||'').trim()))return json({error:'I identified the food, but I need an amount to calculate it safely. Enter a count or ounces and try again.'},{status:422});
"""
s = replace_once(s, old_parse, new_parse, 'analyze parse')
p.write_text(s)

# ---------------------------------------------------------------------------
# 2) Portion editor: ounces for weight, natural counts for countable food.
# ---------------------------------------------------------------------------
p = root / 'public/portion-editor.js'
s = p.read_text()
s = replace_once(
    s,
    "const UNITS=['oz','g','lb','cup','tbsp','tsp','piece','slice','wing','corner','serving'];",
    "const UNITS=['oz','g','lb','cup','tbsp','tsp','piece','slice','wing','rib','shrimp','egg','meatball','scallop','corner','serving'];",
    'portion units',
)
s = replace_once(
    s,
    "corner:'corner',corners:'corner',serving:'serving'",
    "corner:'corner',corners:'corner',rib:'rib',ribs:'rib',shrimp:'shrimp',egg:'egg',eggs:'egg',meatball:'meatball',meatballs:'meatball',scallop:'scallop',scallops:'scallop',serving:'serving'",
    'portion unit map',
)
s = replace_once(
    s,
    "pieces?|slices?|wings?|corners?|servings?|portions?",
    "pieces?|slices?|wings?|ribs?|shrimp|eggs?|meatballs?|scallops?|corners?|servings?|portions?",
    'portion regex',
)
s = replace_once(
    s,
    "if(['piece','slice','wing','corner'].includes(u))return 'count';",
    "if(['piece','slice','wing','rib','shrimp','egg','meatball','scallop','corner'].includes(u))return 'count';",
    'portion count family',
)
p.write_text(s)

# ---------------------------------------------------------------------------
# 3) Quick Add: a logged count such as 3 ribs can become per-rib Quick Add.
# ---------------------------------------------------------------------------
p = root / 'public/quick-add.js'
s = p.read_text()
s = replace_once(
    s,
    "function countLabelFor(name=''){if(/shrimp/i.test(name))return 'shrimp';if(/wing/i.test(name))return 'wing';if(/egg/i.test(name))return 'egg';if(/meatball/i.test(name))return 'meatball';if(/scallop/i.test(name))return 'scallop';return 'piece'}",
    "function countLabelFor(name=''){if(/shrimp/i.test(name))return 'shrimp';if(/\\bribs?\\b/i.test(name))return 'rib';if(/wing/i.test(name))return 'wing';if(/egg/i.test(name))return 'egg';if(/meatball/i.test(name))return 'meatball';if(/scallop/i.test(name))return 'scallop';return 'piece'}",
    'quick count label',
)
s = replace_once(
    s,
    "function quickNameFor(name=''){if(/shrimp/i.test(name))return '🍤 Shrimp';return name.replace(/^\\S+\\s+/,'').trim()||'Food'}",
    "function quickNameFor(name=''){if(/shrimp/i.test(name))return '🍤 Shrimp';if(/\\bribs?\\b/i.test(name))return '🍖 Ribs';if(/wing/i.test(name))return '🍗 Wings';return name.replace(/^\\S+\\s+/,'').trim()||'Food'}",
    'quick name',
)
old_save = "function saveLoggedMeal(id){const m=meals().find(x=>String(x.id)===String(id));if(!m)return toast('I could not find that logged food.');const weighted=parseWeightedMeal(m.name);if(weighted){openSetup(m,weighted);return}saveFixedMeal(m)}"
new_save = r'''function parseCountMeal(name=''){const s=String(name).trim(),m=s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(ribs?|wings?|shrimp|eggs?|meatballs?|scallops?|pieces?)\b\s*(.*)$/i);if(!m)return null;const qty=+m[1];if(!(qty>0))return null;const label=countLabelFor(m[2]),food=(m[3]||m[2]).trim();return {qty,label,food}}
function saveCountMeal(m,counted){const q=counted.qty;if(!(q>0))return saveFixedMeal(m);const candidate={name:quickNameFor(counted.food||m.name),mode:'count',countLabel:counted.label,cal:round((+m.cal||0)/q,2),p:round((+m.p||0)/q,2),c:round((+m.c||0)/q,2),f:round((+m.f||0)/q,2)};const favs=getFavs(),key=candidate.name.trim().toLowerCase(),i=favs.findIndex(x=>x.name.trim().toLowerCase()===key);if(i>=0)favs[i]=candidate;else favs.push(candidate);if(setFavs(favs)){renderQuick();toast(`Saved per ${counted.label}.`)}}
function saveLoggedMeal(id){const m=meals().find(x=>String(x.id)===String(id));if(!m)return toast('I could not find that logged food.');const counted=parseCountMeal(m.name);if(counted){saveCountMeal(m,counted);return}const weighted=parseWeightedMeal(m.name);if(weighted){openSetup(m,weighted);return}saveFixedMeal(m)}'''
s = replace_once(s, old_save, new_save, 'quick save logged meal')
p.write_text(s)

# ---------------------------------------------------------------------------
# 4) App bridge: structured food from Coach can actually enter today's log.
# ---------------------------------------------------------------------------
p = root / 'public/app.js'
s = p.read_text()
add_meal = "function addMeal(o){const a=meals();o.id=Date.now()+Math.floor(Math.random()*1000);o.time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});a.push(o);setMeals(a);render();showPage('home')}"
bridge = add_meal + "\nwindow.FuelAddCoachFood=function(food){if(!food||typeof food!=='object')return false;const name=String(food.name||'').trim(),amount=String(food.amount||'').trim();if(!name||!amount)return false;const nums=['calories','protein','carbs','fat'].map(k=>Number(food[k]));if(!nums.every(Number.isFinite))return false;addMeal({name:`${amount} · ${name}`,cal:nums[0],p:nums[1],c:nums[2],f:nums[3],source:'Fuel Coach'});return true};"
s = replace_once(s, add_meal, bridge, 'app coach log bridge')
p.write_text(s)

# ---------------------------------------------------------------------------
# 5) Coach client: 7-day chat context, 24-hour pending food, actual "add it".
# ---------------------------------------------------------------------------
p = root / 'public/fuel-coach.js'
s = p.read_text()
s = replace_once(
    s,
    "const HISTORY_KEY='fuel-coach-history-v1';",
    "const HISTORY_KEY='fuel-coach-history-v1';\nconst PENDING_KEY='fuel-coach-pending-food-v1';\nconst CONVERSATION_MS=7*24*60*60*1000,PENDING_MS=24*60*60*1000;",
    'coach memory keys',
)
save_history = "function saveHistory(question,answer,mode){const history=read(HISTORY_KEY,[]);history.unshift({id:Date.now(),at:new Date().toISOString(),mode,question:question||'Fuel Coach',answer});write(HISTORY_KEY,history.slice(0,50));renderHistory()}"
helpers = r'''
function recentConversation(){const cutoff=Date.now()-CONVERSATION_MS;return read(HISTORY_KEY,[]).filter(x=>new Date(x.at).getTime()>=cutoff).slice(0,12).reverse().map(x=>({question:String(x.question||'').slice(0,500),answer:String(x.answer||'').slice(0,1200)}))}
function pendingFood(){const x=read(PENDING_KEY,null);if(!x||!x.at||Date.now()-new Date(x.at).getTime()>PENDING_MS){try{localStorage.removeItem(PENDING_KEY)}catch{};return null}return x}
function setPendingFood(food){if(food&&food.name&&food.amount)write(PENDING_KEY,{at:new Date().toISOString(),food});else try{localStorage.removeItem(PENDING_KEY)}catch{}}
function isAddCommand(q=''){return /^(?:yes|yep|yeah|sure|ok|okay|do it|go ahead|add it|add that|log it|log that|save it|save that|add this|log this)[.! ]*$/i.test(String(q).trim())}
function pendingLabel(){const p=pendingFood()?.food;return p?`${p.amount} ${p.name}`:''}
function renderPendingAction(){const b=$('fcAddFood');if(!b)return;const label=pendingLabel();b.style.display=label?'block':'none';b.textContent=label?`＋ Log ${label}`:'Log this food'}
function addPending(question='add it'){const p=pendingFood();if(!p?.food||typeof window.FuelAddCoachFood!=='function'){setState('There is no food waiting to be logged.');return false}const ok=window.FuelAddCoachFood(p.food);if(!ok){setState('I could not add that food yet.');return false}const answer=`Logged ${p.food.amount} ${p.food.name}.`;saveHistory(question,answer,'question');setPendingFood(null);renderPendingAction();$('fuelCoachModal')?.classList.remove('open');setState(answer);window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:answer}}));return true}
'''
s = replace_once(s, save_history, save_history + helpers, 'coach helper insertion')
s = replace_once(
    s,
    '<button id="fcSend" class="fcSend">Ask Fuel Coach</button><div id="fcState" class="fcState"></div>',
    '<button id="fcSend" class="fcSend">Ask Fuel Coach</button><button id="fcAddFood" class="fcSend" style="display:none;margin-top:10px;background:#47d7a2;color:#07131d">Log this food</button><div id="fcState" class="fcState"></div>',
    'coach add button',
)
s = replace_once(
    s,
    "$('fcClose').onclick=()=>closeCoach();$('fuelCoachModal').onclick=e=>{if(e.target===$('fuelCoachModal'))closeCoach()};$('fcSend').onclick=()=>run('question',$('fcQuestion').value);$('fcTalk').onclick=toggleListen;installHistory()",
    "$('fcClose').onclick=()=>closeCoach();$('fuelCoachModal').onclick=e=>{if(e.target===$('fuelCoachModal'))closeCoach()};$('fcSend').onclick=()=>run('question',$('fcQuestion').value);$('fcAddFood').onclick=()=>addPending('add it');$('fcTalk').onclick=toggleListen;installHistory();renderPendingAction()",
    'coach bindings',
)
old_run = "async function run(mode,question=''){question=String(question||'').trim();if(!question){setState('Ask me a question first.');return}stopSpeaking();setState('Thinking…');try{const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'question',question,context:context(question)})});const d=await r.json();if(!d.ok)throw Error(d.error||'Unable to answer');saveHistory(question,d.answer,'question');setState('Speaking…');window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:d.answer}}))}catch(e){setState(e.message||'Fuel Coach could not answer right now.')}}"
new_run = "async function run(mode,question=''){question=String(question||'').trim();if(!question){setState('Ask me a question first.');return}if(isAddCommand(question)&&pendingFood()){addPending(question);return}stopSpeaking();setState('Thinking…');try{const pending=pendingFood();const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'question',question,context:context(question),conversation:recentConversation(),pendingFood:pending?.food||null})});const d=await r.json();if(!d.ok)throw Error(d.error||'Unable to answer');if(d.food)setPendingFood(d.food);saveHistory(question,d.answer,'question');renderPendingAction();setState(d.food?'Ready to log when you are.':'Speaking…');window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:d.answer}}))}catch(e){setState(e.message||'Fuel Coach could not answer right now.')}}"
s = replace_once(s, old_run, new_run, 'coach run')
s = replace_once(
    s,
    "function open(){setup();$('fuelCoachModal').classList.add('open');$('fcQuestion').style.display='block';$('fcSend').style.display='block';$('fcTalk').style.display='block';setState('')}",
    "function open(){setup();$('fuelCoachModal').classList.add('open');$('fcQuestion').style.display='block';$('fcSend').style.display='block';$('fcTalk').style.display='block';renderPendingAction();setState('')}",
    'coach open',
)
s = replace_once(s, "import('/portion-editor.js?v=4')", "import('/portion-editor.js?v=5')", 'coach portion cache')
p.write_text(s)

# ---------------------------------------------------------------------------
# 6) Coach API: supply recent turns + pending food and return structured food.
# ---------------------------------------------------------------------------
p = root / 'src/fuel-coach-api.js'
s = p.read_text()
s = replace_once(
    s,
    "const system=`You are Fuel Coach inside a personal nutrition tracker. Use only the tracker data supplied in the request.",
    "const system=`You are Fuel Coach inside a personal nutrition tracker. Use tracker data supplied in the request for user-specific facts, but you may use standard nutrition knowledge to estimate ordinary foods when the user asks about food.",
    'coach API system start',
)
s = replace_once(
    s,
    "Do not diagnose disease, prescribe or change medication, recommend starvation/dehydration/compensatory exercise, or automatically tell the user to eat back active calories.`;",
    "Do not diagnose disease, prescribe or change medication, recommend starvation/dehydration/compensatory exercise, or automatically tell the user to eat back active calories. Keep conversational continuity with RECENT CONVERSATION and PENDING FOOD. Natural units matter: meat/poultry/fish normally use ounces; counts stay counts for ribs, wings, shrimp, eggs, meatballs and scallops. Preserve explicit quantities. If discussing a meat and the total size is unknown, use a 1 oz reference rather than inventing a whole-item total. When the user asks about a specific loggable food, provide a structured food object whose macros match its amount. For example, three St. Louis ribs with no sauce should remain 3 ribs, not be converted to an arbitrary ounce count.`;",
    'coach API system end',
)
api_helpers = r'''function parseJsonLoose(text){const s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{return JSON.parse(s)}catch{}const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}return null}
function normalizeFood(raw){if(!raw||typeof raw!=='object')return null;const name=String(raw.name||'').trim().slice(0,120),amount=String(raw.amount||'').trim().slice(0,80);const calories=Number(raw.calories),protein=Number(raw.protein),carbs=Number(raw.carbs),fat=Number(raw.fat);if(!name||!amount||![calories,protein,carbs,fat].every(Number.isFinite))return null;return {name,amount,calories:Math.max(0,Math.round(calories)),protein:Math.max(0,Math.round(protein*10)/10),carbs:Math.max(0,Math.round(carbs*10)/10),fat:Math.max(0,Math.round(fat*10)/10),confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0.65))}}
function unpackQuestionAnswer(text){const parsed=parseJsonLoose(text);if(parsed&&typeof parsed.answer==='string'&&parsed.answer.trim())return {answer:cleanAnswer(parsed.answer),food:normalizeFood(parsed.food)};return {answer:cleanAnswer(text),food:null}}

'''
s = replace_once(s, 'function normalizeContext(raw){', api_helpers + 'function normalizeContext(raw){', 'coach API helpers')
old_question_task = r''': `Answer this question directly using the tracker data. Use TRACKER DATA.today for anything about today and maintenance.estimatedTdee for maintenance/deficit math. If today's food log is empty, treat intake as unknown. Prefer current Apple Health body-composition values over older manual values. Do not infer a trend from one measurement. User question: ${question||'No question supplied.'}`;
  const tracker=JSON.stringify(normalizeContext(body?.context||{})).slice(0,24000);
  return `${task}\n\nTRACKER DATA:\n${tracker}`;'''
new_question_task = r''': `Answer this question directly. Use TRACKER DATA.today for anything about today and maintenance.estimatedTdee for maintenance/deficit math. If today's food log is empty, treat intake as unknown. Prefer current Apple Health body-composition values over older manual values. Do not infer a trend from one measurement. Use RECENT CONVERSATION to resolve references like it, that, those ribs, add it, or what we just discussed. PENDING FOOD is the specific food from the recent exchange that can be logged. If the user asks for nutrition for a specific food, return that food in the structured food field with a natural amount. Preserve an explicit count or ounce amount. For meat with unknown weight, use exactly 1 oz as the reference. If you return a food, end the answer naturally with "Want me to log that?" Return ONLY JSON in this shape: {"answer":"natural conversational answer","food":null OR {"name":"food name","amount":"12 oz or 3 ribs or 10 shrimp","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0}}. User question: ${question||'No question supplied.'}`;
  const tracker=JSON.stringify(normalizeContext(body?.context||{})).slice(0,24000);
  const conversation=JSON.stringify(Array.isArray(body?.conversation)?body.conversation.slice(-12):[]).slice(0,12000);
  const pending=JSON.stringify(body?.pendingFood||null).slice(0,3000);
  return `${task}\n\nRECENT CONVERSATION (oldest to newest, up to 7 days):\n${conversation}\n\nPENDING FOOD:\n${pending}\n\nTRACKER DATA:\n${tracker}`;'''
s = replace_once(s, old_question_task, new_question_task, 'coach API question task')
s = replace_once(
    s,
    "if(r.ok){const answer=cleanAnswer(outputText(d));if(answer)return json({ok:true,provider:'openai',reasoningEffort,answer})}",
    "if(r.ok){const parsedAnswer=unpackQuestionAnswer(outputText(d));if(parsedAnswer.answer)return json({ok:true,provider:'openai',reasoningEffort,answer:parsedAnswer.answer,food:parsedAnswer.food})}",
    'coach API OpenAI response',
)
s = replace_once(
    s,
    "const answer=cleanAnswer(result?.choices?.[0]?.message?.content||result?.response||result?.result);if(answer)return json({ok:true,provider:'cloudflare',answer})",
    "const parsedAnswer=unpackQuestionAnswer(result?.choices?.[0]?.message?.content||result?.response||result?.result);if(parsedAnswer.answer)return json({ok:true,provider:'cloudflare',answer:parsedAnswer.answer,food:parsedAnswer.food})",
    'coach API Cloudflare response',
)
p.write_text(s)

# ---------------------------------------------------------------------------
# 7) Cache-bust changed web code.
# ---------------------------------------------------------------------------
p = root / 'public/index.html'
s = p.read_text()
s = replace_once(s, '/portion-editor.js?v=4', '/portion-editor.js?v=5', 'index portion cache')
p.write_text(s)

p = root / 'src/index-wrapper.js'
s = p.read_text()
s = replace_once(s, '/fuel-coach.js?v=4', '/fuel-coach.js?v=5', 'wrapper coach cache')
p.write_text(s)

# Existing tests that lock old cache version.
for rel in ['tests/smoke.test.mjs', 'tests/portion-quick-barcode.test.mjs']:
    p = root / rel
    s = p.read_text().replace('portion-editor\\.js\\?v=4', 'portion-editor\\.js\\?v=5').replace('portion-editor.js?v=4', 'portion-editor.js?v=5')
    p.write_text(s)

# Targeted behavior tests.
p = root / 'tests/conversation-natural-units.test.mjs'
p.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const analyzer=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const coach=await readFile(new URL('../public/fuel-coach.js',import.meta.url),'utf8');
const coachApi=await readFile(new URL('../src/fuel-coach-api.js',import.meta.url),'utf8');
const portions=await readFile(new URL('../public/portion-editor.js',import.meta.url),'utf8');
const quick=await readFile(new URL('../public/quick-add.js',import.meta.url),'utf8');
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const wrapper=await readFile(new URL('../src/index-wrapper.js',import.meta.url),'utf8');

test('photo analyzer never accepts mystery meat portions',()=>{
  assert.match(analyzer,/return nutrition for exactly 1 oz/);
  assert.match(analyzer,/3 St\. Louis ribs/);
  assert.match(analyzer,/16\/20/);
  assert.match(analyzer,/portion repair failed/);
});
test('natural count units include ribs and shrimp while serving remains available',()=>{
  assert.match(portions,/rib:'rib'/);
  assert.match(portions,/shrimp:'shrimp'/);
  assert.match(portions,/\['oz','g','lb','serving'\]/);
  assert.doesNotThrow(()=>new Function(portions));
});
test('Quick Add understands count-based ribs',()=>{
  assert.match(quick,/parseCountMeal/);
  assert.match(quick,/Saved per/);
  assert.match(quick,/return 'rib'/);
  assert.doesNotThrow(()=>new Function(quick));
});
test('coach keeps recent conversation and a 24 hour pending food',()=>{
  assert.match(coach,/CONVERSATION_MS=7\*24/);
  assert.match(coach,/PENDING_MS=24\*60/);
  assert.match(coach,/recentConversation/);
  assert.match(coach,/pendingFood/);
  assert.match(coach,/isAddCommand/);
  assert.match(coach,/FuelAddCoachFood/);
  assert.doesNotThrow(()=>new Function(coach));
});
test('coach api returns structured loggable food and sees conversation',()=>{
  assert.match(coachApi,/RECENT CONVERSATION/);
  assert.match(coachApi,/PENDING FOOD/);
  assert.match(coachApi,/normalizeFood/);
  assert.match(coachApi,/St\. Louis ribs/);
  assert.match(coachApi,/use exactly 1 oz/);
});
test('app exposes a coach logging bridge and cache busts coach',()=>{
  assert.match(app,/FuelAddCoachFood/);
  assert.match(wrapper,/fuel-coach\.js\?v=5/);
  assert.doesNotThrow(()=>new Function(app));
});
''')
