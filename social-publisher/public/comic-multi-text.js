// Multi-text mapping layer for Comic Blast Studio.
// Adds multiple independently positioned text areas while preserving the original single-bubble flow.
(() => {
  if (window.__comicMultiTextInstalled) return;
  window.__comicMultiTextInstalled = true;

  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const fallback = () => ({x:0.08,y:0.055,width:0.84,height:0.27});
  const state = {
    templates: [],
    mapId: '',
    mapAreas: [],
    activeMapIndex: 0,
    extraTexts: new Map(),
  };

  function toastSafe(message) {
    if (typeof window.toast === 'function') window.toast(message);
  }

  function normalizeArea(area={}) {
    const x = clamp(Number(area.x)||0,0,.95);
    const y = clamp(Number(area.y)||0,0,.95);
    const width = clamp(Number(area.width)||.25,.08,1-x);
    const height = clamp(Number(area.height)||.12,.06,1-y);
    return {x,y,width,height};
  }

  function areasFor(template) {
    if (Array.isArray(template?.textAreas) && template.textAreas.length) {
      return template.textAreas.slice(0,12).map(normalizeArea);
    }
    if (template?.bubble && Number(template.bubble.width) > .08 && Number(template.bubble.height) > .06) {
      return [normalizeArea(template.bubble)];
    }
    return [fallback()];
  }

  async function loadTemplates() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (response.ok) state.templates = Array.isArray(data.templates) ? data.templates : [];
    } catch {}
    return state.templates;
  }

  function selectedTemplate() {
    const id = q('#comicScenePicker')?.value || '';
    return state.templates.find(item => item.id === id) || null;
  }

  function ensureStyles() {
    if (q('#comicMultiTextStyles')) return;
    const style = document.createElement('style');
    style.id = 'comicMultiTextStyles';
    style.textContent = `
      body.recovery-easy .comic-multi-map-box{position:absolute;border:2px dashed #ffbd59;background:rgba(255,189,89,.14);border-radius:12px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#fff6dd;font-weight:900;font-size:12px;text-shadow:0 1px 3px #000;touch-action:none;z-index:4}
      body.recovery-easy .comic-multi-map-box.active{border-style:solid;box-shadow:0 0 0 2px rgba(255,189,89,.28)}
      body.recovery-easy .comic-multi-map-box .comic-multi-label{pointer-events:none;background:rgba(0,0,0,.45);border-radius:999px;padding:3px 7px}
      body.recovery-easy .comic-multi-map-handle{position:absolute;width:28px;height:28px;right:-8px;bottom:-8px;border-radius:50%;background:#ffbd59;border:3px solid #0b1017;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      body.recovery-easy .comic-multi-map-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      body.recovery-easy .comic-multi-text-list{display:grid;gap:9px;margin-top:10px}
      body.recovery-easy .comic-multi-text-row{padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:#0b1119}
      body.recovery-easy .comic-multi-text-row label{display:block;font-size:13px;font-weight:850;color:#dbe3ef;margin-bottom:6px}
      body.recovery-easy .comic-multi-edit-text{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;color:#111;font-weight:850;line-height:1.12;white-space:pre-wrap;overflow:hidden;outline:none;padding:4px;box-sizing:border-box;touch-action:manipulation;text-wrap:balance;text-shadow:none;z-index:3}
      body.recovery-easy .comic-multi-edit-text:empty::before{content:'Tap here and type';color:#777}
      @media(max-width:430px){body.recovery-easy .comic-multi-map-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function mapPreview() { return q('#comicMapPreview'); }

  function renderMapAreas() {
    const preview = mapPreview();
    if (!preview) return;
    qa('.comic-multi-map-box',preview).forEach(el => el.remove());
    const old = q('#comicMapBox',preview);
    if (old) old.style.display = 'none';
    state.mapAreas.forEach((area,index) => {
      const box = document.createElement('div');
      box.className = `comic-multi-map-box${index === state.activeMapIndex ? ' active' : ''}`;
      box.dataset.index = String(index);
      box.style.left = `${area.x*100}%`;
      box.style.top = `${area.y*100}%`;
      box.style.width = `${area.width*100}%`;
      box.style.height = `${area.height*100}%`;
      box.innerHTML = `<span class="comic-multi-label">TEXT ${index+1}</span><span class="comic-multi-map-handle" aria-hidden="true"></span>`;
      wireMapArea(box,index,preview);
      preview.appendChild(box);
    });
    const remove = q('#comicRemoveTextMapBtn');
    if (remove) remove.disabled = state.mapAreas.length <= 1;
  }

  function wireMapArea(box,index,preview) {
    let mode = '', startX = 0, startY = 0, start = null;
    const begin = (event,nextMode) => {
      event.preventDefault();
      state.activeMapIndex = index;
      mode = nextMode;
      startX = event.clientX;
      startY = event.clientY;
      start = {...state.mapAreas[index]};
      box.setPointerCapture?.(event.pointerId);
      renderMapAreas();
    };
    box.addEventListener('pointerdown', event => begin(event,event.target.classList.contains('comic-multi-map-handle') ? 'resize' : 'move'));
    box.addEventListener('pointermove', event => {
      if (!mode || !start || index !== state.activeMapIndex) return;
      event.preventDefault();
      const rect = preview.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dx = (event.clientX-startX)/rect.width;
      const dy = (event.clientY-startY)/rect.height;
      const area = state.mapAreas[index];
      if (mode === 'move') {
        area.x = clamp(start.x+dx,0,1-start.width);
        area.y = clamp(start.y+dy,0,1-start.height);
      } else {
        area.width = clamp(start.width+dx,.08,1-start.x);
        area.height = clamp(start.height+dy,.06,1-start.y);
      }
      box.style.left = `${area.x*100}%`;
      box.style.top = `${area.y*100}%`;
      box.style.width = `${area.width*100}%`;
      box.style.height = `${area.height*100}%`;
    });
    const stop = () => { mode=''; start=null; };
    box.addEventListener('pointerup',stop);
    box.addEventListener('pointercancel',stop);
  }

  function addMapArea() {
    if (state.mapAreas.length >= 12) return toastSafe('You can map up to 12 text areas on one image.');
    const previous = state.mapAreas[state.mapAreas.length-1] || fallback();
    const width = Math.min(previous.width,.64);
    const height = Math.min(previous.height,.22);
    const x = clamp(previous.x+.04,0,1-width);
    const y = clamp(previous.y+previous.height+.035,0,1-height);
    state.mapAreas.push({x,y,width,height});
    state.activeMapIndex = state.mapAreas.length-1;
    renderMapAreas();
  }

  function removeMapArea() {
    if (state.mapAreas.length <= 1) return;
    state.mapAreas.splice(state.activeMapIndex,1);
    state.activeMapIndex = clamp(state.activeMapIndex,0,state.mapAreas.length-1);
    renderMapAreas();
  }

  async function saveMapAreas() {
    if (!state.mapId) return;
    const button = q('#comicSaveMapBtn');
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const response = await fetch(`/api/comic-templates/${encodeURIComponent(state.mapId)}`,{
        method:'PATCH',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({textAreas:state.mapAreas}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the text areas.');
      await loadTemplates();
      syncCreateForSelection();
      toastSafe(`${state.mapAreas.length} text area${state.mapAreas.length === 1 ? '' : 's'} saved.`);
    } catch (error) {
      toastSafe(error.message || 'Could not save the text areas.');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Save Text Areas'; }
    }
  }

  async function beginMap(id) {
    state.mapId = id;
    if (!state.templates.length) await loadTemplates();
    const template = state.templates.find(item => item.id === id);
    state.mapAreas = areasFor(template);
    state.activeMapIndex = 0;
    setTimeout(renderMapAreas,0);
  }

  function installMapControls() {
    const save = q('#comicSaveMapBtn');
    if (!save || save.dataset.multiTextReady) return;
    save.dataset.multiTextReady = '1';
    const clean = save.cloneNode(true);
    clean.id = 'comicSaveMapBtn';
    clean.textContent = 'Save Text Areas';
    save.replaceWith(clean);
    clean.addEventListener('click',saveMapAreas);

    const actions = document.createElement('div');
    actions.className = 'comic-multi-map-actions';
    actions.innerHTML = '<button id="comicAddTextMapBtn" class="button secondary" type="button">＋ Add Text Mapping</button><button id="comicRemoveTextMapBtn" class="button secondary" type="button">Remove Selected Mapping</button>';
    clean.before(actions);
    q('#comicAddTextMapBtn')?.addEventListener('click',addMapArea);
    q('#comicRemoveTextMapBtn')?.addEventListener('click',removeMapArea);

    document.addEventListener('click',event => {
      const button = event.target.closest?.('[data-map-template]');
      if (button?.dataset.mapTemplate) beginMap(button.dataset.mapTemplate);
    },true);
  }

  function getExtraTexts(templateId,count) {
    const current = state.extraTexts.get(templateId) || [];
    while (current.length < count) current.push('');
    current.length = count;
    state.extraTexts.set(templateId,current);
    return current;
  }

  function currentFontScale() {
    const slider = q('#comicFontRange');
    return clamp(Number(slider?.value || 46)/1000,.02,.09);
  }

  function applyExtraGeometry() {
    const template = selectedTemplate();
    const preview = q('#comicPreview .comic-preview');
    if (!template || !preview) return;
    const areas = areasFor(template);
    const scale = currentFontScale();
    qa('.comic-multi-edit-text',preview).forEach((editor,index) => {
      const area = areas[index+1];
      if (!area) return;
      editor.style.left = `${area.x*100}%`;
      editor.style.top = `${area.y*100}%`;
      editor.style.width = `${area.width*100}%`;
      editor.style.height = `${area.height*100}%`;
      editor.style.fontSize = `${Math.max(12,preview.clientWidth*scale)}px`;
    });
  }

  function renderExtraTextUi() {
    const template = selectedTemplate();
    const message = q('#comicMessage');
    const preview = q('#comicPreview .comic-preview');
    if (!template || !message || !preview) return;
    const areas = areasFor(template);

    q('#comicMultiTextList')?.remove();
    qa('.comic-multi-edit-text',preview).forEach(el => el.remove());
    const existingPrimaryLabel = message.closest('div')?.querySelector('label');
    if (existingPrimaryLabel) existingPrimaryLabel.textContent = areas.length > 1 ? 'Text 1' : 'Message — edit anything you want';
    if (areas.length <= 1) return;

    const extras = getExtraTexts(template.id,areas.length-1);
    const list = document.createElement('div');
    list.id = 'comicMultiTextList';
    list.className = 'comic-multi-text-list';
    extras.forEach((text,index) => {
      const row = document.createElement('div');
      row.className = 'comic-multi-text-row';
      row.innerHTML = `<label for="comicExtraText${index}">Text ${index+2}</label><textarea id="comicExtraText${index}" class="comic-textarea" maxlength="2200" placeholder="Text for mapped area ${index+2}"></textarea>`;
      const area = row.querySelector('textarea');
      area.value = text;
      area.addEventListener('input',() => {
        extras[index] = area.value.slice(0,2200);
        const overlay = q(`[data-comic-extra-index="${index}"]`,preview);
        if (overlay && overlay.innerText !== extras[index]) overlay.innerText = extras[index];
      });
      list.appendChild(row);

      const overlay = document.createElement('div');
      overlay.className = 'comic-multi-edit-text';
      overlay.contentEditable = 'true';
      overlay.setAttribute('role','textbox');
      overlay.dataset.comicExtraIndex = String(index);
      overlay.innerText = text;
      overlay.addEventListener('input',() => {
        extras[index] = overlay.innerText.slice(0,2200);
        if (area.value !== extras[index]) area.value = extras[index];
      });
      preview.appendChild(overlay);
    });
    message.closest('div')?.after(list);
    applyExtraGeometry();
  }

  async function syncCreateForSelection() {
    if (!q('#comicScenePicker')) return;
    await loadTemplates();
    renderExtraTextUi();
    applyExtraGeometry();
  }

  function wrapCanvasText(ctx,text,maxWidth) {
    const lines = [];
    for (const paragraph of String(text || '').split(/\n/)) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      const words = paragraph.trim().split(/\s+/);
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
        else line = candidate;
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function loadImage(src) {
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load this background.'));
      image.src = src;
    });
  }

  async function makeMultiTextPost() {
    const template = selectedTemplate();
    if (!template) return toastSafe('Choose a background first.');
    const areas = areasFor(template);
    const primary = String(q('#comicMessage')?.value || '').trim();
    const extras = getExtraTexts(template.id,Math.max(0,areas.length-1));
    const texts = [primary,...extras.map(value => String(value || '').trim())];
    if (!texts.some(Boolean)) return toastSafe('Type some text first.');
    const button = q('#comicMakeBtn');
    const old = button?.textContent || 'Make Comic Post';
    if (button) { button.disabled = true; button.textContent = 'Making graphic…'; }
    try {
      const image = await loadImage(template.url);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const fontSize = Math.max(18,canvas.width*currentFontScale());
      const pad = Math.max(8,fontSize*.18);
      for (let index=0; index<areas.length; index++) {
        const text = texts[index] || '';
        if (!text) continue;
        const area = areas[index];
        const x=area.x*canvas.width, y=area.y*canvas.height, w=area.width*canvas.width, h=area.height*canvas.height;
        ctx.save();
        ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
        ctx.fillStyle='#111111'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font=`850 ${fontSize}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
        const lines=wrapCanvasText(ctx,text,w-pad*2);
        const lineHeight=fontSize*1.12;
        let lineY=y+h/2-((lines.length-1)*lineHeight)/2;
        for (const line of lines) { ctx.fillText(line,x+w/2,lineY,w-pad*2); lineY+=lineHeight; }
        ctx.restore();
      }
      const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not render the graphic.')),'image/jpeg',.95));
      const file = new File([blob],`comic-blast-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
      if (typeof window.navigate === 'function') window.navigate('create');
      if (typeof window.handleMedia === 'function') await window.handleMedia(file);
      else throw new Error('The media uploader is not ready.');
      const caption = q('#caption');
      if (caption && !caption.value.trim() && primary) {
        caption.value = primary;
        caption.dispatchEvent(new Event('input',{bubbles:true}));
      }
      const format = q('#comicFormatPicker')?.value || 'feed';
      const igType = format === 'story' ? 'story' : 'post';
      q(`input[name="igType"][value="${igType}"]`)?.closest('.segment')?.click();
      toastSafe('Comic Blast graphic is ready.');
      q('#dropZone')?.scrollIntoView({behavior:'smooth',block:'center'});
    } catch (error) {
      toastSafe(error.message || 'Could not make the Comic Blast graphic.');
    } finally {
      if (button) { button.disabled=false; button.textContent=old; }
    }
  }

  function installCreateControls() {
    const picker = q('#comicScenePicker');
    const make = q('#comicMakeBtn');
    if (!picker || !make || make.dataset.multiTextReady) return;
    make.dataset.multiTextReady = '1';
    const clean = make.cloneNode(true);
    clean.id = 'comicMakeBtn';
    clean.dataset.multiTextReady = '1';
    make.replaceWith(clean);
    clean.addEventListener('click',makeMultiTextPost);
    picker.addEventListener('change',() => setTimeout(syncCreateForSelection,0));
    q('#comicFormatPicker')?.addEventListener('change',() => setTimeout(syncCreateForSelection,0));
    q('#comicCategoryPicker')?.addEventListener('change',() => setTimeout(syncCreateForSelection,0));
    q('#comicFontRange')?.addEventListener('input',applyExtraGeometry);
    q('#comicFontDown')?.addEventListener('click',() => setTimeout(applyExtraGeometry,0));
    q('#comicFontUp')?.addEventListener('click',() => setTimeout(applyExtraGeometry,0));
    window.addEventListener('resize',applyExtraGeometry,{passive:true});
    syncCreateForSelection();
  }

  function install() {
    ensureStyles();
    installMapControls();
    installCreateControls();
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued=false; install(); });
  };
  install();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
