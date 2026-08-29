const AI_MODEL='@cf/google/gemma-4-26b-a4b-it';

const json=(data,init={})=>new Response(JSON.stringify(data),{
  ...init,headers:{'content-type':'application/json; charset=utf-8',...(init.headers||{})}
});

function readAiText(result){return result?.choices?.[0]?.message?.content||result?.response||result?.result||''}
function parseJsonLoose(text){
  if(typeof text!=='string')return null;
  const clean=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(clean)}catch{}
  const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(clean.slice(a,b+1))}catch{}}
  return null;
}
function num(v,max=10000){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(max,n)):0}
function round1(v){return Math.round(num(v,500)*10)/10}
function normalize(data){
  const items=Array.isArray(data?.items)?data.items.slice(0,20).map(item=>({
    name:String(item?.name||'Food').slice(0,100),amount:String(item?.amount||'').slice(0,60),
    calories:Math.round(num(item?.calories,5000)),protein:round1(item?.protein),carbs:round1(item?.carbs),fat:round1(item?.fat),
    confidence:Math.max(0,Math.min(1,Number(item?.confidence)||0.6)),source:String(item?.source||'AI estimate').slice(0,80)
  })):[];
  return {items,note:String(data?.note||'Nutrition is an estimate; review portions before saving.').slice(0,400)};
}

async function imageToText(image,env){
  if(!image||typeof image.arrayBuffer!=='function'||image.size<=0)return '';
  if(image.size>5_000_000)throw new Error('That image is too large. Try a smaller photo.');
  const converted=await env.AI.toMarkdown(
    {name:image.name||'image.jpg',blob:new Blob([await image.arrayBuffer()],{type:image.type||'image/jpeg'})},
    {conversionOptions:{output:{format:'text'},image:{descriptionLanguage:'en'}}}
  );
  return converted?.format==='error'?'':String(converted?.data||'').slice(0,7000);
}

async function analyze(request,env){
  if(!env.AI)return json({error:'AI food analysis is not configured.'},{status:503});
  try{
    const form=await request.formData();
    const text=String(form.get('text')||'').trim().slice(0,2000);
    const image=form.get('image');
    const imageDescription=await imageToText(image,env);
    if(!text&&!imageDescription)return json({error:'Type what you ate or take a food photo.'},{status:400});
    const prompt=`Estimate nutrition for one meal from the information below. Be practical and conservative. Prefer exact known branded or restaurant nutrition when the user names a specific chain/menu item; otherwise estimate common cooked portions. Include sauces, butter, oils, breading, cheese and cooking fats when mentioned or clearly visible. Do not invent unsupported foods.\n\nUSER TEXT:\n${text||'(none)'}\n\nIMAGE DESCRIPTION:\n${imageDescription||'(none)'}\n\nReturn ONLY valid JSON:\n{"items":[{"name":"food","amount":"amount","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0,"source":"official/known data or AI estimate"}],"note":"short uncertainty note"}`;
    const result=await env.AI.run(AI_MODEL,{messages:[{role:'system',content:'You are a careful nutrition logging assistant. Output JSON only.'},{role:'user',content:prompt}],temperature:0.15,max_completion_tokens:1000,chat_template_kwargs:{enable_thinking:false}});
    const parsed=parseJsonLoose(readAiText(result));
    if(!parsed)return json({error:'I could not read that meal clearly. Add portion sizes and try again.'},{status:422});
    const out=normalize(parsed);if(!out.items.length)return json({error:'I could not identify enough food to calculate.'},{status:422});
    return json({ok:true,...out,source:'AI/review'});
  }catch(error){console.error('fuel analyze error',error);return json({error:error?.message||'Food analysis had a hiccup.'},{status:500})}
}

async function barcodeLookup(url){
  const code=String(url.searchParams.get('code')||'').replace(/\D/g,'').slice(0,18);
  if(!code)return json({error:'Enter a UPC or EAN barcode.'},{status:400});
  try{
    const endpoint=`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,quantity,serving_size,serving_quantity,nutriments`;
    const r=await fetch(endpoint,{headers:{'user-agent':'RickFuelTracker/1.2'}});const data=await r.json();
    if(!r.ok||data?.status!==1||!data?.product)return json({error:'That barcode was not found. You can still log it manually.'},{status:404});
    const p=data.product,n=p.nutriments||{},servingQty=num(p.serving_quantity,10000);
    const factor=servingQty?servingQty/100:1;
    const pick=(servingKey,hundredKey)=>n[servingKey]!=null?num(n[servingKey],5000):num(n[hundredKey],5000)*factor;
    const item={
      name:String(p.product_name||'Packaged food'),brand:String(p.brands||''),amount:String(p.serving_size||p.quantity||'1 serving'),
      calories:Math.round(pick('energy-kcal_serving','energy-kcal_100g')),protein:round1(pick('proteins_serving','proteins_100g')),
      carbs:round1(pick('carbohydrates_serving','carbohydrates_100g')),fat:round1(pick('fat_serving','fat_100g')),
      source:'Open Food Facts barcode'
    };
    return json({ok:true,product:item,note:'Barcode data comes from Open Food Facts. Check the serving size on the package before saving.'});
  }catch(error){console.error('barcode lookup error',error);return json({error:'Barcode lookup is temporarily unavailable.'},{status:502})}
}

function nutrientValue(food,names){
  const list=Array.isArray(food?.foodNutrients)?food.foodNutrients:[];
  for(const n of list){const name=String(n.nutrientName||'').toLowerCase();if(names.some(x=>name.includes(x)))return num(n.value,10000)}
  return 0;
}
function servingGrams(food){
  const size=num(food?.servingSize,10000),unit=String(food?.servingSizeUnit||'').toLowerCase();
  if(!size)return 100;if(unit==='g'||unit.includes('gram'))return size;if(unit==='oz'||unit.includes('ounce'))return size*28.3495;return 100;
}
function mapUsda(food){
  const factor=servingGrams(food)/100;
  return {name:String(food.description||food.lowercaseDescription||'Restaurant food'),brand:String(food.brandOwner||food.brandName||''),amount:food.servingSize?`${food.servingSize} ${food.servingSizeUnit||''}`.trim():'100 g',
    calories:Math.round(nutrientValue(food,['energy'])*factor),protein:round1(nutrientValue(food,['protein'])*factor),
    carbs:round1(nutrientValue(food,['carbohydrate'])*factor),fat:round1(nutrientValue(food,['total lipid','total fat'])*factor),source:'USDA FoodData Central'};
}
async function restaurantAi(query,env){
  const prompt=`The user wants nutrition for a specific restaurant or chain menu item: "${query}". Return up to 3 likely matching menu items. If the exact well-known published nutrition is confidently known, use it; otherwise provide a conservative estimate and clearly label the source as AI estimate. Return ONLY JSON: {"items":[{"name":"","brand":"","amount":"","calories":0,"protein":0,"carbs":0,"fat":0,"source":"AI restaurant estimate"}],"note":""}`;
  const result=await env.AI.run(AI_MODEL,{messages:[{role:'system',content:'You are a nutrition lookup assistant. JSON only.'},{role:'user',content:prompt}],temperature:0.1,max_completion_tokens:700,chat_template_kwargs:{enable_thinking:false}});
  const parsed=parseJsonLoose(readAiText(result));
  const items=Array.isArray(parsed?.items)?parsed.items.slice(0,3).map(x=>({name:String(x.name||query),brand:String(x.brand||''),amount:String(x.amount||'1 order'),calories:Math.round(num(x.calories,5000)),protein:round1(x.protein),carbs:round1(x.carbs),fat:round1(x.fat),source:String(x.source||'AI restaurant estimate')})):[];
  return {items,note:String(parsed?.note||'AI fallback used because a database match was not available. Verify against the restaurant nutrition page when possible.')};
}
async function restaurantSearch(url,env){
  const q=String(url.searchParams.get('q')||'').trim().slice(0,180);
  if(!q)return json({error:'Type a restaurant item to search.'},{status:400});
  let results=[],note='';
  try{
    const endpoint=`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(q)}&pageSize=8&dataType=Branded`;
    const r=await fetch(endpoint);if(r.ok){const d=await r.json();results=(d.foods||[]).slice(0,6).map(mapUsda).filter(x=>x.calories||x.protein||x.carbs||x.fat);if(results.length)note='USDA branded-food matches. Tap the closest item and verify serving size.';}
  }catch(error){console.warn('USDA search failed',error)}
  if(!results.length&&env.AI){try{const ai=await restaurantAi(q,env);results=ai.items;note=ai.note;}catch(error){console.warn('restaurant AI fallback failed',error)}}
  if(!results.length)return json({error:'No restaurant nutrition match was found. Try the exact restaurant and menu item name.'},{status:404});
  return json({ok:true,results,note});
}

async function receiptScan(request,env){
  if(!env.AI)return json({error:'Receipt scanning is not configured.'},{status:503});
  try{
    const form=await request.formData(),image=form.get('image');
    const text=await imageToText(image,env);if(!text)return json({error:'I could not read that receipt. Retake it in brighter light.'},{status:422});
    const prompt=`Extract only purchased food and drink line items from this receipt text. Ignore taxes, totals, payment lines, discounts, order numbers, and non-food merchandise. Preserve quantity when visible. Return ONLY JSON: {"items":[{"name":"menu or grocery item","quantity":"1"}],"store":"","note":""}\n\nRECEIPT TEXT:\n${text}`;
    const result=await env.AI.run(AI_MODEL,{messages:[{role:'system',content:'You extract receipt food line items. JSON only.'},{role:'user',content:prompt}],temperature:0,max_completion_tokens:1000,chat_template_kwargs:{enable_thinking:false}});
    const parsed=parseJsonLoose(readAiText(result));
    const items=Array.isArray(parsed?.items)?parsed.items.slice(0,30).map(x=>({name:String(x.name||'').slice(0,120),quantity:String(x.quantity||'').slice(0,30)})).filter(x=>x.name):[];
    if(!items.length)return json({error:'I could not identify food items on that receipt.'},{status:422});
    return json({ok:true,items,store:String(parsed?.store||'').slice(0,100),note:String(parsed?.note||'Select only what you personally ate.')});
  }catch(error){console.error('receipt scan error',error);return json({error:error?.message||'Receipt scan failed.'},{status:500})}
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/health'&&request.method==='GET')return json({ok:true,service:'rick-fuel-tracker',version:'1.2.0'});
    if(url.pathname==='/api/fuel/analyze'&&request.method==='POST')return analyze(request,env);
    if(url.pathname==='/api/fuel/barcode'&&request.method==='GET')return barcodeLookup(url);
    if(url.pathname==='/api/fuel/restaurant'&&request.method==='GET')return restaurantSearch(url,env);
    if(url.pathname==='/api/fuel/receipt'&&request.method==='POST')return receiptScan(request,env);
    if(env.ASSETS)return env.ASSETS.fetch(request);
    return new Response('Fuel Tracker assets unavailable',{status:503});
  }
};
