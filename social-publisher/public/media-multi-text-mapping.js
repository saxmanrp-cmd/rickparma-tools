// Adds multiple independently draggable text mappings to Media > Background Library > Edit Background.
(() => {
  if (window.__mediaMultiTextMappingInstalled) return;
  window.__mediaMultiTextMappingInstalled = true;

  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const fallback = () => ({x:0.08,y:0.055,width:0.84,height:0.27});
  const state = { templates:[], template:null, areas:[], active:0 };

  function normalize(area={}) {
    const x=clamp(Number(area.x)||0,0,.95), y=clamp(Number(area.y)||0,0,.95);
    const width=clamp(Number(area.width)||.25,.08,1-x), height=clamp(Number(area.height)||.12,.06,1-y);
    return {x,y,width,height};
  }
  function areasFor(template) {
    if (Array.isArray(template?.textAreas) && template.textAreas.length) return template.textAreas.slice(0,12).map(normalize);
    if (template?.bubble && Number(template.bubble.width)>.08 && Number(template.bubble.height)>.06) return [normalize(template.bubble)];
    return [fallback()];
  }
  function toastSafe(message){ if(typeof window.toast==='function') window.toast(message); }

  function ensureStyles(){
    if(q('#mediaMultiTextMappingStyles')) return;
    const style=document.createElement('style');
    style.id='mediaMultiTextMappingStyles';
    style.textContent=`
      body.recovery-easy .bg-multi-map-box{position:absolute;border:2px dashed #ffbd59;background:rgba(255,189,89,.14);border-radius:11px;box-sizing:border-box;touch-action:none;z-index:6}
      body.recovery-easy .bg-multi-map-box.active{border-style:solid;box-shadow:0 0 0 2px rgba(255,189,89,.30)}
      body.recovery-easy .bg-multi-map-label{position:absolute;inset:0;display:grid;place-items:center;color:#fff4d2;font-size:12px;font-weight:900;text-shadow:0 1px 3px #000;pointer-events:none}
      body.recovery-easy .bg-multi-map-handle{position:absolute;width:28px;height:28px;right:-9px;bottom:-9px;border-radius:50%;background:#ffbd59;border:3px solid #101722;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      body.recovery-easy .bg-multi-map-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 0}
      body.recovery-easy .bg-multi-map-note{font-size:12px;color:#aab4c2;margin-top:7px;line-height:1.35}
      @media(max-width:430px){body.recovery-easy .bg-multi-map-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function loadTemplates(){
    try{
      const r=await fetch('/api/comic-templates',{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      state.templates=Array.isArray(d.templates)?d.templates:[];
    }catch{}
  }

  function currentTemplateFromImage(){
    const src=q('#bgEditImage')?.getAttribute('src')||'';
    if(!src) return null;
    return state.templates.find(t=>t.url===src || new URL(t.url,location.origin).href===new URL(src,location.origin).href) || null;
  }

  function render(){
    const preview=q('#bgMapPreview');
    if(!preview) return;
    qa('.bg-multi-map-box',preview).forEach(el=>el.remove());
    const old=q('#bgMapBox',preview); if(old) old.style.display='none';
    state.areas.forEach((a,index)=>{
      const box=document.createElement('div');
      box.className=`bg-multi-map-box${index===state.active?' active':''}`;
      box.style.left=`${a.x*100}%`; box.style.top=`${a.y*100}%`; box.style.width=`${a.width*100}%`; box.style.height=`${a.height*100}%`;
      box.innerHTML=`<span class="bg-multi-map-label">TEXT ${index+1}</span><span class="bg-multi-map-handle"></span>`;
      wireBox(box,index,preview);
      preview.appendChild(box);
    });
    const remove=q('#bgRemoveTextMapping'); if(remove) remove.disabled=state.areas.length<=1;
    const note=q('#bgMultiTextMappingNote'); if(note) note.textContent=`${state.areas.length} text mapping${state.areas.length===1?'':'s'} on this background.`;
  }

  function wireBox(box,index,preview){
    let mode='',sx=0,sy=0,start=null;
    const begin=(e,m)=>{e.preventDefault();state.active=index;mode=m;sx=e.clientX;sy=e.clientY;start={...state.areas[index]};box.setPointerCapture?.(e.pointerId);render();};
    box.addEventListener('pointerdown',e=>begin(e,e.target.classList.contains('bg-multi-map-handle')?'resize':'move'));
    box.addEventListener('pointermove',e=>{
      if(!mode||!start||index!==state.active)return;
      e.preventDefault(); const r=preview.getBoundingClientRect(); if(!r.width||!r.height)return;
      const dx=(e.clientX-sx)/r.width,dy=(e.clientY-sy)/r.height,a=state.areas[index];
      if(mode==='move'){a.x=clamp(start.x+dx,0,1-start.width);a.y=clamp(start.y+dy,0,1-start.height);}else{a.width=clamp(start.width+dx,.08,1-start.x);a.height=clamp(start.height+dy,.06,1-start.y);}
      box.style.left=`${a.x*100}%`;box.style.top=`${a.y*100}%`;box.style.width=`${a.width*100}%`;box.style.height=`${a.height*100}%`;
    });
    const stop=()=>{mode='';start=null;}; box.addEventListener('pointerup',stop); box.addEventListener('pointercancel',stop);
  }

  function installControls(){
    const preview=q('#bgMapPreview'); const save=q('#bgEditSave'); if(!preview||!save) return false;
    if(!q('#bgAddTextMapping')){
      const actions=document.createElement('div'); actions.className='bg-multi-map-actions';
      actions.innerHTML='<button id="bgAddTextMapping" class="bg-media-btn" type="button">＋ Add Text Mapping</button><button id="bgRemoveTextMapping" class="bg-media-btn" type="button">Remove Selected</button>';
      const note=document.createElement('div'); note.id='bgMultiTextMappingNote'; note.className='bg-multi-map-note';
      preview.after(actions,note);
      q('#bgAddTextMapping')?.addEventListener('click',()=>{
        if(state.areas.length>=12) return toastSafe('You can map up to 12 text areas on one background.');
        const p=state.areas[state.areas.length-1]||fallback(), width=Math.min(p.width,.64), height=Math.min(p.height,.22);
        state.areas.push({x:clamp(p.x+.04,0,1-width),y:clamp(p.y+p.height+.035,0,1-height),width,height}); state.active=state.areas.length-1; render();
      });
      q('#bgRemoveTextMapping')?.addEventListener('click',()=>{if(state.areas.length<=1)return;state.areas.splice(state.active,1);state.active=clamp(state.active,0,state.areas.length-1);render();});
    }
    if(!save.dataset.multiTextCapture){
      save.dataset.multiTextCapture='1';
      save.addEventListener('click',async()=>{
        if(!state.template) return;
        try{
          const r=await fetch(`/api/comic-templates/${encodeURIComponent(state.template.id)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({textAreas:state.areas})});
          if(!r.ok) throw new Error('Could not save multiple text mappings.');
        }catch(e){toastSafe(e.message||'Could not save multiple text mappings.');}
      },true);
    }
    return true;
  }

  async function syncEditor(){
    if(q('#bgEditPanel')?.classList.contains('hidden')) return;
    if(!state.templates.length) await loadTemplates();
    const template=currentTemplateFromImage(); if(!template) return;
    if(state.template?.id!==template.id){state.template=template;state.areas=areasFor(template);state.active=0;}
    installControls(); render();
  }

  ensureStyles();
  const observer=new MutationObserver(()=>{installControls();syncEditor();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','src']});
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-bg-edit]')) setTimeout(syncEditor,80);});
  window.addEventListener('focus',()=>setTimeout(syncEditor,60));
  setTimeout(()=>{installControls();syncEditor();},300);
})();
