(()=>{
'use strict';
let audio=null,last='';
function stopAll(){try{speechSynthesis.cancel()}catch{};try{if(audio){audio.pause();audio.src='';audio=null}}catch{}}
async function speakNatural(text){
  text=String(text||'').replace(/Fuel Coach\s*·\s*OpenAI/gi,'').trim();
  if(!text||text===last||/^Thinking|^Analyzing today/i.test(text))return;
  last=text;stopAll();
  try{
    const r=await fetch('/api/fuel/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'tts',text})});
    if(!r.ok)throw Error('tts unavailable');
    const blob=await r.blob();audio=new Audio(URL.createObjectURL(blob));audio.playsInline=true;await audio.play();
  }catch{
    try{
      if(!('speechSynthesis' in window))return;
      const u=new SpeechSynthesisUtterance(text.replace(/\n+/g,'. '));u.rate=.97;u.pitch=1;u.volume=1;
      const voices=speechSynthesis.getVoices();
      const v=voices.find(x=>/^en-US/i.test(x.lang)&&/Samantha|Ava|Evan|Aaron|Daniel|Alex/i.test(x.name))||voices.find(x=>/^en-US/i.test(x.lang));if(v)u.voice=v;speechSynthesis.speak(u);
    }catch{}
  }
}
function install(){
  const answer=document.getElementById('fcAnswer');if(!answer)return false;
  const mo=new MutationObserver(()=>{const t=answer.textContent.trim();if(t)speakNatural(t)});mo.observe(answer,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target.closest('#fcClose'))stopAll()});
  return true;
}
if(!install()){const mo=new MutationObserver(()=>{if(install())mo.disconnect()});mo.observe(document.body,{childList:true,subtree:true})}
})();