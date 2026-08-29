// Applies saved text-box styles in Create and renders them into generated images.
(() => {
  if (window.__comicTextBoxRendererInstalled) return;
  window.__comicTextBoxRendererInstalled = true;

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  let templates=[];
  let refreshPromise=null;
  let queued=false;

  function hexToRgba(hex,alpha){
    const value=String(hex||'#FFFFFF').replace('#','');
    const n=parseInt(value,16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${clamp(Number(alpha)||0,0,1)})`;
  }

  function normalize(area={}){
    return {
      ...area,
      shape:String(area.shape||'box').toLowerCase()==='circle'?'circle':'box',
      fillColor:/^#[0-9a-f]{6}$/i.test(area.fillColor||'')?area.fillColor:'#FFFFFF',
      fillOpacity:clamp(Number(area.fillOpacity)||0,0,1),
      borderColor:/^#[0-9a-f]{6}$/i.test(area.borderColor||'')?area.borderColor:'#FFFFFF',
      borderOpacity:clamp(Number(area.borderOpacity ?? 1),0,1),
      borderWidth:clamp(Number(area.borderWidth)||0,0,12),
      cornerRadius:clamp(Number(area.cornerRadius)||12,0,48),
    };
  }

  async function loadTemplates(force=false){
    if(templates.length&&!force) return templates;
    if(refreshPromise) return refreshPromise;
    refreshPromise=(async()=>{
      try{
        const r=await fetch('/api/comic-templates',{cache:'no-store'});
        const d=await r.json().catch(()=>({}));
        if(r.ok) templates=Array.isArray(d.templates)?d.templates:[];
      }catch{}
      refreshPromise=null;
      return templates;
    })();
    return refreshPromise;
  }

  function selectedTemplate(){
    const id=q('#comicScenePicker')?.value||'';
    return templates.find(t=>t.id===id)||null;
  }

  function areasFor(template){
    const areas=Array.isArray(template?.textAreas)&&template.textAreas.length?template.textAreas:[template?.bubble||{}];
    return areas.map(normalize);
  }

  function hasCustomStyle(area){
    const s=normalize(area);
    return s.shape==='circle'||s.fillOpacity>0||s.borderWidth>0||s.cornerRadius!==12;
  }

  function previewEditors(){
    const primary=q('#comicBubbleText');
    const extras=qa('#comicPreview .comic-multi-edit-text');
    return [primary,...extras].filter(Boolean);
  }

  function applyAreaStyle(editor,area){
    const s=normalize(area);
    editor.style.background=hexToRgba(s.fillColor,s.fillOpacity);
    editor.style.border=`${s.borderWidth}px solid ${hexToRgba(s.borderColor,s.borderOpacity)}`;
    editor.style.borderRadius=s.shape==='circle'?'50%':`${s.cornerRadius}px`;
    editor.style.clipPath=s.shape==='circle'?'ellipse(50% 50% at 50% 50%)':'';
    editor.style.padding=`${Math.max(4,s.borderWidth+4)}px`;
  }

  async function syncPreview(force=false){
    if(!q('#comicScenePicker')) return;
    await loadTemplates(force);
    const template=selectedTemplate(); if(!template) return;
    const areas=areasFor(template),editors=previewEditors();
    editors.forEach((editor,index)=>applyAreaStyle(editor,areas[index]||{}));
  }

  function pathShape(ctx,x,y,w,h,area){
    const s=normalize(area);
    ctx.beginPath();
    if(s.shape==='circle'){
      ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
      return;
    }
    const r=Math.min(s.cornerRadius,w/2,h/2);
    ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  }

  function drawShape(ctx,x,y,w,h,area,scale){
    const s=normalize(area);
    if(s.fillOpacity>0){pathShape(ctx,x,y,w,h,s);ctx.fillStyle=hexToRgba(s.fillColor,s.fillOpacity);ctx.fill();}
    if(s.borderWidth>0){pathShape(ctx,x,y,w,h,s);ctx.strokeStyle=hexToRgba(s.borderColor,s.borderOpacity);ctx.lineWidth=Math.max(1,s.borderWidth*scale);ctx.stroke();}
  }

  function wrapText(ctx,text,maxWidth){
    const lines=[];
    for(const paragraph of String(text||'').split(/\n/)){
      if(!paragraph.trim()){lines.push('');continue;}
      const words=paragraph.trim().split(/\s+/); let line='';
      for(const word of words){
        const candidate=line?`${line} ${word}`:word;
        if(line&&ctx.measureText(candidate).width>maxWidth){lines.push(line);line=word;}else line=candidate;
      }
      if(line) lines.push(line);
    }
    return lines;
  }

  function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load this background.'));image.src=src;});}

  function textValues(count){
    const values=[String(q('#comicMessage')?.value||'')];
    for(let i=0;i<count-1;i++) values.push(String(q(`#comicExtraText${i}`)?.value||''));
    return values;
  }

  async function renderStyledPost(event){
    await loadTemplates(true);
    const template=selectedTemplate(); if(!template) return;
    const areas=areasFor(template);
    if(!areas.some(hasCustomStyle)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const button=q('#comicMakeBtn');
    const old=button?.textContent||'Make Comic Post';
    if(button){button.disabled=true;button.textContent='Making graphic…';}

    try{
      await syncPreview(false);
      const image=await loadImage(template.url);
      const canvas=document.createElement('canvas');
      canvas.width=image.naturalWidth||image.width; canvas.height=image.naturalHeight||image.height;
      const ctx=canvas.getContext('2d'); ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const preview=q('#comicPreview .comic-preview')||q('#comicPreview');
      const previewWidth=Math.max(1,preview?.clientWidth||440);
      const scale=canvas.width/previewWidth;
      const editors=previewEditors();
      const texts=textValues(areas.length);

      for(let i=0;i<areas.length;i++){
        const area=areas[i],text=texts[i]||'';
        const x=Number(area.x||0)*canvas.width,y=Number(area.y||0)*canvas.height,w=Number(area.width||.25)*canvas.width,h=Number(area.height||.12)*canvas.height;
        drawShape(ctx,x,y,w,h,area,scale);
        if(!text.trim()) continue;
        const editor=editors[i]; const computed=editor?getComputedStyle(editor):null;
        const fontSize=Math.max(18,(parseFloat(computed?.fontSize)||18)*scale);
        const fontWeight=computed?.fontWeight||'850';
        const fontFamily=computed?.fontFamily||'-apple-system, BlinkMacSystemFont, Arial, sans-serif';
        const color=computed?.color||'#111111';
        const pad=Math.max(8,(normalize(area).borderWidth+6)*scale);
        ctx.save(); pathShape(ctx,x,y,w,h,area); ctx.clip();
        ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`${fontWeight} ${fontSize}px ${fontFamily}`;
        const lines=wrapText(ctx,text,Math.max(10,w-pad*2)); const lineHeight=fontSize*1.12;
        let lineY=y+h/2-((lines.length-1)*lineHeight)/2;
        for(const line of lines){ctx.fillText(line,x+w/2,lineY,Math.max(10,w-pad*2));lineY+=lineHeight;}
        ctx.restore();
      }

      const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not render the graphic.')),'image/jpeg',.95));
      const file=new File([blob],`styled-comic-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
      if(typeof window.navigate==='function') window.navigate('create');
      if(typeof window.handleMedia==='function') await window.handleMedia(file); else throw new Error('The media uploader is not ready.');
      const caption=q('#caption'); const primary=String(q('#comicMessage')?.value||'').trim();
      if(caption&&!caption.value.trim()&&primary){caption.value=primary;caption.dispatchEvent(new Event('input',{bubbles:true}));}
      if(typeof window.toast==='function') window.toast('Styled graphic is ready.');
      q('#dropZone')?.scrollIntoView({behavior:'smooth',block:'center'});
    }catch(error){if(typeof window.toast==='function') window.toast(error.message||'Could not make the styled graphic.');}
    finally{if(button){button.disabled=false;button.textContent=old;}}
  }

  document.addEventListener('click',event=>{
    if(event.target.closest?.('#comicMakeBtn')) renderStyledPost(event);
    if(event.target.closest?.('[data-bg-edit]')) templates=[];
  },true);
  document.addEventListener('change',event=>{
    if(event.target.matches?.('#comicScenePicker,#comicCategoryPicker,#comicFormatPicker,#comicFormatAllPicker')) setTimeout(()=>syncPreview(true),80);
  });

  const observer=new MutationObserver(()=>{
    if(queued) return; queued=true;
    requestAnimationFrame(()=>{queued=false;syncPreview(false);});
  });
  const create=q('#view-create'); if(create) observer.observe(create,{childList:true,subtree:true});
  setTimeout(()=>syncPreview(true),500);
})();
