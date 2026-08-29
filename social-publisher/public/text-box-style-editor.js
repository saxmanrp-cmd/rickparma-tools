// Mobile-friendly style controls for text mappings in Media > Background Library.
(() => {
  if (window.__textBoxStyleEditorInstalled) return;
  window.__textBoxStyleEditorInstalled = true;

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const hexToRgba=(hex,alpha)=>{
    const value=String(hex||'#FFFFFF').replace('#','');
    const n=parseInt(value,16);
    const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
    return `rgba(${r},${g},${b},${clamp(Number(alpha)||0,0,1)})`;
  };
  const defaultStyle=()=>({shape:'box',fillColor:'#FFFFFF',fillOpacity:0,borderColor:'#FFFFFF',borderOpacity:1,borderWidth:0,cornerRadius:12});
  const state={styles:[],active:0,templateId:''};

  function normalizeStyle(area={}){
    return {
      shape:String(area.shape||'box').toLowerCase()==='circle'?'circle':'box',
      fillColor:/^#[0-9a-f]{6}$/i.test(area.fillColor||'')?String(area.fillColor).toUpperCase():'#FFFFFF',
      fillOpacity:clamp(Number(area.fillOpacity)||0,0,1),
      borderColor:/^#[0-9a-f]{6}$/i.test(area.borderColor||'')?String(area.borderColor).toUpperCase():'#FFFFFF',
      borderOpacity:clamp(Number(area.borderOpacity ?? 1),0,1),
      borderWidth:clamp(Number(area.borderWidth)||0,0,12),
      cornerRadius:clamp(Number(area.cornerRadius)||12,0,48),
    };
  }

  function ensureStyles(){
    if(q('#textBoxStyleEditorStyles')) return;
    const style=document.createElement('style');
    style.id='textBoxStyleEditorStyles';
    style.textContent=`
      body.recovery-easy .text-box-style-card{margin-top:12px;padding:12px;border:1px solid rgba(145,116,255,.28);border-radius:15px;background:#0b1119}
      body.recovery-easy .text-box-style-title{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px}
      body.recovery-easy .text-box-style-title strong{font-size:15px;color:#fff}
      body.recovery-easy .text-box-style-title span{font-size:12px;color:#9ca8b9}
      body.recovery-easy .text-box-shape-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      body.recovery-easy .text-box-shape-btn{min-height:44px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:#111824;color:#fff;font-weight:850}
      body.recovery-easy .text-box-shape-btn.active{border-color:#8a65ff;box-shadow:0 0 0 1px #8a65ff;background:#171229}
      body.recovery-easy .text-box-style-grid{display:grid;gap:10px;margin-top:11px}
      body.recovery-easy .text-box-style-control{display:grid;gap:6px}
      body.recovery-easy .text-box-style-control label{font-size:13px;font-weight:850;color:#dbe3ef;display:flex;justify-content:space-between;gap:8px}
      body.recovery-easy .text-box-style-control input[type=range]{width:100%;accent-color:#8a65ff}
      body.recovery-easy .text-box-color-row{display:grid;grid-template-columns:52px 1fr;gap:8px;align-items:center}
      body.recovery-easy .text-box-color-row input[type=color]{width:52px;height:42px;border:0;padding:0;background:transparent;border-radius:10px;overflow:hidden}
      body.recovery-easy .text-box-swatches{display:flex;gap:7px;flex-wrap:wrap}
      body.recovery-easy .text-box-swatch{width:31px;height:31px;border-radius:9px;border:2px solid rgba(255,255,255,.2);padding:0}
      body.recovery-easy .bg-multi-map-box{outline:2px dashed #ffbd59;outline-offset:1px}
      body.recovery-easy .bg-multi-map-box.active{outline-style:solid}
      body.recovery-easy .bg-multi-map-label{background:rgba(0,0,0,.5);inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);padding:4px 8px;border-radius:999px;white-space:nowrap}
      @media(max-width:430px){
        body.recovery-easy .text-box-style-card{padding:11px}
        body.recovery-easy .text-box-style-grid{gap:12px}
        body.recovery-easy .text-box-style-control label{font-size:12px}
      }
    `;
    document.head.appendChild(style);
  }

  function boxes(){ return qa('#bgMapPreview .bg-multi-map-box'); }

  function styleFor(index){
    while(state.styles.length<=index) state.styles.push(defaultStyle());
    return state.styles[index];
  }

  function styleBox(box,index){
    const s=styleFor(index);
    box.dataset.shape=s.shape;
    box.dataset.fillColor=s.fillColor;
    box.dataset.fillOpacity=String(s.fillOpacity);
    box.dataset.borderColor=s.borderColor;
    box.dataset.borderOpacity=String(s.borderOpacity);
    box.dataset.borderWidth=String(s.borderWidth);
    box.dataset.cornerRadius=String(s.cornerRadius);
    box.style.background=hexToRgba(s.fillColor,s.fillOpacity);
    box.style.borderStyle='solid';
    box.style.borderColor=hexToRgba(s.borderColor,s.borderOpacity);
    box.style.borderWidth=`${s.borderWidth}px`;
    box.style.borderRadius=s.shape==='circle'?'50%':`${s.cornerRadius}px`;
  }

  function applyAll(){ boxes().forEach(styleBox); syncPanel(); }

  function activeIndexFromBox(box){ return Math.max(0,boxes().indexOf(box)); }

  function makeCircle(index){
    const box=boxes()[index],preview=q('#bgMapPreview');
    if(!box||!preview) return;
    const pr=preview.getBoundingClientRect(), br=box.getBoundingClientRect();
    if(!pr.width||!pr.height||!br.width) return;
    const diameter=Math.min(br.width,pr.width*(1-parseFloat(box.style.left||'0')/100));
    const heightPct=(diameter/pr.height)*100;
    const maxHeight=100-parseFloat(box.style.top||'0');
    box.style.width=`${(diameter/pr.width)*100}%`;
    box.style.height=`${Math.min(heightPct,maxHeight)}%`;
  }

  function updateStyle(patch){
    const s=styleFor(state.active);
    Object.assign(s,patch);
    if(s.shape==='circle') requestAnimationFrame(()=>makeCircle(state.active));
    applyAll();
  }

  function panelHtml(){
    return `<div id="textBoxStyleCard" class="text-box-style-card">
      <div class="text-box-style-title"><strong>Text Box Style</strong><span id="textBoxStyleSelected">TEXT 1</span></div>
      <div class="text-box-shape-row">
        <button id="textBoxShapeBox" class="text-box-shape-btn" type="button">▭ Box</button>
        <button id="textBoxShapeCircle" class="text-box-shape-btn" type="button">◯ Circle</button>
      </div>
      <div class="text-box-style-grid">
        <div class="text-box-style-control">
          <label>Background Color</label>
          <div class="text-box-color-row"><input id="textBoxFillColor" type="color" value="#FFFFFF"><div id="textBoxFillSwatches" class="text-box-swatches"></div></div>
        </div>
        <div class="text-box-style-control"><label>Background Opacity <span id="textBoxFillOpacityValue">0%</span></label><input id="textBoxFillOpacity" type="range" min="0" max="100" step="1" value="0"></div>
        <div class="text-box-style-control">
          <label>Border Color</label>
          <div class="text-box-color-row"><input id="textBoxBorderColor" type="color" value="#FFFFFF"><div id="textBoxBorderSwatches" class="text-box-swatches"></div></div>
        </div>
        <div class="text-box-style-control"><label>Border Width <span id="textBoxBorderWidthValue">0px</span></label><input id="textBoxBorderWidth" type="range" min="0" max="12" step="1" value="0"></div>
        <div class="text-box-style-control" id="textBoxCornerRow"><label>Corner Radius <span id="textBoxCornerValue">12px</span></label><input id="textBoxCornerRadius" type="range" min="0" max="48" step="1" value="12"></div>
      </div>
    </div>`;
  }

  function addSwatches(hostId,targetId,property){
    const host=q(hostId); if(!host||host.dataset.ready) return;
    host.dataset.ready='1';
    const colors=['#FFFFFF','#000000','#8A2BE2','#E53935','#FF9800','#FFD54F','#16A085','#1976D2'];
    host.innerHTML=colors.map(color=>`<button type="button" class="text-box-swatch" data-color="${color}" style="background:${color}" aria-label="${color}"></button>`).join('');
    host.addEventListener('click',e=>{
      const btn=e.target.closest?.('[data-color]'); if(!btn) return;
      const color=btn.dataset.color;
      const input=q(targetId); if(input) input.value=color;
      updateStyle({[property]:color});
    });
  }

  function installPanel(){
    const note=q('#bgMultiTextMappingNote');
    if(!note||q('#textBoxStyleCard')) return false;
    note.insertAdjacentHTML('afterend',panelHtml());
    addSwatches('#textBoxFillSwatches','#textBoxFillColor','fillColor');
    addSwatches('#textBoxBorderSwatches','#textBoxBorderColor','borderColor');
    q('#textBoxShapeBox')?.addEventListener('click',()=>updateStyle({shape:'box'}));
    q('#textBoxShapeCircle')?.addEventListener('click',()=>updateStyle({shape:'circle'}));
    q('#textBoxFillColor')?.addEventListener('input',e=>updateStyle({fillColor:e.target.value.toUpperCase()}));
    q('#textBoxBorderColor')?.addEventListener('input',e=>updateStyle({borderColor:e.target.value.toUpperCase()}));
    q('#textBoxFillOpacity')?.addEventListener('input',e=>updateStyle({fillOpacity:Number(e.target.value)/100}));
    q('#textBoxBorderWidth')?.addEventListener('input',e=>updateStyle({borderWidth:Number(e.target.value)}));
    q('#textBoxCornerRadius')?.addEventListener('input',e=>updateStyle({cornerRadius:Number(e.target.value)}));
    return true;
  }

  function syncPanel(){
    const card=q('#textBoxStyleCard'); if(!card) return;
    const s=styleFor(state.active);
    q('#textBoxStyleSelected').textContent=`TEXT ${state.active+1}`;
    q('#textBoxShapeBox')?.classList.toggle('active',s.shape==='box');
    q('#textBoxShapeCircle')?.classList.toggle('active',s.shape==='circle');
    q('#textBoxFillColor').value=s.fillColor;
    q('#textBoxBorderColor').value=s.borderColor;
    q('#textBoxFillOpacity').value=String(Math.round(s.fillOpacity*100));
    q('#textBoxFillOpacityValue').textContent=`${Math.round(s.fillOpacity*100)}%`;
    q('#textBoxBorderWidth').value=String(s.borderWidth);
    q('#textBoxBorderWidthValue').textContent=`${s.borderWidth}px`;
    q('#textBoxCornerRadius').value=String(s.cornerRadius);
    q('#textBoxCornerValue').textContent=`${s.cornerRadius}px`;
    q('#textBoxCornerRow')?.classList.toggle('hidden',s.shape==='circle');
  }

  async function loadForCurrentTemplate(){
    const src=q('#bgEditImage')?.getAttribute('src')||''; if(!src) return;
    try{
      const r=await fetch('/api/comic-templates',{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      const list=Array.isArray(d.templates)?d.templates:[];
      const absolute=new URL(src,location.origin).href;
      const template=list.find(item=>{try{return item.url===src||new URL(item.url,location.origin).href===absolute;}catch{return item.url===src;}});
      if(!template) return;
      state.templateId=template.id;
      const count=Math.max(1,boxes().length);
      const areas=Array.isArray(template.textAreas)?template.textAreas:[];
      state.styles=Array.from({length:count},(_,i)=>normalizeStyle(areas[i]||{}));
      state.active=clamp(state.active,0,count-1);
      applyAll();
    }catch{}
  }

  document.addEventListener('pointerdown',e=>{
    const box=e.target.closest?.('#bgMapPreview .bg-multi-map-box');
    if(!box) return;
    state.active=activeIndexFromBox(box);
    syncPanel();
  },true);

  document.addEventListener('pointerup',e=>{
    const box=e.target.closest?.('#bgMapPreview .bg-multi-map-box');
    if(!box) return;
    const index=activeIndexFromBox(box);
    if(styleFor(index).shape==='circle') requestAnimationFrame(()=>{makeCircle(index);styleBox(box,index);});
  },true);

  const observer=new MutationObserver(mutations=>{
    if(!q('#bgEditPanel')||q('#bgEditPanel').classList.contains('hidden')) return;
    let changed=false;
    for(const m of mutations){ if([...m.addedNodes,...m.removedNodes].some(node=>node.nodeType===1 && (node.matches?.('.bg-multi-map-box')||node.querySelector?.('.bg-multi-map-box')))){changed=true;break;} }
    if(!changed) return;
    const count=boxes().length;
    while(state.styles.length<count) state.styles.push(defaultStyle());
    state.styles.length=count;
    state.active=clamp(state.active,0,Math.max(0,count-1));
    requestAnimationFrame(applyAll);
  });

  function boot(){
    ensureStyles();
    installPanel();
    const preview=q('#bgMapPreview'); if(preview&&!preview.dataset.textBoxStyleObserved){preview.dataset.textBoxStyleObserved='1';observer.observe(preview,{childList:true});}
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-bg-edit]')) setTimeout(()=>{boot();loadForCurrentTemplate();},100);
  });
  window.addEventListener('focus',()=>setTimeout(()=>{boot();loadForCurrentTemplate();},120));
  setInterval(boot,600);
})();
