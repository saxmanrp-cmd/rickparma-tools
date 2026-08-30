import app from './index.js';

const json=(data,init={})=>new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8',...(init.headers||{})}});
const num=(v,max=10000)=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(max,n)):0};
const round1=v=>Math.round(num(v,500)*10)/10;

const VERIFIED={
  '081950001415':{
    name:'iForce Nutrition ISOTEAN Vanilla Dream',
    brand:'iForce Nutrition',
    amount:'1 scoop (34 g)',
    calories:140,
    protein:30,
    carbs:3,
    fat:0.5,
    source:'Verified product listing'
  }
};

function nutrient(food,names){
  const list=Array.isArray(food?.foodNutrients)?food.foodNutrients:[];
  for(const n of list){
    const name=String(n.nutrientName||n.nutrient?.name||'').toLowerCase();
    if(names.some(x=>name.includes(x)))return num(n.value??n.amount,10000);
  }
  return 0;
}

async function usdaBarcode(code){
  try{
    const endpoint=`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(code)}&pageSize=10&dataType=Branded`;
    const r=await fetch(endpoint);
    if(!r.ok)return null;
    const data=await r.json();
    const foods=Array.isArray(data?.foods)?data.foods:[];
    const exact=foods.find(f=>String(f.gtinUpc||'').replace(/\D/g,'')===code) || foods[0];
    if(!exact)return null;
    const grams=Number(exact.servingSize)||100;
    const unit=String(exact.servingSizeUnit||'').toLowerCase();
    const factor=(unit==='g'||unit.includes('gram'))?grams/100:1;
    return {
      name:String(exact.description||'Packaged food'),
      brand:String(exact.brandOwner||exact.brandName||''),
      amount:exact.servingSize?`${exact.servingSize} ${exact.servingSizeUnit||''}`.trim():'1 serving',
      calories:Math.round(nutrient(exact,['energy'])*factor),
      protein:round1(nutrient(exact,['protein'])*factor),
      carbs:round1(nutrient(exact,['carbohydrate'])*factor),
      fat:round1(nutrient(exact,['total lipid','total fat'])*factor),
      source:'USDA FoodData Central barcode fallback'
    };
  }catch{return null;}
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/fuel/barcode'&&request.method==='GET'){
      const code=String(url.searchParams.get('code')||'').replace(/\D/g,'').slice(0,18);
      if(!code)return json({error:'Enter a UPC or EAN barcode.'},{status:400});
      if(VERIFIED[code])return json({ok:true,product:VERIFIED[code],note:'Verified barcode match. Check the serving size on your container before saving.'});
      const primary=await app.fetch(request,env,ctx);
      if(primary.ok)return primary;
      if(primary.status!==404)return primary;
      const product=await usdaBarcode(code);
      if(product)return json({ok:true,product,note:'Open Food Facts did not have this item, so Fuel used USDA branded-food data instead. Verify serving size before saving.'});
      return json({error:'That barcode is not in the food databases yet. Use Type / Photo and photograph the Nutrition Facts label, or enter it manually.'},{status:404});
    }
    return app.fetch(request,env,ctx);
  }
};
