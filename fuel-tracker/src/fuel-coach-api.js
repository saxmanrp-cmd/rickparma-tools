const system=`You are Fuel Coach inside a personal nutrition tracker. Use only the tracker data supplied in the request. Be concise, practical, specific, and numbers-driven. For ordinary questions, answer in 2-5 sentences unless the user asks for a detailed multi-day analysis. Prioritize sustainable fat loss, adequate protein, activity, and recovery. Never invent foods, activity, body measurements, trends, or Apple Health data. Never describe a measurement as stable, improving, worsening, rising, falling, or trending unless multiple dated measurements support that comparison. generatedAt is UTC and must never define the user's local today; use context.today or context.days[0]. If today's foodLogStatus is no_entries, intake is unknown, not zero: do not calculate remaining nutrition from zero or recommend eating/skipping based on an empty log. If Apple Health body-composition data is present, prefer the newest Apple Health values over older manual/InBody values for overlapping measurements. Identify Apple Health once when presenting several of its values. Use maintenance.estimatedTdee as the app's current maintenance estimate when present. Do not diagnose disease, prescribe or change medication, recommend starvation/dehydration/compensatory exercise, or automatically tell the user to eat back active calories.`;

function normalizeContext(raw){
  const context=raw&&typeof raw==='object'?raw:{};
  const days=Array.isArray(context.days)?context.days:[];
  const today=days[0]&&typeof days[0]==='object'?days[0]:null;
  return {...context,localDate:today?.date||context.localDate||null,today:context.today||today};
}

function directAnswer(body){
  if(body?.mode!=='question')return null;
  const q=String(body?.question||'').toLowerCase();
  const c=normalizeContext(body?.context||{});
  const tdee=Number(c?.maintenance?.estimatedTdee);
  const target=Number(c?.targets?.cal);
  const todayLogged=c?.today?.foodLogStatus==='logged';
  const eaten=Number(c?.today?.totals?.cal);
  const protein=Number(c?.today?.totals?.p);
  const carbs=Number(c?.today?.totals?.c);
  const fat=Number(c?.today?.totals?.f);
  const proteinTarget=Number(c?.targets?.pro);
  const multi=/week|days|trend|average|compare|over time/.test(q);
  if(!Number.isFinite(tdee)||!Number.isFinite(target))return null;
  if(/maintenance|tdee/.test(q)&&!multi){
    return `Your estimated maintenance is about ${Math.round(tdee)} calories per day. Your target is ${Math.round(target)}, for a planned deficit of about ${Math.round(tdee-target)} calories per day.`;
  }
  if(/deficit|under maintenance|surplus|below maintenance|over maintenance/.test(q)&&!multi){
    if(!todayLogged||!Number.isFinite(eaten))return `Your estimated maintenance is about ${Math.round(tdee)} calories, but today's food log is empty, so I can't calculate today's calories below maintenance yet.`;
    const d=tdee-eaten;
    return d>=0?`You've logged about ${Math.round(eaten)} calories today, putting you about ${Math.round(d)} calories below your ${Math.round(tdee)} maintenance estimate.`:`You've logged about ${Math.round(eaten)} calories today, putting you about ${Math.abs(Math.round(d))} calories over your ${Math.round(tdee)} maintenance estimate.`;
  }
  if(/calories.*left|left.*calories|how many calories/.test(q)&&!multi){
    if(!todayLogged||!Number.isFinite(eaten))return `Your calorie target is ${Math.round(target)}, but today's food log is empty, so I can't calculate what's left yet.`;
    return `You've logged about ${Math.round(eaten)} calories today, so you have about ${Math.max(0,Math.round(target-eaten))} calories left against your ${Math.round(target)} target.`;
  }
  if(/protein.*left|left.*protein|how.*protein/.test(q)&&!multi&&Number.isFinite(proteinTarget)){
    if(!todayLogged||!Number.isFinite(protein))return `Your protein target is ${Math.round(proteinTarget)} grams, but today's food log is empty, so I can't calculate what's left yet.`;
    return `You've logged about ${Math.round(protein)} grams of protein today, so you have about ${Math.max(0,Math.round(proteinTarget-protein))} grams left against your ${Math.round(proteinTarget)}-gram target.`;
  }
  if(/where am i at|what are my numbers|my totals|macros today|today's macros|today macros/.test(q)&&!multi){
    if(!todayLogged||![eaten,protein,carbs,fat].every(Number.isFinite))return `Today's food log is empty, so I don't have nutrition totals to summarize yet.`;
    return `Today you're at about ${Math.round(eaten)} calories, ${Math.round(protein)}g protein, ${Math.round(carbs)}g carbs, and ${Math.round(fat)}g fat. That's ${Math.max(0,Math.round(target-eaten))} calories and ${Math.max(0,Math.round(proteinTarget-protein))}g protein left against your targets.`;
  }
  return null;
}

function prompt(body){
  const mode=body?.mode==='scan'?'scan':'question';
  const question=String(body?.question||'').trim().slice(0,800);
  const task=mode==='scan'
    ? `Analyze today using TRACKER DATA.today as the authoritative local-day record. Use recent days only for supported comparisons. If today's food log is empty, say intake is unlogged rather than zero. Use maintenance.estimatedTdee for deficit calculations. Give four compact headings: WHERE YOU STAND, REST OF TODAY, TOMORROW, WEEKLY OUTLOOK. Do not invent trends.`
    : `Answer this question directly using the tracker data. Use TRACKER DATA.today for anything about today and maintenance.estimatedTdee for maintenance/deficit math. If today's food log is empty, treat intake as unknown. Prefer current Apple Health body-composition values over older manual values. Do not infer a trend from one measurement. User question: ${question||'No question supplied.'}`;
  const tracker=JSON.stringify(normalizeContext(body?.context||{})).slice(0,24000);
  return `${task}\n\nTRACKER DATA:\n${tracker}`;
}

function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  return (data?.output||[]).flatMap(x=>x?.content||[]).filter(x=>x?.type==='output_text').map(x=>x.text).join('\n').trim();
}

function cleanAnswer(text){
  let s=String(text||'').trim();
  if(!s)return s;
  if(/Apple Health/i.test(s)){
    s=s.replace(/\s*\(Source:\s*Apple Health\)/gi,'');
    s=s.replace(/\s*\[Source:\s*Apple Health\]/gi,'');
    s=s.replace(/\s*—\s*Source:\s*Apple Health\b/gi,'');
  }
  return s.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

function json(data,status=200){return Response.json(data,{status,headers:{'cache-control':'no-store'}})}

async function tts(body,env){
  const text=String(body?.text||'').trim().slice(0,5000);
  if(!text)return json({ok:false,error:'Nothing to speak.'},400);
  if(!env.OPENAI_API_KEY)return json({ok:false,error:'OpenAI key missing from Worker.'},503);
  try{
    const r=await fetch('https://api.openai.com/v1/audio/speech',{
      method:'POST',
      headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},
      body:JSON.stringify({model:'gpt-4o-mini-tts',voice:env.FUEL_COACH_VOICE||'cedar',input:text,instructions:'Use a composed, direct, calm voice with the feel of a confident one-on-one coach. Speak naturally and conversationally in American English. Keep the delivery grounded, measured, low-drama, and clear. Avoid announcer energy, exaggerated friendliness, sing-song cadence, or robotic pacing.',response_format:'mp3'})
    });
    if(!r.ok){
      let upstreamCode='';
      let upstreamMessage='';
      try{const d=await r.json();upstreamCode=String(d?.error?.code||d?.error?.type||'').slice(0,100);upstreamMessage=String(d?.error?.message||'').slice(0,220)}catch{}
      return json({ok:false,error:'OpenAI TTS request failed.',upstreamStatus:r.status,upstreamCode,upstreamMessage},502);
    }
    const bytes=await r.arrayBuffer();
    if(!bytes.byteLength)return json({ok:false,error:'OpenAI returned empty audio.'},502);
    return new Response(bytes,{status:200,headers:{'content-type':'audio/mpeg','cache-control':'no-store','x-fuel-voice-provider':'openai'}});
  }catch(err){return json({ok:false,error:'OpenAI TTS network request failed.',detail:String(err?.message||'network error').slice(0,180)},502)}
}

export async function fuelCoach(request,env){
  let body;
  try{body=await request.json()}catch{return json({ok:false,error:'Invalid request.'},400)}
  if(body?.mode==='tts')return tts(body,env);
  if(body?.mode!=='scan'&&body?.mode!=='question')return json({ok:false,error:'Unknown Fuel Coach request.'},400);
  if(body.mode==='question'&&!String(body?.question||'').trim())return json({ok:false,error:'Ask Fuel Coach a question first.'},400);
  const direct=directAnswer(body);if(direct)return json({ok:true,provider:'local-math',reasoningEffort:'none',answer:direct});
  const input=prompt(body);

  if(env.OPENAI_API_KEY){
    try{
      const reasoningEffort=body.mode==='scan'?'medium':'low';
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:env.FUEL_COACH_MODEL||'gpt-5.6-terra',instructions:system,input,reasoning:{effort:reasoningEffort},max_output_tokens:650})});
      const d=await r.json();
      if(r.ok){const answer=cleanAnswer(outputText(d));if(answer)return json({ok:true,provider:'openai',reasoningEffort,answer})}
    }catch{}
  }

  if(env.AI){
    try{
      const result=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{messages:[{role:'system',content:system},{role:'user',content:input}],temperature:0.2,max_completion_tokens:650,chat_template_kwargs:{enable_thinking:false}});
      const answer=cleanAnswer(result?.choices?.[0]?.message?.content||result?.response||result?.result);
      if(answer)return json({ok:true,provider:'cloudflare',answer});
    }catch{}
  }
  return json({ok:false,error:'Fuel Coach is ready, but its AI connection is not available right now.'},503);
}
