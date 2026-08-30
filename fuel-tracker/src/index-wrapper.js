import baseWorker from './index.js';

const knownProducts = {
  '081950001415': {
    name: 'iForce Nutrition ISOTEAN Vanilla Dream',
    brand: 'iForce Nutrition',
    amount: '1 scoop (34 g)',
    calories: 140,
    protein: 30,
    carbs: 3,
    fat: 0.5,
    source: 'Verified product label'
  }
};

const json = (data, init={}) => new Response(JSON.stringify(data), {
  ...init,
  headers: {'content-type':'application/json; charset=utf-8', ...(init.headers||{})}
});

function cleanCode(url){
  return String(url.searchParams.get('code')||'').replace(/\D/g,'').slice(0,18);
}

function readAiText(result){
  return result?.choices?.[0]?.message?.content || result?.response || result?.result || '';
}

function parseJsonLoose(text){
  if(typeof text !== 'string') return null;
  const clean = text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try { return JSON.parse(clean); } catch {}
  const a=clean.indexOf('{'), b=clean.lastIndexOf('}');
  if(a>=0 && b>a){ try { return JSON.parse(clean.slice(a,b+1)); } catch {} }
  return null;
}

async function fallbackBarcode(code, env){
  if(knownProducts[code]){
    return json({ok:true, product:knownProducts[code], note:'Verified nutrition data for this UPC. Check your label if the formula or serving size differs.'});
  }

  let title='', brand='';
  try{
    const r=await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`);
    if(r.ok){
      const d=await r.json();
      const item=d?.items?.[0];
      title=String(item?.title||'').trim();
      brand=String(item?.brand||'').trim();
    }
  }catch{}

  if(title && env.AI){
    try{
      const prompt=`A packaged food with UPC ${code} was identified as ${brand?brand+' ':''}${title}. Estimate the nutrition for one normal labeled serving. Return ONLY JSON: {"name":"","brand":"","amount":"","calories":0,"protein":0,"carbs":0,"fat":0,"source":"AI fallback from product identity"}. If you are not confident, still return a conservative estimate and label the source as AI fallback.`;
      const result=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{
        messages:[{role:'system',content:'You are a careful nutrition lookup assistant. JSON only.'},{role:'user',content:prompt}],
        temperature:0.1,
        max_completion_tokens:500,
        chat_template_kwargs:{enable_thinking:false}
      });
      const p=parseJsonLoose(readAiText(result));
      if(p){
        const product={
          name:String(p.name||title), brand:String(p.brand||brand), amount:String(p.amount||'1 serving'),
          calories:Number(p.calories)||0, protein:Number(p.protein)||0, carbs:Number(p.carbs)||0, fat:Number(p.fat)||0,
          source:String(p.source||'AI fallback from product identity')
        };
        return json({ok:true, product, note:'This barcode was not in the primary nutrition database, so Fuel identified the product from a secondary UPC source and estimated the macros. Verify the package label before saving.'});
      }
    }catch{}
  }

  return null;
}

export default {
  async fetch(request, env, ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/fuel/barcode' && request.method==='GET'){
      const code=cleanCode(url);
      if(knownProducts[code]) return fallbackBarcode(code, env);
      const primary=await baseWorker.fetch(request,env,ctx);
      if(primary.status!==404) return primary;
      const fallback=await fallbackBarcode(code,env);
      if(fallback) return fallback;
      return primary;
    }
    return baseWorker.fetch(request,env,ctx);
  }
};
