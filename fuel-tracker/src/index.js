const AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

function readAiText(result) {
  return result?.choices?.[0]?.message?.content || result?.response || result?.result || '';
}

function parseJsonLoose(text) {
  if (typeof text !== 'string') return null;
  const clean = text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start,end+1)); } catch {}
  }
  return null;
}

function num(value,max=10000) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0,Math.min(max,n)) : 0;
}

function normalize(data) {
  const items = Array.isArray(data?.items) ? data.items.slice(0,20).map(item=>({
    name:String(item?.name||'Food').slice(0,80), amount:String(item?.amount||'').slice(0,40),
    calories:Math.round(num(item?.calories,5000)), protein:Math.round(num(item?.protein,500)*10)/10,
    carbs:Math.round(num(item?.carbs,500)*10)/10, fat:Math.round(num(item?.fat,500)*10)/10,
    confidence:Math.max(0,Math.min(1,Number(item?.confidence)||0.6)),
  })) : [];
  const totals = items.reduce((a,x)=>({calories:a.calories+x.calories,protein:a.protein+x.protein,carbs:a.carbs+x.carbs,fat:a.fat+x.fat}),{calories:0,protein:0,carbs:0,fat:0});
  return {items,totals:{calories:Math.round(totals.calories),protein:Math.round(totals.protein*10)/10,carbs:Math.round(totals.carbs*10)/10,fat:Math.round(totals.fat*10)/10},summary:String(data?.summary||items.map(x=>`${x.amount} ${x.name}`.trim()).join(', ')).slice(0,400),note:String(data?.note||'Nutrition is an estimate; adjust portions before saving.').slice(0,300)};
}

async function analyze(request,env) {
  if (!env.AI) return json({error:'AI food analysis is not configured.'},{status:503});
  const length = Number(request.headers.get('content-length')||0);
  if (length > 6_000_000) return json({error:'That photo is too large. Try a smaller image.'},{status:413});
  try {
    const form = await request.formData();
    const text = String(form.get('text')||'').trim().slice(0,1800);
    const image = form.get('image');
    let imageDescription = '';
    if (image && typeof image.arrayBuffer === 'function' && image.size > 0) {
      if (image.size > 5_000_000) return json({error:'That photo is too large. Try a smaller image.'},{status:413});
      const converted = await env.AI.toMarkdown({name:image.name||'meal.jpg',blob:new Blob([await image.arrayBuffer()],{type:image.type||'image/jpeg'})},{conversionOptions:{output:{format:'text'},image:{descriptionLanguage:'en'}}});
      if (converted?.format !== 'error') imageDescription = String(converted?.data||'').slice(0,5000);
    }
    if (!text && !imageDescription) return json({error:'Type what you ate or take a food photo.'},{status:400});
    const prompt = `Estimate nutrition for one meal from the information below. This is a personal food log, not medical advice. Be practical and conservative. Use common cooked serving values. If a portion is unclear, make a reasonable estimate and lower confidence. Include sauces, butter, oils, breading, cheese and cooking fats when mentioned or clearly visible. Do not invent unsupported foods.\n\nUSER TEXT:\n${text||'(none)'}\n\nIMAGE DESCRIPTION:\n${imageDescription||'(none)'}\n\nReturn ONLY valid JSON in this shape:\n{"items":[{"name":"food","amount":"estimated amount","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0}],"summary":"short meal description","note":"short uncertainty note"}\nProtein, carbs and fat are grams; calories are kcal.`;
    const result = await env.AI.run(AI_MODEL,{messages:[{role:'system',content:'You are a careful nutrition logging assistant. Output JSON only.'},{role:'user',content:prompt}],temperature:0.2,max_completion_tokens:900,chat_template_kwargs:{enable_thinking:false}});
    const parsed = parseJsonLoose(readAiText(result));
    if (!parsed) return json({error:'I could not read that meal clearly. Add portion sizes or retake the photo.'},{status:422});
    const resultData = normalize(parsed);
    if (!resultData.items.length) return json({error:'I could not identify enough food to calculate. Add a short description and try again.'},{status:422});
    return json({ok:true,...resultData});
  } catch (error) { console.error('fuel analyze error',error); return json({error:'Food analysis had a hiccup. You can still use Quick Add or manual macros.'},{status:500}); }
}

function simplifyTrackingHtml(html) {
  return html
    .replace('<span class="pill" id="modeLabel">Keto</span>','')
    .replace(/<div class="spacer"><\/div><div class="row"><button class="secondary modeBtn"[\s\S]*?<\/div><\/div>\n<div class="card"><div class="sectiontitle"><h2>Quick add<\/h2>/, '</div>\n<div class="card"><div class="sectiontitle"><h2>Quick add</h2>')
    .replace('<label>Mode<select id="sMode"><option>Carnivore</option><option>Keto</option><option>Flex</option></select></label><label>Carb guide<input id="sCarb" type="number"></label>','<input id="sMode" type="hidden" value="Keto"><input id="sCarb" type="hidden" value="50">')
    .replace("$('modeLabel').textContent=s.mode;",'')
    .replace(/var mb=document\.querySelectorAll\('\.modeBtn'\);[\s\S]*?\}\n/, '');
}

async function serveAsset(request,env) {
  if (!env.ASSETS) return new Response('Fuel Tracker assets unavailable',{status:503});
  const response = await env.ASSETS.fetch(request);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html') || request.method === 'HEAD') return response;
  const updated = simplifyTrackingHtml(await response.text());
  const headers = new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');
  headers.set('x-fuel-version','1.1.2');
  return new Response(updated,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ok:true,service:'rick-fuel-tracker',version:'1.1.2'});
    if (url.pathname === '/api/fuel/analyze' && request.method === 'POST') return analyze(request,env);
    return serveAsset(request,env);
  },
};
