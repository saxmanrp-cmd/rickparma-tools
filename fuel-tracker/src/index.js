const APP_SOURCE = 'https://raw.githubusercontent.com/saxmanrp-cmd/rickparma-tools/main/nutrition-tracker.html';
const AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

const IOS_PHOTO_GUARD = String.raw`<script>
(() => {
  const photoIds = new Set(['cameraInput','libraryInput']);
  let preparing = false;

  function setPhotoStatus(message, type='') {
    const box = document.getElementById('analyzeStatus');
    if (!box) return;
    box.textContent = message;
    box.className = 'status ' + type;
    box.style.display = 'block';
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation:'from-image' }); } catch {}
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise((resolve,reject)=>{ img.onload=resolve; img.onerror=reject; img.src=url; });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function shrinkPhoto(file) {
    const image = await decodeImage(file);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    if (!width || !height) throw new Error('Could not read that photo.');
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(width,height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha:false });
    ctx.drawImage(image, 0, 0, w, h);
    if (typeof image.close === 'function') image.close();
    const blob = await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not resize photo.')),'image/jpeg',0.76));
    const thumbCanvas = document.createElement('canvas');
    const thumbScale = Math.min(1, 360 / Math.max(w,h));
    thumbCanvas.width = Math.max(1,Math.round(w*thumbScale));
    thumbCanvas.height = Math.max(1,Math.round(h*thumbScale));
    thumbCanvas.getContext('2d',{alpha:false}).drawImage(canvas,0,0,thumbCanvas.width,thumbCanvas.height);
    const thumb = thumbCanvas.toDataURL('image/jpeg',0.62);
    return { blob, thumb };
  }

  document.addEventListener('change', async (event) => {
    const input = event.target;
    if (!input || !photoIds.has(input.id)) return;
    event.stopImmediatePropagation();
    const file = input.files && input.files[0];
    if (!file || preparing) return;
    preparing = true;
    input.disabled = true;
    setPhotoStatus('Preparing photo for fast analysis…');
    try {
      const { blob, thumb } = await shrinkPhoto(file);
      pendingPhoto = new File([blob], 'meal.jpg', { type:'image/jpeg', lastModified:Date.now() });
      pendingThumb = thumb;
      const preview = document.getElementById('photoPreview');
      if (preview) { preview.src = thumb; preview.style.display = 'block'; }
      setPhotoStatus('Photo ready · ' + Math.max(1,Math.round(blob.size/1024)) + ' KB','good');
    } catch (error) {
      pendingPhoto = null;
      pendingThumb = null;
      setPhotoStatus((error && error.message) || 'Could not prepare that photo. Try another one.','bad');
    } finally {
      preparing = false;
      input.disabled = false;
    }
  }, true);
})();
</script>`;

async function serveApp(request) {
  try {
    const upstream = await fetch(APP_SOURCE, { cf:{ cacheTtl:60, cacheEverything:true } });
    if (!upstream.ok) return new Response('Fuel Tracker is temporarily unavailable.', { status:502 });
    const headers = new Headers(upstream.headers);
    headers.set('content-type','text/html; charset=utf-8');
    headers.set('cache-control','no-store');
    headers.set('x-content-type-options','nosniff');
    if (request.method === 'HEAD') return new Response(null,{status:200,headers});
    let html = await upstream.text();
    html = html.includes('</body>') ? html.replace('</body>', `${IOS_PHOTO_GUARD}</body>`) : html + IOS_PHOTO_GUARD;
    return new Response(html, { status:200, headers });
  } catch {
    return new Response('Fuel Tracker is temporarily unavailable.', { status:502 });
  }
}

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
    name:String(item?.name||'Food').slice(0,80),
    amount:String(item?.amount||'').slice(0,40),
    calories:Math.round(num(item?.calories,5000)),
    protein:Math.round(num(item?.protein,500)*10)/10,
    carbs:Math.round(num(item?.carbs,500)*10)/10,
    fat:Math.round(num(item?.fat,500)*10)/10,
    confidence:Math.max(0,Math.min(1,Number(item?.confidence)||0.6)),
  })) : [];
  const totals = items.reduce((a,x)=>({
    calories:a.calories+x.calories,
    protein:a.protein+x.protein,
    carbs:a.carbs+x.carbs,
    fat:a.fat+x.fat,
  }),{calories:0,protein:0,carbs:0,fat:0});
  return {
    items,
    totals:{
      calories:Math.round(totals.calories),
      protein:Math.round(totals.protein*10)/10,
      carbs:Math.round(totals.carbs*10)/10,
      fat:Math.round(totals.fat*10)/10,
    },
    summary:String(data?.summary||items.map(x=>`${x.amount} ${x.name}`.trim()).join(', ')).slice(0,400),
    note:String(data?.note||'Nutrition is an estimate; adjust portions before saving.').slice(0,300),
  };
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
      const converted = await env.AI.toMarkdown(
        {name:image.name||'meal.jpg',blob:new Blob([await image.arrayBuffer()],{type:image.type||'image/jpeg'})},
        {conversionOptions:{output:{format:'text'},image:{descriptionLanguage:'en'}}},
      );
      if (converted?.format !== 'error') imageDescription = String(converted?.data||'').slice(0,5000);
    }
    if (!text && !imageDescription) return json({error:'Type what you ate or take a food photo.'},{status:400});

    const prompt = `Estimate nutrition for one meal from the information below. This is a personal food log, not medical advice. Be practical and conservative. Use common cooked serving values. If a portion is unclear, make a reasonable estimate and lower confidence. Include sauces, butter, oils, breading, cheese and cooking fats when mentioned or clearly visible. Do not invent unsupported foods.\n\nUSER TEXT:\n${text||'(none)'}\n\nIMAGE DESCRIPTION:\n${imageDescription||'(none)'}\n\nReturn ONLY valid JSON in this shape:\n{"items":[{"name":"food","amount":"estimated amount","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0}],"summary":"short meal description","note":"short uncertainty note"}\nProtein, carbs and fat are grams; calories are kcal.`;

    const result = await env.AI.run(AI_MODEL,{
      messages:[
        {role:'system',content:'You are a careful nutrition logging assistant. Output JSON only.'},
        {role:'user',content:prompt},
      ],
      temperature:0.2,
      max_completion_tokens:900,
      chat_template_kwargs:{enable_thinking:false},
    });
    const parsed = parseJsonLoose(readAiText(result));
    if (!parsed) return json({error:'I could not read that meal clearly. Add portion sizes or retake the photo.'},{status:422});
    const resultData = normalize(parsed);
    if (!resultData.items.length) return json({error:'I could not identify enough food to calculate. Add a short description and try again.'},{status:422});
    return json({ok:true,...resultData});
  } catch (error) {
    console.error('fuel analyze error',error);
    return json({error:'Food analysis had a hiccup. You can still use Quick Add or manual macros.'},{status:500});
  }
}

export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ok:true,service:'rick-fuel-tracker',version:'1.0.1'});
    if (url.pathname === '/api/fuel/analyze' && request.method === 'POST') return analyze(request,env);
    if ((request.method === 'GET' || request.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/fuel' || url.pathname === '/fuel/')) return serveApp(request);
    return new Response('Not found',{status:404});
  },
};
