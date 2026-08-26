// Ratio-smart publishing, reusable 9:16 -> 4:5 crops, and People & Reach suggestions.
(() => {
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const PROFILE_KEY='socialPublisherPeopleReachV1';
  const FORMAT_KEY='socialPublisherComicFormatChoiceV1';
  let templates=[]; let savedScroll=0; let makingComic=false; let feedVariantUrl='';
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug=(v='')=>String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'scene';
  const toastSafe=m=>typeof window.toast==='function'?window.toast(m):void 0;

  function injectStyles(){
    if(q('#smartRatioPeopleStyles'))return;
    const s=document.createElement('style'); s.id='smartRatioPeopleStyles'; s.textContent=`
      body.smart-comic-generated #dropZone,body.smart-comic-generated #mediaPreview,body.smart-comic-generated #mediaActions{display:none!important}
      #peopleReachSettings{margin-top:12px} #peopleReachSettings summary{cursor:pointer;font-size:18px;font-weight:900;list-style:none}
      #peopleReachSettings summary::-webkit-details-marker{display:none}
      .pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.pr-grid.one{grid-template-columns:1fr}
      .pr-field label{display:block;font-size:13px;font-weight:850;color:#cfd6e1;margin:0 0 5px}.pr-field input,.pr-field select,.pr-field textarea{width:100%;box-sizing:border-box;min-height:44px;border-radius:11px;border:1px solid rgba(255,255,255,.13);background:#080e16;color:#fff;padding:9px 10px;font-size:15px}.pr-field textarea{min-height:72px;resize:vertical}
      .pr-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.pr-btn{min-height:44px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:#151d29;color:#fff;font-weight:850}.pr-btn.primary{background:linear-gradient(135deg,#6654e8,#9168ff)}
      .pr-person{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-top:1px solid rgba(255,255,255,.08)}.pr-person small{display:block;color:#93a0b2;margin-top:2px}.pr-remove{border:0;background:transparent;color:#ff8a96;font-weight:900}
      #smartPeopleSuggestions{margin-top:10px;padding:10px;border-radius:12px;background:#0b1119;border:1px solid rgba(145,116,255,.2)}#smartPeopleSuggestions.hidden{display:none}.spr-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.spr-chip{padding:7px 9px;border-radius:999px;background:#171d2a;color:#e8e4ff;font-size:13px;font-weight:800}.spr-apply{margin-top:9px;width:100%;min-height:44px;border-radius:11px;border:0;background:linear-gradient(135deg,#6654e8,#9168ff);color:#fff;font-weight:900}
      @media(max-width:520px){.pr-grid,.pr-actions{grid-template-columns:1fr}}
    `; document.head.appendChild(s);
  }

  async function loadTemplates(force=false){
    if(templates.length&&!force)return templates;
    try{const r=await fetch('/api/comic-templates',{cache:'no-store'});const d=await r.json();templates=Array.isArray(d.templates)?d.templates:[];}catch{} return templates;
  }
  function currentTemplate(){const id=q('#comicScenePicker')?.value||'';return templates.find(t=>t.id===id)||null;}
  function templateFormat(t){return t?.format==='story'?'story':t?.format==='feed'?'feed':'';}
  function pairKey(t){return String(t?.pair||t?.pairId||t?.templatePair||slug(t?.name||t?.id||'scene'));}
  function bubble(t){const b=t?.bubble||{};return {x:Number(b.x)||.08,y:Number(b.y)||.055,width:Number(b.width)||.84,height:Number(b.height)||.27};}

  async function renderAllScenes(){
    await loadTemplates(); const format=q('#comicFormatPicker'), scene=q('#comicScenePicker'), cat=q('#comicCategoryPicker')?.value||'';
    if(!format||!scene||format.value!=='all')return;
    const prior=scene.value; const list=templates.filter(t=>!cat||String(t.category||'Rick Parma Comics')===cat);
    scene.disabled=!list.length; scene.innerHTML=list.length?list.map(t=>`<option value="${esc(t.id)}">${esc(t.name||t.id)} · ${t.format==='story'?'9:16':'4:5'}</option>`).join(''):'<option value="">No backgrounds in this category</option>';
    scene.value=list.some(t=>t.id===prior)?prior:(list[0]?.id||''); if(scene.value)scene.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function installAllSizes(){
    const f=q('#comicFormatPicker'); if(!f)return false;
    if(![...f.options].some(o=>o.value==='all'))f.insertAdjacentHTML('afterbegin','<option value="all">All Sizes</option>');
    let choice='';try{choice=sessionStorage.getItem(FORMAT_KEY)||'';}catch{}
    if(!choice){f.value='all';try{sessionStorage.setItem(FORMAT_KEY,'all');}catch{};f.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(renderAllScenes,0);} else if([...f.options].some(o=>o.value===choice)){f.value=choice;f.dispatchEvent(new Event('change',{bubbles:true}));}
    if(!f.dataset.smartWired){f.dataset.smartWired='1';f.addEventListener('change',()=>{try{sessionStorage.setItem(FORMAT_KEY,f.value);}catch{};if(f.value==='all')setTimeout(renderAllScenes,0);});q('#comicCategoryPicker')?.addEventListener('change',()=>{if(f.value==='all')setTimeout(renderAllScenes,0);});}
    return true;
  }

  function installComicGuard(){
    document.addEventListener('click',e=>{if(!e.target.closest?.('#comicMakeBtn'))return;makingComic=true;savedScroll=window.scrollY;document.body.classList.add('smart-comic-generated','stage15-comic-generated-media');setTimeout(()=>document.body.classList.add('smart-comic-generated','stage15-comic-generated-media'),150);setTimeout(()=>{window.scrollTo(0,savedScroll);maybeCreateFeedVariant();},700);setTimeout(()=>{window.scrollTo(0,savedScroll);makingComic=false;},1400);},{capture:true});
    q('#mediaInput')?.addEventListener('change',()=>document.body.classList.remove('smart-comic-generated'));
    q('#stage15UploadMediaBtn')?.addEventListener('click',()=>document.body.classList.remove('smart-comic-generated'));
    const oldNav=window.navigate; if(typeof oldNav==='function'&&!oldNav.__smartWrapped){const wrapped=function(view,opts){if(makingComic&&view==='create'&&q('#view-create')?.classList.contains('active'))return;return oldNav.call(this,view,opts);};wrapped.__smartWrapped=true;window.navigate=wrapped;}
    const oldHandle=window.handleMedia; if(typeof oldHandle==='function'&&!oldHandle.__smartWrapped){const wrapped=async function(file,...rest){const comic=/^comic-blast-/i.test(file?.name||'');if(comic)document.body.classList.add('smart-comic-generated','stage15-comic-generated-media');const out=await oldHandle.call(this,file,...rest);if(comic){document.body.classList.add('smart-comic-generated','stage15-comic-generated-media');requestAnimationFrame(()=>window.scrollTo(0,savedScroll));}return out;};wrapped.__smartWrapped=true;window.handleMedia=wrapped;}
  }

  async function imageFrom(url){return await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;});}
  async function maybeCreateFeedVariant(){
    await loadTemplates(); const t=currentTemplate(); if(templateFormat(t)!=='story'||!t?.url)return;
    const pair=pairKey(t), cat=String(t.category||'Rick Parma Comics'); if(templates.some(x=>String(x.category||'Rick Parma Comics')===cat&&pairKey(x)===pair&&templateFormat(x)==='feed'))return;
    try{
      const img=await imageFrom(t.url); const sw=img.naturalWidth||img.width, sh=img.naturalHeight||img.height, cropH=Math.min(sh,Math.round(sw/(4/5))); const c=document.createElement('canvas');c.width=1080;c.height=1350;c.getContext('2d').drawImage(img,0,0,sw,cropH,0,0,c.width,c.height);
      const blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('crop failed')),'image/jpeg',.9)); const frac=cropH/sh; const b=bubble(t); const nb={x:b.x,y:Math.max(0,Math.min(1,b.y/frac)),width:b.width,height:Math.max(.05,Math.min(1,b.height/frac))};
      const id=`${slug(cat)}--${slug(pair)}--feed--autocrop`; const r=await fetch(`/api/comic-templates/${encodeURIComponent(id)}`,{method:'PUT',headers:{'content-type':'image/jpeg','x-template-name':String(t.name||'Background'),'x-template-category':cat,'x-template-pair':pair,'x-template-format':'feed','x-bubble-x':String(nb.x),'x-bubble-y':String(nb.y),'x-bubble-width':String(nb.width),'x-bubble-height':String(nb.height)},body:blob}); if(!r.ok)throw new Error('save failed');
      await loadTemplates(true); toastSafe('A reusable 4:5 version was saved automatically.'); q('#comicReloadBtn')?.click();
    }catch{}
  }

  function setPlatform(name,on){const input=q(`.platform-chip[data-platform="${name}"] input`);if(!input||input.disabled)return;if(input.checked!==on){input.checked=on;input.dispatchEvent(new Event('change',{bubbles:true}));}}
  function setRadio(name,value){const i=q(`input[name="${name}"][value="${value}"]`);if(i&&!i.disabled){i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}));}}
  async function smartRoute(){
    await loadTemplates(); let fmt=templateFormat(currentTemplate()); if(!fmt){const m=q('#mediaPreview img,#mediaPreview video');const w=Number(m?.naturalWidth||m?.videoWidth||0),h=Number(m?.naturalHeight||m?.videoHeight||0);if(w&&h)fmt=w/h<.68?'story':'feed';}
    if(!fmt)return;
    const media=q('#mediaPreview img,#mediaPreview video');const video=media?.tagName==='VIDEO';
    if(fmt==='story'){
      setPlatform('instagram',true);setRadio('igType',video?'reel':'story');setPlatform('facebook',video);if(video)setRadio('fbType','reel');setPlatform('tiktok',true);setPlatform('threads',true);maybeCreateFeedVariant();toastSafe('9:16 setup applied: vertical destinations first.');
    }else{
      setPlatform('instagram',true);setRadio('igType','post');setPlatform('facebook',true);setRadio('fbType','post');setPlatform('threads',true);setPlatform('tiktok',false);toastSafe('4:5 setup applied: feed destinations first.');
    }
    renderSuggestions();
  }
  function wireHelpers(){['applyMaxReachBtn','showHelperBtn'].forEach(id=>{const b=q('#'+id);if(b&&!b.dataset.smartRatio){b.dataset.smartRatio='1';b.addEventListener('click',()=>setTimeout(smartRoute,0));}});}

  function loadProfile(){try{return {...{market:'',interests:'',avoid:'',ages:'',people:[]},...JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}')}}catch{return {market:'',interests:'',avoid:'',ages:'',people:[]}}}
  function saveProfile(p){try{localStorage.setItem(PROFILE_KEY,JSON.stringify(p));}catch{}}
  function injectSettings(){
    const host=q('#view-settings'); if(!host||q('#peopleReachSettings'))return;
    const p=loadProfile(), card=document.createElement('details');card.id='peopleReachSettings';card.className='card';card.innerHTML=`<summary>🎯 People & Reach</summary><div class="field-hint" style="margin-top:7px">Save your audience and the people you work with. Help Me uses this to suggest tags and collaborators.</div><div class="pr-grid"><div class="pr-field"><label>Home market / area</label><input id="prMarket" value="${esc(p.market)}" placeholder="Las Vegas, Henderson..." /></div><div class="pr-field"><label>Typical audience age</label><input id="prAges" value="${esc(p.ages)}" placeholder="35–65, mixed adults..." /></div></div><div class="pr-grid"><div class="pr-field"><label>Audience interests</label><textarea id="prInterests" placeholder="live music, R&B, nightlife, jazz...">${esc(p.interests)}</textarea></div><div class="pr-field"><label>Avoid / not relevant</label><textarea id="prAvoid" placeholder="things that do not fit your audience">${esc(p.avoid)}</textarea></div></div><button id="prSaveAudience" class="pr-btn primary" type="button" style="width:100%;margin-top:9px">Save Audience Profile</button><div style="margin-top:14px;font-weight:900">People I Work With</div><div id="prPeopleList"></div><div class="pr-grid"><div class="pr-field"><label>Name</label><input id="prName" placeholder="Venue or person" /></div><div class="pr-field"><label>Instagram</label><input id="prHandle" placeholder="@username" /></div><div class="pr-field"><label>Role</label><select id="prRole"><option>Venue</option><option>Performer</option><option>Promoter</option><option>Photographer</option><option>Other</option></select></div><div class="pr-field"><label>Default action</label><select id="prAction"><option value="tag">Tag</option><option value="collab">Collaborator</option><option value="both">Both</option></select></div><div class="pr-field"><label>Location</label><input id="prLocation" placeholder="Las Vegas" /></div><div class="pr-field"><label>Keywords</label><input id="prKeywords" placeholder="Easy's, funk, Friday..." /></div></div><button id="prAddPerson" class="pr-btn primary" type="button" style="width:100%;margin-top:9px">Add Person</button>`;
    const anchor=q('#logoutBtn',host)||q('#clearHistoryBtn',host);anchor?.parentNode?.insertBefore(card,anchor)||host.appendChild(card);
    q('#prSaveAudience')?.addEventListener('click',()=>{const x=loadProfile();x.market=q('#prMarket').value.trim();x.ages=q('#prAges').value.trim();x.interests=q('#prInterests').value.trim();x.avoid=q('#prAvoid').value.trim();saveProfile(x);toastSafe('Audience profile saved.');renderSuggestions();});
    q('#prAddPerson')?.addEventListener('click',()=>{const x=loadProfile(),name=q('#prName').value.trim(),handle=q('#prHandle').value.trim().replace(/^@/,'');if(!name||!handle)return toastSafe('Add a name and Instagram handle.');x.people.push({id:crypto.randomUUID(),name,handle,role:q('#prRole').value,action:q('#prAction').value,location:q('#prLocation').value.trim(),keywords:q('#prKeywords').value.trim()});saveProfile(x);['prName','prHandle','prLocation','prKeywords'].forEach(id=>q('#'+id).value='');renderPeopleList();renderSuggestions();});
    renderPeopleList();
  }
  function renderPeopleList(){const host=q('#prPeopleList');if(!host)return;const p=loadProfile();host.innerHTML=p.people.length?p.people.map(x=>`<div class="pr-person"><div><strong>${esc(x.name)}</strong><small>@${esc(x.handle)} · ${esc(x.role)} · ${esc(x.action)}</small></div><button class="pr-remove" data-pr-remove="${esc(x.id)}">Remove</button></div>`).join(''):'<div class="field-hint" style="margin-top:8px">No saved people yet.</div>';qa('[data-pr-remove]',host).forEach(b=>b.addEventListener('click',()=>{const p=loadProfile();p.people=p.people.filter(x=>x.id!==b.dataset.prRemove);saveProfile(p);renderPeopleList();renderSuggestions();}));}
  function suggestionScore(x,context,p){let s=0;const low=context.toLowerCase();if(low.includes(String(x.name||'').toLowerCase()))s+=6;if(x.location&&p.market&&x.location.toLowerCase().includes(p.market.toLowerCase()))s+=2;for(const k of String(x.keywords||'').toLowerCase().split(/[,;]+/).map(v=>v.trim()).filter(Boolean))if(low.includes(k))s+=3;for(const k of String(p.interests||'').toLowerCase().split(/[,;]+/).map(v=>v.trim()).filter(Boolean))if(String(x.keywords||'').toLowerCase().includes(k))s+=1;if(/venue/i.test(x.role)&&low.includes('show'))s+=1;return s;}
  function suggestions(){const p=loadProfile(),ctx=[q('#caption')?.value||'',q('#comicCategoryPicker')?.value||'',q('#comicScenePicker')?.selectedOptions?.[0]?.textContent||''].join(' ');return p.people.map(x=>({...x,score:suggestionScore(x,ctx,p)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);}
  function renderSuggestions(){const wrap=q('#instagramPeopleWrap');if(!wrap)return;let box=q('#smartPeopleSuggestions');if(!box){box=document.createElement('div');box.id='smartPeopleSuggestions';wrap.prepend(box);}const list=suggestions();box.classList.toggle('hidden',!list.length);if(!list.length){box.innerHTML='';return;}box.innerHTML=`<strong>✨ Suggested People</strong><div class="field-hint">Based on this post + your People & Reach profile.</div><div class="spr-row">${list.map(x=>`<span class="spr-chip">@${esc(x.handle)} · ${esc(x.action)}</span>`).join('')}</div><button class="spr-apply" type="button">Use These Suggestions</button>`;q('.spr-apply',box)?.addEventListener('click',()=>applyPeople(list));}
  function applyPeople(list){for(const x of list){if(x.action==='tag'||x.action==='both'){const i=q('#igTagUsername');if(i){i.value='@'+x.handle;q('#addIgTagBtn')?.click();}}if(x.action==='collab'||x.action==='both'){const i=q('#igCollabUsername');if(i){i.value='@'+x.handle;q('#addIgCollabBtn')?.click();}}}toastSafe('Suggested people added. Photo tags may still need positioning.');}

  function boot(){injectStyles();installComicGuard();injectSettings();wireHelpers();let tries=0;const timer=setInterval(()=>{tries++;const ok=installAllSizes();wireHelpers();injectSettings();renderSuggestions();if(ok&&tries>8)clearInterval(timer);if(tries>40)clearInterval(timer);},150);q('#caption')?.addEventListener('input',()=>setTimeout(renderSuggestions,80));q('#comicScenePicker')?.addEventListener('change',()=>setTimeout(renderSuggestions,50));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
