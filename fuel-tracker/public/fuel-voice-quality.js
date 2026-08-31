(()=>{
'use strict';
if(window.__fuelVoiceQualityActive)return;
window.__fuelVoiceQualityActive=true;
let audio=null,last='';
function cleanForSpeech(text){
  return String(text||'')
    .replace(/Fuel Coach\s*·\s*OpenAI/gi,'')
    .replace(/\*\*/g,'')
    .replace(/^\s*[*•-]\s+/gm,'')
    .replace(/\n{2,}/g,'. ')
    .replace(/\n+/g,' ')
    .replace(/\s{2,}/g,' ')
    .trim();
}
function nativeSpeech(){return window.webkit?.messageHandlers?.fuelSpeech}
function stopSystemSpeech(){
  try{speechSynthesis.cancel()}catch{}
  try{nativeSpeech()?.postMessage({action:'stop'})}catch{}
}
function stopAll(){
  stopSystemSpeech();
  try{if(audio){audio.pause();audio.src='';audio=null}}catch{}
}
function setVoiceStatus(text,ok=false){
  try{
    let el=document.getElementById('fuelVoiceStatus');
    if(!el){
      el=document.createElement('div');
      el.id='fuelVoiceStatus';
      el.style.cssText='margin-top:8px;font-size:12px;line-height:1.35;opacity:.8;';
      const answer=document.getElementById('fcAnswer');
      if(answer?.parentNode)answer.parentNode.insertBefore(el,answer.nextSibling);
    }
    if(el){el.textContent=text;el.dataset.ok=ok?'1':'0'}
    localStorage.setItem('fuel-voice-status-v1',JSON.stringify({text,ok,at:new Date().toISOString()}));
  }catch{}
}
async function speakNatural(text){
  text=cleanForSpeech(text);
  if(!text||text===last||/^Thinking|^Analyzing today/i.test(text))return;
  last=text;stopAll();
  try{
    const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'tts',text})});
    if(!r.ok){
      let detail=`HTTP ${r.status}`;
      try{const d=await r.json();if(d?.error)detail=d.error;if(d?.upstreamStatus)detail+=` (${d.upstreamStatus})`;if(d?.upstreamCode)detail+=` ${d.upstreamCode}`}catch{}
      throw Error(detail);
    }
    const blob=await r.blob();
    if(!blob.size)throw Error('empty audio response');
    stopSystemSpeech();
    audio=new Audio(URL.createObjectURL(blob));
    audio.playsInline=true;
    await audio.play();
    stopSystemSpeech();
    setTimeout(stopSystemSpeech,120);
    setTimeout(stopSystemSpeech,450);
    setVoiceStatus('Voice: OpenAI natural voice',true);
    return;
  }catch(err){
    stopSystemSpeech();
    setVoiceStatus(`Voice: OpenAI unavailable — ${err?.message||'TTS unavailable'}`,false);
  }
}
function install(){
  const answer=document.getElementById('fcAnswer');if(!answer)return false;
  const mo=new MutationObserver(()=>{const t=answer.textContent.trim();if(t)speakNatural(t)});
  mo.observe(answer,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target.closest('#fcClose'))stopAll()});
  return true;
}
if(!install()){
  const mo=new MutationObserver(()=>{if(install())mo.disconnect()});
  mo.observe(document.body,{childList:true,subtree:true});
}
})();