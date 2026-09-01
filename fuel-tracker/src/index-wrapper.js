import baseWorker from './index.js';
import { fuelCoach } from './fuel-coach-api.js';

const appleTouchPngBase64 = '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';

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

function appleTouchIcon(){
  const binary=atob(appleTouchPngBase64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return new Response(bytes,{headers:{'content-type':'image/png','cache-control':'public, max-age=31536000, immutable'}});
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

async function withUiExtensions(response){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  let html=await response.text();
  const head=[];
  if(!html.includes('manifest.webmanifest')) head.push('<link rel="manifest" href="/manifest.webmanifest?v=1">');
  if(!html.includes('apple-touch-icon')) head.push('<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=1">');
  if(!html.includes('fuel-icon.svg')) head.push('<link rel="icon" href="/icons/fuel-icon.svg?v=1" type="image/svg+xml">');
  if(head.length) html=html.replace('</head>',head.join('')+'</head>');
  const scripts=[];
  if(!html.includes('/quick-add.js')) scripts.push('<script src="/quick-add.js?v=1"></script>');
  if(!html.includes('/body-scan.js')) scripts.push('<script src="/body-scan.js?v=1"></script>');
  if(!html.includes('/health-bridge.js')) scripts.push('<script src="/health-bridge.js?v=1"></script>');
  if(!html.includes('/fuel-coach.js')) scripts.push('<script src="/fuel-coach.js?v=5"></script>');
  if(scripts.length) html=html.replace('</body>',scripts.join('')+'</body>');
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request, env, ctx){
    const url=new URL(request.url);
    if(url.pathname==='/icons/apple-touch-icon.png' && request.method==='GET') return appleTouchIcon();
    if(url.pathname==='/api/fuel/coach' && request.method==='POST'){
      return fuelCoach(request,env);
    }
    if(url.pathname==='/api/fuel/barcode' && request.method==='GET'){
      const code=cleanCode(url);
      if(knownProducts[code]) return fallbackBarcode(code, env);
      const primary=await baseWorker.fetch(request,env,ctx);
      if(primary.status!==404) return primary;
      const fallback=await fallbackBarcode(code,env);
      if(fallback) return fallback;
      return primary;
    }
    const response=await baseWorker.fetch(request,env,ctx);
    if(request.method==='GET' && (url.pathname==='/' || url.pathname==='/index.html')){
      return withUiExtensions(response);
    }
    return response;
  }
};
