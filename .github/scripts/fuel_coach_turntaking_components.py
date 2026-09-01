from pathlib import Path

root = Path('fuel-tracker')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch marker: {label}')
    return text.replace(old, new, 1)

# 1) Coach UI: explicit phases, auto-listen after speech, and robust short add commands.
p = root / 'public/fuel-coach.js'
s = p.read_text()
s = replace_once(s,
    "let recognition=null,listening=false;",
    "let recognition=null,listening=false,phase='ready',autoListenTimer=null;",
    'coach phase state')
s = replace_once(s,
    "function isAddCommand(q=''){return /^(?:yes|yep|yeah|sure|ok|okay|do it|go ahead|add it|add that|log it|log that|save it|save that|add this|log this)[.! ]*$/i.test(String(q).trim())}",
    "function isAddCommand(q=''){return /^(?:yes|yep|yeah|sure|ok|okay|do it|go ahead|add it|add that|log it|log that|save it|save that|add this|log this|edit|at it|ad it|added)[.! ]*$/i.test(String(q).trim())}",
    'add command speech variants')
s = replace_once(s,
    ".fcState{font-size:14px;color:#a7b3c8;text-align:center;margin-top:10px;min-height:20px}.fcHist",
    ".fcPhase{margin:10px 0 4px;border-radius:14px;padding:12px 14px;text-align:center;font-size:16px;font-weight:900;letter-spacing:.02em;border:1px solid #ffffff24}.fcPhase.ready{background:#162033;color:#dce9ff}.fcPhase.thinking{background:#4a3510;color:#ffe29b}.fcPhase.speaking{background:#182c5e;color:#a9d4ff}.fcPhase.listening{background:#123e2e;color:#9ff0c8;box-shadow:0 0 0 4px #19c37d26;animation:fcPulse 1.1s ease-in-out infinite}.fcPhase .fcDot{display:inline-block;width:10px;height:10px;border-radius:50%;background:currentColor;margin-right:8px;vertical-align:1px}@keyframes fcPulse{50%{box-shadow:0 0 0 10px #19c37d12}}.fcAnswer{display:none;margin:10px 0;padding:12px 14px;border-radius:14px;background:#0b1220;border:1px solid #ffffff24;color:#eef6ff;line-height:1.45}.fcAnswer.show{display:block}.fcState{font-size:14px;color:#a7b3c8;text-align:center;margin-top:8px;min-height:20px}.fcHist",
    'coach phase css')
s = replace_once(s,
    "<div class=\"fcHead\"><h2>💬 Fuel Coach</h2><button id=\"fcClose\" class=\"fcClose\">×</button></div><button id=\"fcTalk\" class=\"fcTalk\">🎙️ Tap to talk</button><textarea",
    "<div class=\"fcHead\"><h2>💬 Fuel Coach</h2><button id=\"fcClose\" class=\"fcClose\">×</button></div><div id=\"fcPhase\" class=\"fcPhase ready\"><span class=\"fcDot\"></span>READY</div><div id=\"fcAnswer\" class=\"fcAnswer\"></div><button id=\"fcTalk\" class=\"fcTalk\">🎙️ Tap to talk</button><textarea",
    'coach phase html')
s = replace_once(s,
    "function setState(t){if($('fcState'))$('fcState').textContent=t||''}",
    "function setState(t){if($('fcState'))$('fcState').textContent=t||''}\nfunction setAnswer(t=''){const el=$('fcAnswer');if(!el)return;el.textContent=String(t||'').trim();el.classList.toggle('show',!!el.textContent)}\nfunction setPhase(next='ready',detail=''){phase=next;const el=$('fcPhase');if(el){el.className='fcPhase '+next;const label=next==='listening'?'LISTENING — SAY IT NOW':next==='thinking'?'THINKING':next==='speaking'?'COACH SPEAKING — WAIT':'READY';el.innerHTML='<span class=\"fcDot\"></span>'+label}const talk=$('fcTalk'),send=$('fcSend'),busy=next==='thinking'||next==='speaking';if(talk){talk.disabled=busy;talk.classList.toggle('listening',next==='listening');talk.textContent=next==='listening'?'🟢 Listening — say it now':next==='thinking'?'⏳ Thinking…':next==='speaking'?'🔊 Coach speaking…':'🎙️ Tap to talk'}if(send)send.disabled=busy||next==='listening';const defaults={ready:'Tap the microphone when you want to talk.',listening:'Speak now — I’m listening.',thinking:'Working on that…',speaking:'Wait until Coach finishes, then watch for the green listening signal.'};setState(detail||defaults[next]||'')}\nfunction scheduleAutoListen(){clearTimeout(autoListenTimer);if(!$('fuelCoachModal')?.classList.contains('open'))return;if(!pendingFoods()){setPhase('ready','Ready.');return}setPhase('ready','Coach finished. I’ll listen for your reply next.');autoListenTimer=setTimeout(()=>{if($('fuelCoachModal')?.classList.contains('open')&&!listening&&pendingFoods())toggleListen()},450)}",
    'coach phase helpers')
s = replace_once(s,
    "function setListening(on){listening=on;const b=$('fcTalk');if(!b)return;b.classList.toggle('listening',on);b.textContent=on?'Listening…':'🎙️ Tap to talk'}",
    "function setListening(on){listening=on;if(on){setPhase('listening','Speak now — I’m listening.')}else if(phase==='listening'){setPhase('ready','Ready.')}}",
    'listening phase')
s = replace_once(s,
    "setListening(true);setState('Listening…');",
    "setListening(true);",
    'native listen state')
s = s.replace("setListening(false);if(!result?.ok){setState(result?.error||'I could not hear that clearly.');return true}", "setListening(false);if(!result?.ok){setPhase('ready',result?.error||'I could not hear that clearly.');return true}", 1)
s = s.replace("if(!text){setState('I could not hear that clearly.');return true}$('fcQuestion').value=text;setState('');await run('question',text);", "if(!text){setPhase('ready','I could not hear that clearly.');return true}$('fcQuestion').value=text;setPhase('thinking','Got it — working on that…');await run('question',text);", 1)
s = s.replace("recognition.onstart=()=>{setListening(true);setState('Listening…')};", "recognition.onstart=()=>setListening(true);", 1)
s = s.replace("recognition.onerror=e=>{if(e.error!=='aborted')setState('I could not hear that clearly.')};recognition.onend=()=>setListening(false);", "recognition.onerror=e=>{if(e.error!=='aborted')setPhase('ready','I could not hear that clearly.')};recognition.onend=()=>setListening(false);", 1)
s = s.replace("if(!r){setState('Voice input is not available here.');return}$('fcQuestion').value='';setState('');", "if(!r){setPhase('ready','Voice input is not available here.');return}$('fcQuestion').value='';", 1)
s = replace_once(s,
    "stopSpeaking();setState('Thinking…');try{const pending=pendingFoods();",
    "stopSpeaking();setPhase('thinking','Thinking…');try{const pending=pendingFoods();",
    'run thinking phase')
s = replace_once(s,
    "saveHistory(question,d.answer,'question');renderPendingAction();setState(foods.length?'Ready to log when you are.':'Speaking…');window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:d.answer}}))}catch(e){setState(e.message||'Fuel Coach could not answer right now.')}}",
    "saveHistory(question,d.answer,'question');renderPendingAction();setAnswer(d.answer);setPhase('thinking','Answer ready — preparing Coach voice…');window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:d.answer}}))}catch(e){setPhase('ready',e.message||'Fuel Coach could not answer right now.')}}",
    'run answer phase')
s = replace_once(s,
    "function closeCoach(){try{if(recognition&&listening)recognition.abort()}catch{};try{nativeRecognition()?.postMessage({action:'stop'})}catch{};setListening(false);stopSpeaking();$('fuelCoachModal')?.classList.remove('open')}",
    "window.addEventListener('fuelCoachVoicePreparing',()=>setPhase('thinking','Answer ready — preparing Coach voice…'));window.addEventListener('fuelCoachSpeechStart',()=>setPhase('speaking','Coach is speaking — wait for the green listening signal.'));window.addEventListener('fuelCoachSpeechEnded',scheduleAutoListen);\nfunction closeCoach(){clearTimeout(autoListenTimer);try{if(recognition&&listening)recognition.abort()}catch{};try{nativeRecognition()?.postMessage({action:'stop'})}catch{};setListening(false);stopSpeaking();$('fuelCoachModal')?.classList.remove('open')}",
    'speech lifecycle listeners')
s = replace_once(s,
    "function open(){setup();$('fuelCoachModal').classList.add('open');$('fcQuestion').style.display='block';$('fcSend').style.display='block';$('fcTalk').style.display='block';renderPendingAction();setState('')}",
    "function open(){setup();$('fuelCoachModal').classList.add('open');$('fcQuestion').style.display='block';$('fcSend').style.display='block';$('fcTalk').style.display='block';renderPendingAction();setPhase('ready',pendingFoods()?'Food is ready. Tap the mic or say add it after Coach speaks.':'Tap the microphone when you want to talk.')}",
    'coach open phase')
s = replace_once(s,
    "import('/fuel-voice-quality.js?v=6').catch(()=>{});",
    "import('/fuel-voice-quality.js?v=7').catch(()=>{});",
    'voice cache bust')
p.write_text(s)

# 2) Voice playback lifecycle: web UI gets explicit preparing/start/end events.
p = root / 'public/fuel-voice-quality.js'
s = p.read_text()
s = replace_once(s,
    "let audio=null,last='';",
    "let audio=null,last='';\nconst emit=(name,detail={})=>window.dispatchEvent(new CustomEvent(name,{detail}));",
    'voice emit helper')
s = replace_once(s,
    "async function playNative(blob){const bridge=nativeAudio();if(!bridge)return false;const bytes=new Uint8Array(await blob.arrayBuffer());const result=await bridge.postMessage({action:'play',base64:bytesToBase64(bytes)});if(!result?.ok)throw Error(result?.error||'Native audio playback failed.');setVoiceStatus('Speaking with Fuel Coach…',true);return true}",
    "async function playNative(blob){const bridge=nativeAudio();if(!bridge)return false;const bytes=new Uint8Array(await blob.arrayBuffer());const result=await bridge.postMessage({action:'play',base64:bytesToBase64(bytes)});if(!result?.ok)throw Error(result?.error||'Native audio playback failed.');setVoiceStatus('Speaking with Fuel Coach…',true);emit('fuelCoachSpeechStart');return true}",
    'native speech start event')
s = replace_once(s,
    "async function speakNatural(text){text=cleanForSpeech(text);if(!text)return;if(text===last){last=''}last=text;stopAll();try{const r=await fetch('/api/fuel/coach'",
    "async function speakNatural(text){text=cleanForSpeech(text);if(!text)return;if(text===last){last=''}last=text;stopAll();emit('fuelCoachVoicePreparing');try{const r=await fetch('/api/fuel/coach'",
    'voice preparing event')
s = replace_once(s,
    "audio.onended=()=>setVoiceStatus('Ready',true);await audio.play();stopSystemSpeech();setTimeout(stopSystemSpeech,120);setTimeout(stopSystemSpeech,450);setVoiceStatus('Speaking with Fuel Coach…',true)}catch(err){stopSystemSpeech();setVoiceStatus(`OpenAI voice unavailable — ${err?.message||'TTS unavailable'}`,false)}}",
    "audio.onended=()=>{setVoiceStatus('Ready',true);emit('fuelCoachSpeechEnded')};await audio.play();emit('fuelCoachSpeechStart');stopSystemSpeech();setTimeout(stopSystemSpeech,120);setTimeout(stopSystemSpeech,450);setVoiceStatus('Speaking with Fuel Coach…',true)}catch(err){stopSystemSpeech();setVoiceStatus(`OpenAI voice unavailable — ${err?.message||'TTS unavailable'}`,false);emit('fuelCoachVoiceError',{message:err?.message||'TTS unavailable'})}}",
    'browser speech end event')
s = replace_once(s,
    "window.addEventListener('fuelCoachAnswer',e=>speakNatural(e?.detail?.text||''));",
    "window.addEventListener('fuelCoachNativeAudioEnded',()=>{setVoiceStatus('Ready',true);emit('fuelCoachSpeechEnded')});\nwindow.addEventListener('fuelCoachAnswer',e=>speakNatural(e?.detail?.text||''));",
    'native speech end listener')
p.write_text(s)

# 3) Native audio tells the page exactly when playback finishes.
p = root / 'ios/Fuel/ContentView.swift'
s = p.read_text()
s = replace_once(s,
    "if self.coachAudioPlayer === player {\n                    self.coachAudioPlayer = nil\n                    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)\n                }",
    "if self.coachAudioPlayer === player {\n                    self.coachAudioPlayer = nil\n                    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)\n                    self.webView?.evaluateJavaScript(\"window.dispatchEvent(new CustomEvent('fuelCoachNativeAudioEnded'))\")\n                }",
    'native audio ended event')
p.write_text(s)

# 4) Coach API: enforce useful ingredient names and repair repeated parent-name rows into one composite food.
p = root / 'src/fuel-coach-api.js'
s = p.read_text()
s = replace_once(s,
    "Component macros should approximately add to the parent total, while the parent total remains authoritative.",
    "Component macros should approximately add to the parent total, while the parent total remains authoritative. CRITICAL COMPONENT NAMING RULE: every component.name must name the ingredient itself, NEVER repeat the parent restaurant/menu-item name. Example: a Wendy's Triple Baconator can have components named Beef patties, Bacon, American cheese, Bun, Mayonnaise, Ketchup, and Pickles. Keep the assembled burger as ONE top-level food and put those parts only in its components array.",
    'coach component naming rule')
old_norm = "function normalizeFood(raw,depth=0){if(!raw||typeof raw!=='object'||depth>2)return null;const name=String(raw.name||'').trim().slice(0,120),amount=String(raw.amount||'').trim().slice(0,80);const calories=Number(raw.calories),protein=Number(raw.protein),carbs=Number(raw.carbs),fat=Number(raw.fat);if(!name||!amount||![calories,protein,carbs,fat].every(Number.isFinite))return null;const out={name,amount,calories:Math.max(0,Math.round(calories)),protein:Math.max(0,Math.round(protein*10)/10),carbs:Math.max(0,Math.round(carbs*10)/10),fat:Math.max(0,Math.round(fat*10)/10),confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0.65))};const components=depth<2&&Array.isArray(raw.components)?raw.components.map(x=>normalizeFood(x,depth+1)).filter(Boolean).slice(0,16):[];if(components.length)out.components=components;return out}\nfunction normalizeFoods(raw){const list=Array.isArray(raw)?raw:(raw?[raw]:[]);return list.map(normalizeFood).filter(Boolean).slice(0,12)}"
new_norm = r'''function foodKey(name=''){return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function inferComponentName(raw,parentName='',index=0){const alt=String(raw?.componentName||raw?.ingredient||raw?.label||raw?.part||'').trim();if(alt&&foodKey(alt)!==foodKey(parentName))return alt.slice(0,120);const amount=String(raw?.amount||'').toLowerCase(),cal=Number(raw?.calories)||0,p=Number(raw?.protein)||0,c=Number(raw?.carbs)||0,f=Number(raw?.fat)||0,parent=String(parentName||'');if(/patt|beef/.test(amount)||(p>=25&&c<=2&&f>=10))return 'Beef patties';if(/bacon|strip/.test(amount)||(p>=4&&p<20&&c<=2&&f>=4&&cal>=50&&cal<=140))return 'Bacon';if(/cheese/.test(amount)||(/slice/.test(amount)&&f>=5&&c<=5))return 'Cheese';if(/bun|roll/.test(amount)||c>=20)return 'Bun';if(/tbsp|tablespoon/.test(amount)){if(f>=5&&c<=2)return 'Mayonnaise';if(c>=3&&f<=2)return 'Ketchup'}if(cal<=15&&c<=3&&f<=1)return 'Pickles';if(/burger|baconator|cheeseburger|sandwich/i.test(parent))return `Ingredient ${index+1}`;return `Component ${index+1}`}
function normalizeFood(raw,depth=0,parentName='',index=0){if(!raw||typeof raw!=='object'||depth>2)return null;let name=String(raw.name||'').trim().slice(0,120),amount=String(raw.amount||'').trim().slice(0,80);const calories=Number(raw.calories),protein=Number(raw.protein),carbs=Number(raw.carbs),fat=Number(raw.fat);if(depth>0&&parentName&&foodKey(name)===foodKey(parentName))name=inferComponentName(raw,parentName,index);if(!name||!amount||![calories,protein,carbs,fat].every(Number.isFinite))return null;const out={name,amount,calories:Math.max(0,Math.round(calories)),protein:Math.max(0,Math.round(protein*10)/10),carbs:Math.max(0,Math.round(carbs*10)/10),fat:Math.max(0,Math.round(fat*10)/10),confidence:Math.max(0,Math.min(1,Number(raw.confidence)||0.65))};const components=depth<2&&Array.isArray(raw.components)?raw.components.map((x,i)=>normalizeFood(x,depth+1,name,i)).filter(Boolean).slice(0,16):[];if(components.length)out.components=components;return out}
function compositeAmount(name=''){if(/baconator|burger|cheeseburger|sandwich/i.test(name))return '1 sandwich';if(/burrito/i.test(name))return '1 burrito';if(/wrap/i.test(name))return '1 wrap';return '1 item'}
function repairRepeatedCompositeFoods(list=[]){const used=new Set(),out=[];for(let i=0;i<list.length;i++){if(used.has(i))continue;const item=list[i],key=foodKey(item?.name),matches=[];for(let j=i;j<list.length;j++){if(!used.has(j)&&foodKey(list[j]?.name)===key)matches.push(j)}const canGroup=matches.length>=3&&/baconator|burger|cheeseburger|sandwich|burrito|wrap|sub\b/i.test(String(item?.name||''))&&matches.every(j=>!Array.isArray(list[j]?.components)||!list[j].components.length);if(!canGroup){out.push(item);used.add(i);continue}const rows=matches.map(j=>list[j]);matches.forEach(j=>used.add(j));const t=rows.reduce((a,x)=>({calories:a.calories+x.calories,protein:a.protein+x.protein,carbs:a.carbs+x.carbs,fat:a.fat+x.fat,confidence:a.confidence+x.confidence}),{calories:0,protein:0,carbs:0,fat:0,confidence:0});out.push({name:item.name,amount:compositeAmount(item.name),calories:Math.round(t.calories),protein:Math.round(t.protein*10)/10,carbs:Math.round(t.carbs*10)/10,fat:Math.round(t.fat*10)/10,confidence:Math.round((t.confidence/rows.length)*100)/100,components:rows.map((x,n)=>({...x,name:inferComponentName(x,item.name,n)}))})}return out}
function normalizeFoods(raw){const list=Array.isArray(raw)?raw:(raw?[raw]:[]);return repairRepeatedCompositeFoods(list.map((x,i)=>normalizeFood(x,0,'',i)).filter(Boolean)).slice(0,12)}'''
s = replace_once(s, old_norm, new_norm, 'coach normalization repair')
s = replace_once(s,
    "For a composite restaurant or assembled food, keep it as one top-level food but include a components array when its build is known so the user can later see things like bun, patties, cheese, bacon, mayonnaise, ketchup, and pickles separately.",
    "For a composite restaurant or assembled food, keep it as ONE top-level food but include a components array when its build is known so the user can later see things like bun, patties, cheese, bacon, mayonnaise, ketchup, and pickles separately. NEVER emit those burger ingredients as separate top-level foods. Every component name must be only the ingredient name, not the restaurant/menu item name.",
    'coach structured prompt')
p.write_text(s)

# 5) Analyzer gets the same component naming guardrail and parent-aware normalization.
p = root / 'src/index.js'
s = p.read_text()
old_item = "function normalizeItem(item,depth=0){\n  if(!item||typeof item!=='object'||depth>2)return null;\n  const out={\n    name:String(item?.name||'Food').slice(0,100),amount:String(item?.amount||'').slice(0,60),\n    calories:Math.round(num(item?.calories,5000)),protein:round1(item?.protein),carbs:round1(item?.carbs),fat:round1(item?.fat),\n    confidence:Math.max(0,Math.min(1,Number(item?.confidence)||0.6)),source:String(item?.source||'AI estimate').slice(0,80)\n  };\n  const components=depth<2&&Array.isArray(item?.components)?item.components.slice(0,16).map(x=>normalizeItem(x,depth+1)).filter(Boolean):[];\n  if(components.length)out.components=components;\n  return out;\n}"
new_item = r'''function itemKey(name=''){return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function componentName(item,parentName='',index=0){const alt=String(item?.componentName||item?.ingredient||item?.label||item?.part||'').trim();if(alt&&itemKey(alt)!==itemKey(parentName))return alt.slice(0,100);const amount=String(item?.amount||'').toLowerCase(),cal=Number(item?.calories)||0,p=Number(item?.protein)||0,c=Number(item?.carbs)||0,f=Number(item?.fat)||0;if(/patt|beef/.test(amount)||(p>=25&&c<=2&&f>=10))return 'Beef patties';if(/bacon|strip/.test(amount)||(p>=4&&p<20&&c<=2&&f>=4&&cal>=50&&cal<=140))return 'Bacon';if(/cheese/.test(amount)||(/slice/.test(amount)&&f>=5&&c<=5))return 'Cheese';if(/bun|roll/.test(amount)||c>=20)return 'Bun';if(/tbsp|tablespoon/.test(amount)){if(f>=5&&c<=2)return 'Mayonnaise';if(c>=3&&f<=2)return 'Ketchup'}if(cal<=15&&c<=3&&f<=1)return 'Pickles';return `Ingredient ${index+1}`}
function normalizeItem(item,depth=0,parentName='',index=0){
  if(!item||typeof item!=='object'||depth>2)return null;
  let name=String(item?.name||'Food').slice(0,100);if(depth>0&&parentName&&itemKey(name)===itemKey(parentName))name=componentName(item,parentName,index);
  const out={
    name,amount:String(item?.amount||'').slice(0,60),
    calories:Math.round(num(item?.calories,5000)),protein:round1(item?.protein),carbs:round1(item?.carbs),fat:round1(item?.fat),
    confidence:Math.max(0,Math.min(1,Number(item?.confidence)||0.6)),source:String(item?.source||'AI estimate').slice(0,80)
  };
  const components=depth<2&&Array.isArray(item?.components)?item.components.slice(0,16).map((x,i)=>normalizeItem(x,depth+1,name,i)).filter(Boolean):[];
  if(components.length)out.components=components;
  return out;
}'''
s = replace_once(s, old_item, new_item, 'analyzer parent-aware components')
s = replace_once(s,
    "This breakdown is for later editing and substitution decisions. Do not invent unsupported components.",
    "This breakdown is for later editing and substitution decisions. CRITICAL: every component.name must be the ingredient itself and must NEVER repeat the parent food/menu-item name. A Baconator's components should be named Beef patties, Bacon, Cheese, Bun, Mayonnaise, Ketchup, Pickles, etc. Keep the assembled burger as one top-level item; do not emit its ingredients as separate top-level items. Do not invent unsupported components.",
    'analyzer component naming prompt')
p.write_text(s)

# 6) Edit breakdown should show clean ingredient names, not parent — ingredient repetition.
p = root / 'public/app.js'
s = p.read_text()
s = replace_once(s,
    "out.push({...x,name:parent?`${parent} — ${String(x.name||'Part').trim()}`:String(x.name||'Part').trim(),components:[]})",
    "out.push({...x,name:String(x.name||'Ingredient').trim(),components:[]})",
    'clean edit ingredient labels')
p.write_text(s)

# 7) Cache-bust Coach script loaded by the Worker shell.
p = root / 'src/index-wrapper.js'
s = p.read_text()
s = replace_once(s, '/fuel-coach.js?v=7', '/fuel-coach.js?v=8', 'coach cache v8')
p.write_text(s)

# 8) Regression coverage.
p = root / 'tests/coach-turntaking-components.test.mjs'
p.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const coach=fs.readFileSync(new URL('../public/fuel-coach.js',import.meta.url),'utf8');
const voice=fs.readFileSync(new URL('../public/fuel-voice-quality.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../src/fuel-coach-api.js',import.meta.url),'utf8');
const analyzer=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const swift=fs.readFileSync(new URL('../ios/Fuel/ContentView.swift',import.meta.url),'utf8');
const wrapper=fs.readFileSync(new URL('../src/index-wrapper.js',import.meta.url),'utf8');

test('Coach visibly separates listening thinking speaking and ready',()=>{
  assert.match(coach,/LISTENING — SAY IT NOW/);
  assert.match(coach,/COACH SPEAKING — WAIT/);
  assert.match(coach,/fuelCoachSpeechEnded/);
  assert.match(coach,/scheduleAutoListen/);
  assert.match(coach,/fuelCoachSpeechStart/);
  assert.match(coach,/setAnswer\(d\.answer\)/);
});

test('native voice reports exact playback completion to Coach',()=>{
  assert.match(swift,/fuelCoachNativeAudioEnded/);
  assert.match(voice,/fuelCoachNativeAudioEnded/);
  assert.match(voice,/fuelCoachSpeechEnded/);
});

test('short speech-recognition variants still open pending food review',()=>{
  assert.match(coach,/edit\|at it\|ad it\|added/);
});

test('composite restaurant foods stay top-level while ingredients get real names',()=>{
  assert.match(api,/CRITICAL COMPONENT NAMING RULE/);
  assert.match(api,/repairRepeatedCompositeFoods/);
  assert.match(api,/Beef patties/);
  assert.match(api,/Mayonnaise/);
  assert.match(api,/Ketchup/);
  assert.match(analyzer,/must NEVER repeat the parent food\/menu-item name/);
  assert.match(app,/name:String\(x\.name\|\|'Ingredient'\)\.trim\(\)/);
});

test('Coach cache is bumped for the new conversation UX',()=>{
  assert.match(wrapper,/fuel-coach\.js\?v=8/);
  assert.match(coach,/fuel-voice-quality\.js\?v=7/);
});
''')

print('Fuel Coach turn-taking and component repair applied')
