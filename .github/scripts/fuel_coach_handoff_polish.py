from pathlib import Path

root = Path('fuel-tracker')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch marker: {label}')
    return text.replace(old, new, 1)

# Coach client: natural add/log phrases, slower audio->mic handoff, one retry, raw envelope defense.
p = root / 'public/fuel-coach.js'
s = p.read_text()

s = replace_once(
    s,
    "let recognition=null,listening=false,phase='ready',autoListenTimer=null;",
    "let recognition=null,listening=false,phase='ready',autoListenTimer=null,autoListenRetry=0;",
    'coach retry state',
)

s = replace_once(
    s,
    "function isAddCommand(q=''){return /^(?:yes|yep|yeah|sure|ok|okay|do it|go ahead|add it|add that|log it|log that|save it|save that|add this|log this|edit|at it|ad it|added)[.! ]*$/i.test(String(q).trim())}",
    "function isAddCommand(q=''){const s=String(q||'').toLowerCase().replace(/[^a-z0-9' ]+/g,' ').replace(/\\s+/g,' ').trim();if(/^(?:yes|yep|yeah|sure|ok|okay|do it|go ahead|edit|at it|ad it|added)$/.test(s))return true;return /^(?:(?:please|go ahead and) )?(?:add|added|log|save|put)(?: (?:it|that|this))?(?: (?:to|in|into))?(?: (?:my|the|today's|daily))?(?: (?:food )?log)?(?: for me)?$/.test(s)}",
    'natural add commands',
)

s = replace_once(
    s,
    "function scheduleAutoListen(){clearTimeout(autoListenTimer);if(!$('fuelCoachModal')?.classList.contains('open'))return;if(!pendingFoods()){setPhase('ready','Ready.');return}setPhase('ready','Coach finished. I’ll listen for your reply next.');autoListenTimer=setTimeout(()=>{if($('fuelCoachModal')?.classList.contains('open')&&!listening&&pendingFoods())toggleListen()},450)}",
    "function retryAutoListen(){clearTimeout(autoListenTimer);if(!$('fuelCoachModal')?.classList.contains('open')||!pendingFoods()||autoListenRetry>=1){setPhase('ready',pendingFoods()?'I missed that. Tap the microphone and say add it.':'Ready.');return}autoListenRetry++;setPhase('ready','I missed that — reopening the microphone…');autoListenTimer=setTimeout(()=>{if($('fuelCoachModal')?.classList.contains('open')&&!listening&&pendingFoods())toggleListen(true)},850)}\nfunction scheduleAutoListen(){clearTimeout(autoListenTimer);if(!$('fuelCoachModal')?.classList.contains('open'))return;if(!pendingFoods()){setPhase('ready','Ready.');return}autoListenRetry=0;setPhase('ready','GET READY — microphone opening…');autoListenTimer=setTimeout(()=>{if($('fuelCoachModal')?.classList.contains('open')&&!listening&&pendingFoods())toggleListen(true)},950)}",
    'auto listen timing and retry',
)

s = replace_once(
    s,
    "async function nativeListen(){const bridge=nativeRecognition();if(!bridge)return false;stopSpeaking();$('fcQuestion').value='';setListening(true);try{const result=await bridge.postMessage({action:'transcribe'});setListening(false);if(!result?.ok){setPhase('ready',result?.error||'I could not hear that clearly.');return true}const text=String(result.text||'').trim();if(!text){setPhase('ready','I could not hear that clearly.');return true}$('fcQuestion').value=text;setPhase('thinking','Got it — working on that…');await run('question',text);return true}catch(e){setListening(false);setState(e?.message||'I could not hear that clearly.');return true}}",
    "async function nativeListen(autoReply=false){const bridge=nativeRecognition();if(!bridge)return false;stopSpeaking();$('fcQuestion').value='';setListening(true);try{const result=await bridge.postMessage({action:'transcribe'});setListening(false);if(!result?.ok){if(autoReply){retryAutoListen();return true}setPhase('ready',result?.error||'I could not hear that clearly.');return true}const text=String(result.text||'').trim();if(!text){if(autoReply){retryAutoListen();return true}setPhase('ready','I could not hear that clearly.');return true}$('fcQuestion').value=text;setPhase('thinking','Got it — working on that…');await run('question',text);return true}catch(e){setListening(false);if(autoReply){retryAutoListen();return true}setState(e?.message||'I could not hear that clearly.');return true}}",
    'native auto reply retry',
)

s = replace_once(
    s,
    "async function toggleListen(){if(listening){try{nativeRecognition()?.postMessage({action:'stop'})}catch{};try{recognition?.stop()}catch{};setListening(false);return}if(await nativeListen())return;stopSpeaking();const r=ensureRecognition();if(!r){setPhase('ready','Voice input is not available here.');return}$('fcQuestion').value='';try{r.start()}catch{}}",
    "async function toggleListen(autoReply=false){if(listening){try{nativeRecognition()?.postMessage({action:'stop'})}catch{};try{recognition?.stop()}catch{};setListening(false);return}if(await nativeListen(autoReply))return;stopSpeaking();const r=ensureRecognition();if(!r){setPhase('ready','Voice input is not available here.');return}$('fcQuestion').value='';try{r.start()}catch{}}",
    'toggle auto reply',
)

run_old = "async function run(mode,question=''){question=String(question||'').trim();if(!question){setState('Ask me a question first.');return}if(isAddCommand(question)&&pendingFoods()){addPending(question);return}stopSpeaking();setPhase('thinking','Thinking…');try{const pending=pendingFoods();const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'question',question,context:context(question),conversation:recentConversation(),pendingFoods:pending?.foods||[]})});const d=await r.json();if(!d.ok)throw Error(d.error||'Unable to answer');const foods=Array.isArray(d.foods)?d.foods:(d.food?[d.food]:[]);if(foods.length)setPendingFoods(foods);saveHistory(question,d.answer,'question');renderPendingAction();setAnswer(d.answer);setPhase('thinking','Answer ready — preparing Coach voice…');window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:d.answer}}))}catch(e){setPhase('ready',e.message||'Fuel Coach could not answer right now.')}}"
run_new = "function decodeCoachEnvelope(d){if(!d||typeof d!=='object')return d;let answer=String(d.answer||'').trim(),foods=Array.isArray(d.foods)?d.foods:(d.food?[d.food]:[]);let candidate=answer;for(let i=0;i<3&&candidate;i++){try{const parsed=JSON.parse(candidate);if(typeof parsed==='string'){candidate=parsed;continue}if(parsed&&typeof parsed==='object'&&typeof parsed.answer==='string'){answer=parsed.answer.trim();const nested=Array.isArray(parsed.foods)?parsed.foods:(parsed.food?[parsed.food]:[]);if(nested.length)foods=nested;break}}catch{}break}if(/^\\s*\\{/.test(answer)){const m=answer.match(/\\\"answer\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"\\\\])*)/s);if(m){try{answer=JSON.parse('\\\"'+m[1].replace(/\\\"$/,'')+'\\\"')}catch{answer=m[1].replace(/\\\\n/g,' ').replace(/\\\\\\\"/g,'\\\"')}}}return {...d,answer,foods}}\nasync function run(mode,question=''){question=String(question||'').trim();if(!question){setState('Ask me a question first.');return}if(isAddCommand(question)&&pendingFoods()){addPending(question);return}stopSpeaking();setPhase('thinking','Thinking…');try{const pending=pendingFoods();const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'question',question,context:context(question),conversation:recentConversation(),pendingFoods:pending?.foods||[]})});let d=decodeCoachEnvelope(await r.json());if(!d.ok)throw Error(d.error||'Unable to answer');const foods=Array.isArray(d.foods)?d.foods:(d.food?[d.food]:[]);if(foods.length)setPendingFoods(foods);saveHistory(question,d.answer,'question');renderPendingAction();setAnswer(d.answer);setPhase('thinking','Answer ready — preparing Coach voice…');window.dispatchEvent(new CustomEvent('fuelCoachAnswer',{detail:{text:d.answer}}))}catch(e){setPhase('ready',e.message||'Fuel Coach could not answer right now.')}}"
s = replace_once(s, run_old, run_new, 'client envelope decoder')
p.write_text(s)

# Coach API: recursively unwrap double-encoded JSON and never expose the raw JSON envelope as prose.
p = root / 'src/fuel-coach-api.js'
s = p.read_text()
s = replace_once(
    s,
    "function unpackQuestionAnswer(text){const parsed=parseJsonLoose(text);if(parsed&&typeof parsed.answer==='string'&&parsed.answer.trim())return {answer:cleanAnswer(parsed.answer),foods:normalizeFoods(parsed.foods??parsed.food)};return {answer:cleanAnswer(text),foods:[]}}",
    "function unpackQuestionAnswer(text){let candidate=String(text||''),parsed=null;for(let i=0;i<3;i++){parsed=parseJsonLoose(candidate);if(typeof parsed==='string'&&parsed.trim()&&parsed!==candidate){candidate=parsed.trim();continue}break}if(parsed&&typeof parsed==='object'&&typeof parsed.answer==='string'&&parsed.answer.trim())return {answer:cleanAnswer(parsed.answer),foods:normalizeFoods(parsed.foods??parsed.food)};const raw=String(candidate||text||'').trim(),m=raw.match(/\\\"answer\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"\\\\])*)/s);if(m){let answer=m[1];try{answer=JSON.parse('\\\"'+answer.replace(/\\\"$/,'')+'\\\"')}catch{answer=answer.replace(/\\\\n/g,' ').replace(/\\\\\\\"/g,'\\\"')}return {answer:cleanAnswer(answer),foods:[]}}return {answer:/^\\s*[\\{\\[]/.test(raw)?'I got the nutrition result, but the structured food data did not finish cleanly. Please try that food request once more.':cleanAnswer(raw),foods:[]}}",
    'server envelope decoder',
)
s = replace_once(
    s,
    "Keep the assembled burger as ONE top-level food and put those parts only in its components array.",
    "Keep the assembled burger as ONE top-level food and put those parts only in its components array. Return the JSON object directly; NEVER JSON-encode the entire object as a quoted string.",
    'no double encoded JSON instruction',
)
p.write_text(s)

# Cache-bust Coach client.
p = root / 'src/index-wrapper.js'
s = p.read_text()
s = replace_once(s, '/fuel-coach.js?v=8', '/fuel-coach.js?v=9', 'coach cache bump')
p.write_text(s)

# Tests.
p = root / 'tests/coach-turntaking-components.test.mjs'
s = p.read_text()
s = replace_once(s, "  assert.match(coach,/edit\\|at it\\|ad it\\|added/);", "  assert.match(coach,/go ahead and/);\n  assert.match(coach,/today's/);\n  assert.match(coach,/retryAutoListen/);\n  assert.match(coach,/950/);", 'natural speech test')
s = replace_once(s, "test('Coach cache is bumped for the new conversation UX',()=>{\n  assert.match(wrapper,/fuel-coach\\.js\\?v=8/);", "test('raw Coach JSON is unwrapped and never shown as the answer',()=>{\n  assert.match(coach,/decodeCoachEnvelope/);\n  assert.match(api,/NEVER JSON-encode/);\n  assert.match(api,/structured food data did not finish cleanly/);\n});\n\ntest('Coach cache is bumped for the new conversation UX',()=>{\n  assert.match(wrapper,/fuel-coach\\.js\\?v=9/);", 'cache and envelope tests')
p.write_text(s)

# Update stale cache assertions elsewhere.
for rel in ['tests/conversation-natural-units.test.mjs','tests/meal-mode.test.mjs']:
    p = root / rel
    s = p.read_text()
    s = s.replace('fuel-coach\\.js\\?v=8', 'fuel-coach\\.js\\?v=9')
    s = s.replace('fuel-coach\\.js\\?v=7', 'fuel-coach\\.js\\?v=9')
    p.write_text(s)

print('Fuel Coach handoff polish applied')
