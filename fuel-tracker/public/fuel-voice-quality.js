(()=>{
'use strict';
if(window.__fuelVoiceQualityActive)return;
window.__fuelVoiceQualityActive=true;
let audio=null,last='';
function cleanForSpeech(text){return String(text||'').replace(/Fuel Coach\s*·\s*OpenAI/gi,'').replace(/\*\*/g,'').replace(/^\s*[*•-]\s+/gm,'').replace(/\n{2,}/g,'. ').replace(/\n+/g,' ').replace(/\s{2,}/g,' ').trim()}
function nativeSpeech(){return window.webkit?.messageHandlers?.fuelSpeech}
function stopSystemSpeech(){try{speechSynthesis.cancel()}catch{};try{nativeSpeech()?.postMessage({action:'stop'})}catch{}}
function stopAll(){stopSystemSpeech();try{if(audio){audio.pause();audio.src='';audio=null}}catch{}}
function setVoiceStatus(text,ok=false){try{const el=document.getElementById('fcState');if(el)el.textContent=text;localStorage.setItem('fuel-voice-status-v1',JSON.stringify({text,ok,at:new Date().toISOString()}))}catch{}}
async function speakNatural(text){text=cleanForSpeech(text);if(!text)return;if(text===last){last=''}last=text;stopAll();try{const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'tts',text})});if(!r.ok){let detail=`HTTP ${r.status}`;try{const d=await r.json();if(d?.error)detail=d.error;if(d?.upstreamStatus)detail+=` (${d.upstreamStatus})`;if(d?.upstreamCode)detail+=` ${d.upstreamCode}`}catch{}throw Error(detail)}const blob=await r.blob();if(!blob.size)throw Error('empty audio response');stopSystemSpeech();audio=new Audio(URL.createObjectURL(blob));audio.playsInline=true;audio.onended=()=>setVoiceStatus('Ready',true);await audio.play();stopSystemSpeech();setTimeout(stopSystemSpeech,120);setTimeout(stopSystemSpeech,450);setVoiceStatus('Speaking with Fuel Coach…',true)}catch(err){stopSystemSpeech();setVoiceStatus(`OpenAI voice unavailable — ${err?.message||'TTS unavailable'}`,false)}}
window.addEventListener('fuelCoachAnswer',e=>speakNatural(e?.detail?.text||''));
window.addEventListener('fuelCoachStop',stopAll);
document.addEventListener('click',e=>{if(e.target.closest('#fcClose'))stopAll()});
})();