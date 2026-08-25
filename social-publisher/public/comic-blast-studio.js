// Comic Blast Studio: visual speech-bubble editor + reusable background uploader.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const TOKEN_KEY = 'socialPublisherTextBlastToken';
  const state = {
    templates: [],
    filtered: [],
    selectedId: '',
    format: 'feed',
    text: '',
    fontScale: 0.046,
    blasts: [],
    uploadFile: null,
    uploadUrl: '',
    uploadBox: { x:0.08, y:0.06, width:0.84, height:0.26 },
  };

  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const esc = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = (value='') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'comic-scene';

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function injectStyles() {
    if (q('#comicBlastStudioStyles')) return;
    const style = document.createElement('style');
    style.id = 'comicBlastStudioStyles';
    style.textContent = `
      body.recovery-easy .comic-studio{margin:0 0 14px;border:1px solid rgba(255,184,48,.3);border-radius:18px;background:linear-gradient(145deg,#21140b,#111722 60%,#171026);overflow:hidden}
      body.recovery-easy .comic-studio>summary{list-style:none;cursor:pointer;padding:16px 17px;font-size:19px;font-weight:950;color:#fff3d2;display:flex;align-items:center;justify-content:space-between;gap:10px}
      body.recovery-easy .comic-studio>summary::-webkit-details-marker{display:none}
      body.recovery-easy .comic-studio>summary::after{content:'＋';font-size:22px;color:#ffca68}
      body.recovery-easy .comic-studio[open]>summary::after{content:'−'}
      body.recovery-easy .comic-studio-inner{padding:0 15px 16px}
      body.recovery-easy .comic-studio-copy{font-size:15px;line-height:1.45;color:#bcc5d2;margin:0 0 13px}
      body.recovery-easy .comic-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      body.recovery-easy .comic-grid.one{grid-template-columns:1fr}
      body.recovery-easy .comic-label{display:block;font-size:14px;font-weight:850;color:#e9edf4;margin:0 0 6px}
      body.recovery-easy .comic-select,body.recovery-easy .comic-textarea,body.recovery-easy .comic-input{width:100%;border:1px solid rgba(255,255,255,.13);background:#0a1018;color:#fff;border-radius:13px;font-size:16px}
      body.recovery-easy .comic-select,body.recovery-easy .comic-input{min-height:50px;padding:0 12px}
      body.recovery-easy .comic-textarea{min-height:104px;padding:12px;line-height:1.4;resize:vertical}
      body.recovery-easy .comic-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}
      body.recovery-easy .comic-actions .button{min-height:50px!important;font-size:16px!important}
      body.recovery-easy .comic-preview-wrap{margin-top:12px;padding:10px;border-radius:16px;background:#070b11;border:1px solid rgba(255,255,255,.08)}
      body.recovery-easy .comic-preview{position:relative;width:min(100%,440px);margin:0 auto;border-radius:12px;overflow:hidden;background:#131923;box-shadow:0 10px 30px rgba(0,0,0,.24)}
      body.recovery-easy .comic-preview img{display:block;width:100%;height:auto}
      body.recovery-easy .comic-edit-text{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;color:#111;font-weight:850;line-height:1.12;white-space:pre-wrap;overflow:hidden;outline:none;padding:4px;touch-action:manipulation;text-wrap:balance;text-shadow:none}
      body.recovery-easy .comic-edit-text:empty::before{content:'Tap here and type';color:#777}
      body.recovery-easy .comic-font-row{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-top:10px}
      body.recovery-easy .comic-font-row button{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:#111824;color:#fff;font-size:20px;font-weight:900}
      body.recovery-easy .comic-font-row input{width:100%}
      body.recovery-easy .comic-fit{font-size:13px;line-height:1.35;margin-top:8px;color:#9aa7b9}
      body.recovery-easy .comic-fit.good{color:#81d59b}.comic-fit.warn{color:#ffb36c}
      body.recovery-easy .comic-empty{padding:18px 12px;text-align:center;color:#9ca7b7;font-size:15px;line-height:1.45}
      body.recovery-easy .comic-manager{margin-top:14px}
      body.recovery-easy .comic-upload-preview{position:relative;width:min(100%,400px);margin:12px auto 0;border-radius:14px;overflow:hidden;background:#0b1017;touch-action:none}
      body.recovery-easy .comic-upload-preview img{display:block;width:100%;height:auto}
      body.recovery-easy .comic-bubble-map{position:absolute;border:2px dashed #ffbd59;background:rgba(255,189,89,.14);border-radius:12px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#fff6dd;font-weight:900;font-size:13px;text-shadow:0 1px 3px #000;touch-action:none}
      body.recovery-easy .comic-bubble-map::after{content:'TEXT AREA'}
      body.recovery-easy .comic-resize-handle{position:absolute;width:28px;height:28px;right:-8px;bottom:-8px;border-radius:50%;background:#ffbd59;border:3px solid #0b1017;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      body.recovery-easy .comic-manager-note{font-size:13px;line-height:1.4;color:#9aa6b7;margin-top:9px}
      body.recovery-easy .comic-library-list{display:grid;gap:7px;margin-top:12px}
      body.recovery-easy .comic-library-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border-radius:12px;background:#0b1119;border:1px solid rgba(255,255,255,.07)}
      body.recovery-easy .comic-library-item strong{font-size:14px}.comic-library-item span{font-size:12px;color:#95a1b2}
      @media(max-width:430px){body.recovery-easy .comic-grid,body.recovery-easy .comic-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function fallbackBubble() {
    return { x:0.08, y:0.055, width:0.84, height:0.27 };
  }

  function normalizedBubble(template) {
    const b = template?.bubble || {};
    if (Number(b.width) > 0.08 && Number(b.height) > 0.06) {
      return {
        x:clamp(Number(b.x)||0,0,1),
        y:clamp(Number(b.y)||0,0,1),
        width:clamp(Number(b.width)||0,0.05,1),
        height:clamp(Number(b.height)||0,0.05,1),
      };
    }
    return fallbackBubble();
  }

  function selectedTemplate() {
    return state.templates.find(t => t.id === state.selectedId) || state.filtered[0] || null;
  }

  function applyFilter(keepSelection=true) {
    state.filtered = state.templates.filter(t => t.format === state.format || t.format === 'unknown');
    if (!keepSelection || !state.filtered.some(t => t.id === state.selectedId)) state.selectedId = state.filtered[0]?.id || '';
    renderTemplatePicker();
    renderPreview();
  }

  function renderTemplatePicker() {
    const select = q('#comicScenePicker');
    if (!select) return;
    if (!state.filtered.length) {
      select.innerHTML = '<option value="">No backgrounds uploaded yet</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = state.filtered.map(t => `<option value="${esc(t.id)}">${esc(t.name || t.id)}</option>`).join('');
    if (state.filtered.some(t => t.id === state.selectedId)) select.value = state.selectedId;
  }

  function renderLibraryList() {
    const list = q('#comicLibraryList');
    if (!list) return;
    if (!state.templates.length) {
      list.innerHTML = '<div class="comic-manager-note">No comic backgrounds uploaded yet.</div>';
      return;
    }
    list.innerHTML = state.templates.map(t => `<div class="comic-library-item"><strong>${esc(t.name || t.id)}</strong><span>${t.format === 'story' ? '9:16 Story' : t.format === 'feed' ? '4:5 Feed' : 'Unassigned'}</span></div>`).join('');
  }

  async function loadTemplates() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load comic backgrounds.');
      state.templates = Array.isArray(data.templates) ? data.templates : [];
      applyFilter(true);
      renderLibraryList();
      const count = q('#comicLibraryCount');
      if (count) count.textContent = `${state.templates.length} background${state.templates.length === 1 ? '' : 's'} saved`;
    } catch (error) {
      const empty = q('#comicEmptyState');
      if (empty) empty.textContent = error.message || 'Could not load comic backgrounds.';
    }
  }

  function renderPreview() {
    const preview = q('#comicPreview');
    const img = q('#comicPreviewImg');
    const editor = q('#comicBubbleText');
    const empty = q('#comicEmptyState');
    const template = selectedTemplate();
    if (!preview || !img || !editor || !empty) return;
    if (!template) {
      preview.classList.add('hidden');
      empty.classList.remove('hidden');
      empty.textContent = 'Upload your first 9:16 or 4:5 comic background in Settings.';
      return;
    }
    empty.classList.add('hidden');
    preview.classList.remove('hidden');
    if (img.dataset.templateId !== template.id) {
      img.dataset.templateId = template.id;
      img.src = template.url;
    }
    editor.textContent = state.text;
    applyEditorGeometry();
  }

  function applyEditorGeometry() {
    const preview = q('#comicPreview');
    const editor = q('#comicBubbleText');
    const template = selectedTemplate();
    if (!preview || !editor || !template) return;
    const b = normalizedBubble(template);
    editor.style.left = `${b.x*100}%`;
    editor.style.top = `${b.y*100}%`;
    editor.style.width = `${b.width*100}%`;
    editor.style.height = `${b.height*100}%`;
    editor.style.fontSize = `${Math.max(12, preview.clientWidth * state.fontScale)}px`;
    const slider = q('#comicFontRange');
    if (slider) slider.value = String(Math.round(state.fontScale*1000));
    requestAnimationFrame(updateFitStatus);
  }

  function updateFitStatus() {
    const editor = q('#comicBubbleText');
    const fit = q('#comicFitStatus');
    if (!editor || !fit) return;
    const tooBig = editor.scrollHeight > editor.clientHeight + 2 || editor.scrollWidth > editor.clientWidth + 2;
    fit.className = `comic-fit ${tooBig ? 'warn' : 'good'}`;
    fit.textContent = tooBig ? 'Text is too large for this bubble — pinch smaller or tap A−.' : '✓ Text fits inside the bubble.';
  }

  function setMessage(value) {
    state.text = String(value || '').slice(0,2200);
    const area = q('#comicMessage');
    const editor = q('#comicBubbleText');
    if (area && area.value !== state.text) area.value = state.text;
    if (editor && editor.textContent !== state.text) editor.textContent = state.text;
    requestAnimationFrame(updateFitStatus);
  }

  function adjustFont(delta) {
    state.fontScale = clamp(state.fontScale + delta,0.02,0.09);
    applyEditorGeometry();
  }

  function wirePinchZoom(editor) {
    let startDistance = 0;
    let startScale = state.fontScale;
    const distance = touches => {
      const [a,b] = touches;
      return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    };
    editor.addEventListener('touchstart', event => {
      if (event.touches.length === 2) {
        startDistance = distance(event.touches);
        startScale = state.fontScale;
      }
    }, {passive:true});
    editor.addEventListener('touchmove', event => {
      if (event.touches.length !== 2 || !startDistance) return;
      event.preventDefault();
      const ratio = distance(event.touches) / startDistance;
      state.fontScale = clamp(startScale * ratio,0.02,0.09);
      applyEditorGeometry();
    }, {passive:false});
  }

  async function loadBlasts() {
    const token = (() => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } })();
    const select = q('#comicBlastPicker');
    const status = q('#comicBlastStatus');
    if (!token) {
      if (status) status.textContent = 'Connect Text Blast above first, then come back here.';
      return;
    }
    if (status) status.textContent = 'Loading recent Text Blasts…';
    try {
      const response = await fetch('/api/text-blast/history',{headers:{'x-text-blast-token':token,accept:'application/json'},cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load Text Blasts.');
      state.blasts = Array.isArray(data.log) ? data.log.slice(0,20) : [];
      if (!select) return;
      if (!state.blasts.length) {
        select.innerHTML = '<option>No recent Text Blasts</option>';
        select.disabled = true;
        if (status) status.textContent = 'Connected, but no recent sent blasts were found.';
        return;
      }
      select.disabled = false;
      select.innerHTML = state.blasts.map((entry,index) => {
        const text = String(entry.message || '').replace(/\s+/g,' ').slice(0,58) || 'Media-only blast';
        return `<option value="${index}">${esc(text)}</option>`;
      }).join('');
      if (status) status.textContent = 'Choose a blast, then you can edit any words before making the graphic.';
      useSelectedBlast();
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not load Text Blasts.';
    }
  }

  function useSelectedBlast() {
    const select = q('#comicBlastPicker');
    const entry = state.blasts[Number(select?.value || 0)];
    if (!entry) return;
    setMessage(String(entry.message || '').replace(/\{\{\s*(first_name|name)\s*\}\}/gi,'friends').trim());
  }

  function randomScene() {
    if (!state.filtered.length) return toastSafe('Upload a comic background first.');
    const choices = state.filtered.length > 1 ? state.filtered.filter(t => t.id !== state.selectedId) : state.filtered;
    const template = choices[Math.floor(Math.random()*choices.length)] || state.filtered[0];
    state.selectedId = template.id;
    renderTemplatePicker();
    renderPreview();
    toastSafe(`Random scene: ${template.name || 'Comic background'}`);
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
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load that comic background.'));
      img.src = src;
    });
  }

  async function makeComicFile() {
    const template = selectedTemplate();
    if (!template) throw new Error('Choose a comic background first.');
    if (!state.text.trim()) throw new Error('Add a message first.');
    const image = await loadImage(template.url);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const b = normalizedBubble(template);
    const box = { x:b.x*canvas.width, y:b.y*canvas.height, width:b.width*canvas.width, height:b.height*canvas.height };
    const fontSize = Math.max(18,state.fontScale*canvas.width);
    const lineHeight = fontSize*1.12;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x,box.y,box.width,box.height);
    ctx.clip();
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${fontSize}px -apple-system,BlinkMacSystemFont,"Arial Narrow",Arial,sans-serif`;
    const lines = wrapCanvasText(ctx,state.text,Math.max(20,box.width-18));
    const totalHeight = lines.length*lineHeight;
    let y = box.y + box.height/2 - totalHeight/2 + lineHeight/2;
    for (const line of lines) {
      if (line) ctx.fillText(line,box.x+box.width/2,y);
      y += lineHeight;
    }
    ctx.restore();
    const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not make the comic image.')),'image/jpeg',.95));
    return new File([blob],`rick-parma-comic-${slug(template.name || template.id)}-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
  }

  async function useComicInCreate() {
    const button = q('#comicUseBtn');
    const old = button?.textContent || 'Use This Comic';
    if (button) { button.disabled = true; button.textContent = 'Making comic…'; }
    try {
      const file = await makeComicFile();
      if (typeof handleMedia === 'function') await handleMedia(file);
      const caption = q('#caption');
      if (caption && state.text.trim()) {
        caption.value = state.text.trim();
        caption.dispatchEvent(new Event('input',{bubbles:true}));
      }
      if (state.format === 'story') q('input[name="igType"][value="story"]')?.closest('.segment')?.click();
      else q('input[name="igType"][value="post"]')?.closest('.segment')?.click();
      toastSafe('Comic is ready in Create.');
      q('#dropZone')?.scrollIntoView({behavior:'smooth',block:'center'});
    } catch (error) {
      toastSafe(error.message || 'Could not make the comic.');
    } finally {
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  function injectCreateUi() {
    if (q('#comicBlastStudio')) return;
    const composer = q('#view-create .composer');
    if (!composer) return;
    const details = document.createElement('details');
    details.id = 'comicBlastStudio';
    details.className = 'comic-studio';
    details.innerHTML = `
      <summary>💥 Comic Blast Studio</summary>
      <div class="comic-studio-inner">
        <div class="comic-studio-copy">Pick a scene or let me choose one. Pull in a Text Blast, edit any words, then pinch the text bigger or smaller until it fits the speech bubble.</div>
        <div class="comic-grid">
          <div><label class="comic-label" for="comicFormat">Size</label><select id="comicFormat" class="comic-select"><option value="feed">4:5 · Feed · Vertical</option><option value="story">9:16 · Story · Vertical</option></select></div>
          <div><label class="comic-label" for="comicScenePicker">Scene</label><select id="comicScenePicker" class="comic-select"></select></div>
        </div>
        <div class="comic-actions"><button id="comicRandomBtn" class="button secondary" type="button">🎲 Random Scene</button><button id="comicLoadBlastsBtn" class="button secondary" type="button">💬 Load Text Blasts</button></div>
        <div style="margin-top:10px"><label class="comic-label" for="comicBlastPicker">Recent Text Blast</label><select id="comicBlastPicker" class="comic-select" disabled><option>Tap Load Text Blasts</option></select><div id="comicBlastStatus" class="comic-manager-note">Or just type your own message below.</div></div>
        <div style="margin-top:10px"><label class="comic-label" for="comicMessage">Message · edit anything you want</label><textarea id="comicMessage" class="comic-textarea" maxlength="2200" placeholder="Type or load your message here…"></textarea></div>
        <div class="comic-preview-wrap">
          <div id="comicEmptyState" class="comic-empty">Loading comic backgrounds…</div>
          <div id="comicPreview" class="comic-preview hidden"><img id="comicPreviewImg" alt="Comic scene preview" /><div id="comicBubbleText" class="comic-edit-text" contenteditable="true" role="textbox" aria-label="Edit speech bubble text"></div></div>
          <div class="comic-font-row"><button id="comicFontDown" type="button" aria-label="Make text smaller">A−</button><input id="comicFontRange" type="range" min="20" max="90" value="46" aria-label="Text size" /><button id="comicFontUp" type="button" aria-label="Make text larger">A＋</button></div>
          <div id="comicFitStatus" class="comic-fit">Pinch directly on the bubble text to resize it.</div>
        </div>
        <button id="comicUseBtn" class="button primary full" type="button" style="margin-top:11px">Use This Comic in Create</button>
      </div>`;
    const textBlast = q('#textBlastSocial');
    const mediaStep = q('#easyMediaStep');
    if (textBlast?.parentNode) textBlast.parentNode.insertBefore(details,textBlast);
    else if (mediaStep?.parentNode) mediaStep.parentNode.insertBefore(details,mediaStep);
    else composer.insertBefore(details,composer.firstChild);

    q('#comicFormat')?.addEventListener('change',event => { state.format = event.target.value; applyFilter(false); });
    q('#comicScenePicker')?.addEventListener('change',event => { state.selectedId = event.target.value; renderPreview(); });
    q('#comicRandomBtn')?.addEventListener('click',randomScene);
    q('#comicLoadBlastsBtn')?.addEventListener('click',loadBlasts);
    q('#comicBlastPicker')?.addEventListener('change',useSelectedBlast);
    q('#comicMessage')?.addEventListener('input',event => setMessage(event.target.value));
    q('#comicFontDown')?.addEventListener('click',() => adjustFont(-0.004));
    q('#comicFontUp')?.addEventListener('click',() => adjustFont(0.004));
    q('#comicFontRange')?.addEventListener('input',event => { state.fontScale = clamp(Number(event.target.value)/1000,0.02,0.09); applyEditorGeometry(); });
    q('#comicUseBtn')?.addEventListener('click',useComicInCreate);
    const editor = q('#comicBubbleText');
    editor?.addEventListener('input',() => setMessage(editor.textContent || ''));
    editor?.addEventListener('blur',updateFitStatus);
    if (editor) wirePinchZoom(editor);
    q('#comicPreviewImg')?.addEventListener('load',applyEditorGeometry);
    details.addEventListener('toggle',() => { if (details.open) { loadTemplates(); setTimeout(applyEditorGeometry,80); } });
  }

  function applyUploadBox() {
    const box = q('#comicBubbleMap');
    if (!box) return;
    const b = state.uploadBox;
    box.style.left = `${b.x*100}%`;
    box.style.top = `${b.y*100}%`;
    box.style.width = `${b.width*100}%`;
    box.style.height = `${b.height*100}%`;
  }

  function wireBubbleMapper(box, preview) {
    let mode = '';
    let start = null;
    let startBox = null;
    const handle = q('.comic-resize-handle',box);
    const begin = (event,nextMode) => {
      if (!state.uploadFile) return;
      mode = nextMode;
      start = {x:event.clientX,y:event.clientY};
      startBox = {...state.uploadBox};
      event.preventDefault();
      box.setPointerCapture?.(event.pointerId);
    };
    box.addEventListener('pointerdown',event => {
      if (event.target === handle) return;
      begin(event,'move');
    });
    handle?.addEventListener('pointerdown',event => begin(event,'resize'));
    box.addEventListener('pointermove',event => {
      if (!mode || !start || !startBox) return;
      const rect = preview.getBoundingClientRect();
      const dx = (event.clientX-start.x)/Math.max(1,rect.width);
      const dy = (event.clientY-start.y)/Math.max(1,rect.height);
      if (mode === 'move') {
        state.uploadBox.x = clamp(startBox.x+dx,0,1-startBox.width);
        state.uploadBox.y = clamp(startBox.y+dy,0,1-startBox.height);
      } else {
        state.uploadBox.width = clamp(startBox.width+dx,0.12,1-startBox.x);
        state.uploadBox.height = clamp(startBox.height+dy,0.08,1-startBox.y);
      }
      applyUploadBox();
    });
    const end = () => { mode=''; start=null; startBox=null; };
    box.addEventListener('pointerup',end);
    box.addEventListener('pointercancel',end);
  }

  function guessFormat(width,height) {
    const ratio = width/height;
    if (Math.abs(ratio-0.8) < 0.08) return 'feed';
    if (Math.abs(ratio-(9/16)) < 0.07) return 'story';
    return '';
  }

  function handleUploadFile(file) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return toastSafe('Use a JPG, PNG, or WebP image.');
    if (state.uploadUrl) URL.revokeObjectURL(state.uploadUrl);
    state.uploadFile = file;
    state.uploadUrl = URL.createObjectURL(file);
    state.uploadBox = fallbackBubble();
    const preview = q('#comicUploadPreview');
    const img = q('#comicUploadImg');
    if (preview) preview.classList.remove('hidden');
    if (img) {
      img.onload = () => {
        const guessed = guessFormat(img.naturalWidth,img.naturalHeight);
        if (guessed && q('#comicUploadFormat')) q('#comicUploadFormat').value = guessed;
        const note = q('#comicUploadRatioNote');
        if (note) note.textContent = guessed ? `${guessed === 'feed' ? '4:5 Feed' : '9:16 Story'} detected. Drag/resize the gold box so it sits safely inside the speech bubble.` : `Image is ${img.naturalWidth}×${img.naturalHeight}. Choose 4:5 or 9:16, then map the bubble.`;
        applyUploadBox();
      };
      img.src = state.uploadUrl;
    }
    const name = q('#comicUploadName');
    if (name && !name.value.trim()) name.value = file.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ');
  }

  async function uploadBackground() {
    const file = state.uploadFile;
    if (!file) return toastSafe('Choose a comic background image first.');
    const name = String(q('#comicUploadName')?.value || '').trim();
    if (!name) return toastSafe('Give this scene a name.');
    const format = String(q('#comicUploadFormat')?.value || 'feed');
    const pair = String(q('#comicUploadPair')?.value || '').trim() || slug(name.replace(/\b(story|feed|9x16|4x5)\b/gi,''));
    const id = `${slug(name)}-${format}`;
    const button = q('#comicUploadBtn');
    const status = q('#comicUploadStatus');
    if (button) { button.disabled = true; button.textContent = 'Uploading…'; }
    if (status) status.textContent = 'Saving background and speech-bubble map…';
    const b = state.uploadBox;
    try {
      const response = await fetch(`/api/comic-templates/${encodeURIComponent(id)}`,{
        method:'PUT',
        headers:{
          'content-type':file.type,
          'x-template-name':name,
          'x-template-format':format,
          'x-template-pair':pair,
          'x-bubble-x':String(b.x),
          'x-bubble-y':String(b.y),
          'x-bubble-width':String(b.width),
          'x-bubble-height':String(b.height),
        },
        body:file,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not upload background.');
      if (status) status.textContent = '✓ Background saved. It is now available in Comic Blast Studio.';
      toastSafe('Comic background saved.');
      state.uploadFile = null;
      q('#comicUploadFile').value = '';
      q('#comicUploadName').value = '';
      q('#comicUploadPair').value = '';
      q('#comicUploadPreview')?.classList.add('hidden');
      await loadTemplates();
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not upload background.';
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Save Comic Background'; }
    }
  }

  function injectSettingsUi() {
    if (q('#comicBackgroundManager')) return;
    const view = q('#view-settings');
    if (!view) return;
    const card = document.createElement('div');
    card.id = 'comicBackgroundManager';
    card.className = 'card account-card comic-manager';
    card.innerHTML = `
      <div class="account-heading"><div class="install-mark">💥</div><div><strong>Comic Backgrounds</strong><span id="comicLibraryCount">Upload 4:5 and 9:16 scenes here.</span></div></div>
      <div class="comic-grid">
        <div><label class="comic-label" for="comicUploadName">Scene name</label><input id="comicUploadName" class="comic-input" type="text" placeholder="e.g. Neon Nightlife" /></div>
        <div><label class="comic-label" for="comicUploadFormat">Size</label><select id="comicUploadFormat" class="comic-select"><option value="feed">4:5 · Feed · Vertical</option><option value="story">9:16 · Story · Vertical</option></select></div>
      </div>
      <div style="margin-top:9px"><label class="comic-label" for="comicUploadPair">Matching pair name · optional</label><input id="comicUploadPair" class="comic-input" type="text" placeholder="Same name for the 4:5 + 9:16 pair" /></div>
      <div style="margin-top:9px"><label class="comic-label" for="comicUploadFile">Background image</label><input id="comicUploadFile" class="comic-input" type="file" accept="image/png,image/jpeg,image/webp" /></div>
      <div id="comicUploadRatioNote" class="comic-manager-note">After choosing an image, you’ll mark the safe text area inside its speech bubble.</div>
      <div id="comicUploadPreview" class="comic-upload-preview hidden"><img id="comicUploadImg" alt="Comic background upload preview" /><div id="comicBubbleMap" class="comic-bubble-map"><span class="comic-resize-handle" aria-hidden="true"></span></div></div>
      <button id="comicUploadBtn" class="button primary full" type="button" style="margin-top:11px">Save Comic Background</button>
      <div id="comicUploadStatus" class="comic-manager-note">Drag the gold box to position it. Drag the round corner handle to resize it.</div>
      <div id="comicLibraryList" class="comic-library-list"></div>`;
    const logout = q('#logoutBtn',view);
    if (logout) view.insertBefore(card,logout); else view.appendChild(card);
    q('#comicUploadFile')?.addEventListener('change',event => handleUploadFile(event.target.files?.[0]));
    q('#comicUploadBtn')?.addEventListener('click',uploadBackground);
    const box = q('#comicBubbleMap');
    const preview = q('#comicUploadPreview');
    if (box && preview) wireBubbleMapper(box,preview);
  }

  function boot() {
    injectStyles();
    injectCreateUi();
    injectSettingsUi();
    loadTemplates();
    q('.nav-item[data-view="create"]')?.addEventListener('click',() => setTimeout(() => { injectCreateUi(); loadTemplates(); },100));
    q('.nav-item[data-view="settings"]')?.addEventListener('click',() => setTimeout(() => { injectSettingsUi(); loadTemplates(); },100));
    window.addEventListener('resize',applyEditorGeometry);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
