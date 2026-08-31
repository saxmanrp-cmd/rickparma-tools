(()=>{
'use strict';
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
function stopAll(){
  try{speechSynthesis.cancel()}catch{}
  try{if(audio){audio.pause();audio.src='';audio=null}}catch{}
  try{nativeSpeech()?.postMessage({action:'stop'})}catch{}
}
async function speakNatural(text){
  text=cleanForSpeech(text);
  if(!text||text===last||/^Thinking|^Analyzing today/i.test(text))return;
  last=text;stopAll();
  try{
    const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'tts',text})});
    if(!r.ok)throw Error('tts unavailable');
    const blob=await r.blob();
    if(!blob.size)throw Error('empty tts');
    audio=new Audio(URL.createObjectURL(blob));audio.playsInline=true;await audio.play();
    return;
  }catch{}
  try{
    const bridge=nativeSpeech();
    if(bridge){
      const result=await bridge.postMessage({action:'speak',text});
      if(result?.ok)return;
    }
  }catch{}
  try{
    if(!('speechSynthesis' in window))return;
    const u=new SpeechSynthesisUtterance(text);u.rate=.97;u.pitch=1;u.volume=1;
    const voices=speechSynthesis.getVoices();
    const v=voices.find(x=>/^en-US/i.test(x.lang)&&/Samantha|Ava|Evan|Aaron|Daniel|Alex/i.test(x.name))||voices.find(x=>/^en-US/i.test(x.lang));if(v)u.voice=v;speechSynthesis.speak(u);
  }catch{}
}
function install(){
  const answer=document.getElementById('fcAnswer');if(!answer)return false;
  const mo=new MutationObserver(()=>{const t=answer.textContent.trim();if(t)speakNatural(t)});mo.observe(answer,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target.closest('#fcClose'))stopAll()});
  return true;
}
if(!install()){const mo=new MutationObserver(()=>{if(install())mo.disconnect()});mo.observe(document.body,{childList:true,subtree:true})}
})();