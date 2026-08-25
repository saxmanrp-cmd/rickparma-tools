// Comic Blast enhancement: full-screen visual editor + social-ready image optimization.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  const MAX_WIDTH = 1080;
  const MAX_HEIGHT = 1920;
  const JPEG_QUALITY = 0.86;
  const DEFAULT_CATEGORY = 'Rick Parma Comics';
  let priorBodyOverflow = '';

  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const esc = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const slug = (value='') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function prettyName(fileName='') {
    return fileName.replace(/\.[^.]+$/,'').replace(/(?:^|[-_])(9x16|9-16|4x5|4-5|story|feed|vertical)(?=$|[-_])/gi,' ').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g, char => char.toUpperCase()) || 'Scene';
  }

  function pairName(fileName='') {
    return slug(fileName.replace(/\.[^.]+$/,'').replace(/(?:^|[-_])(9x16|9-16|4x5|4-5|story|feed|vertical)(?=$|[-_])/gi,' ').replace(/[-_]+/g,' ').replace(/\s+/g,' '));
  }

  function inferFormat(width,height,requested='') {
    if (requested === 'story' || requested === 'feed') return requested;
    return width / height < 0.68 ? 'story' : 'feed';
  }

  async function decodeImageSource(source) {
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(source);
        return { source:bitmap, width:bitmap.width, height:bitmap.height, cleanup:() => bitmap.close?.() };
      } catch {}
    }
    const url = URL.createObjectURL(source);
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve({ source:image, width:image.naturalWidth || image.width, height:image.naturalHeight || image.height, cleanup:() => URL.revokeObjectURL(url) });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
      image.src = url;
    });
  }

  function canvasBlob(canvas,quality) {
    return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not optimize this image.')), 'image/jpeg', quality));
  }

  async function optimizeImage(source,name='image',requestedFormat='') {
    const decoded = await decodeImageSource(source);
    try {
      const scale = Math.min(1, MAX_WIDTH / decoded.width, MAX_HEIGHT / decoded.height);
      const width = Math.max(1,Math.round(decoded.width * scale));
      const height = Math.max(1,Math.round(decoded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d',{alpha:false});
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,width,height);
      ctx.drawImage(decoded.source,0,0,width,height);
      let blob = await canvasBlob(canvas,JPEG_QUALITY);
      if (blob.size > 1_400_000) blob = await canvasBlob(canvas,0.80);
      const base = String(name || 'image').replace(/\.[^.]+$/,'') || 'image';
      return {
        file:new File([blob],`${base}.jpg`,{type:'image/jpeg',lastModified:Date.now()}),
        width,
        height,
        format:inferFormat(width,height,requestedFormat),
      };
    } finally {
      decoded.cleanup?.();
    }
  }

  function overrideGlobalImageOptimizer() {
    const oldNormalize = window.normalizeImage;
    if (typeof oldNormalize !== 'function' || oldNormalize.__socialReadyOptimizer) return;
    const optimizedNormalize = async file => {
      try {
        if (!file?.type?.startsWith('image/')) return file;
        return (await optimizeImage(file,file.name)).file;
      } catch {
        return oldNormalize(file);
      }
    };
    optimizedNormalize.__socialReadyOptimizer = true;
    window.normalizeImage = optimizedNormalize;
  }

  function injectStyles() {
    if (q('#comicBlastEnhancerStyles')) return;
    const style = document.createElement('style');
    style.id = 'comicBlastEnhancerStyles';
    style.textContent = `
      body.recovery-easy .comic-fullscreen-open{margin-top:10px;min-height:48px!important;font-size:16px!important}
      body.recovery-easy .comic-fullscreen-editor{position:fixed;inset:0;z-index:10000;background:#05070b;display:flex;flex-direction:column;color:#fff;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
      body.recovery-easy .comic-fullscreen-editor.hidden{display:none}
      body.recovery-easy .comic-fullscreen-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);background:#090d13}
      body.recovery-easy .comic-fullscreen-head strong{font-size:18px}
      body.recovery-easy .comic-fullscreen-head button{min-height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#151c27;color:#fff;padding:0 14px;font-size:15px;font-weight:850}
      body.recovery-easy .comic-fullscreen-body{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:10px;overflow:hidden}
      body.recovery-easy .comic-fullscreen-frame{position:relative;overflow:hidden;background:#111;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.42);max-width:100%;max-height:100%}
      body.recovery-easy .comic-fullscreen-frame img{display:block;width:100%;height:100%;object-fit:fill}
      body.recovery-easy .comic-fullscreen-text{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;color:#111;font-weight:850;line-height:1.12;white-space:pre-wrap;overflow:hidden;outline:none;padding:4px;box-sizing:border-box;touch-action:manipulation;text-wrap:balance}
      body.recovery-easy .comic-fullscreen-controls{padding:10px 12px 12px;border-top:1px solid rgba(255,255,255,.1);background:#090d13}
      body.recovery-easy .comic-fullscreen-font{display:grid;grid-template-columns:48px 1fr 48px;gap:9px;align-items:center}
      body.recovery-easy .comic-fullscreen-font button{height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#151d29;color:#fff;font-size:19px;font-weight:900}
      body.recovery-easy .comic-fullscreen-font input{width:100%}
      body.recovery-easy .comic-fullscreen-status{font-size:13px;line-height:1.35;color:#8f9bad;margin-top:7px;text-align:center}
      body.recovery-easy .comic-fullscreen-status.good{color:#82d99a}.comic-fullscreen-status.warn{color:#ffb36c}
      body.recovery-easy .comic-fullscreen-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px}
      body.recovery-easy .comic-fullscreen-actions button{min-height:48px!important}
      body.recovery-easy .comic-optimize-card{margin-top:12px;padding:12px;border-radius:14px;background:#0b121b;border:1px solid rgba(83,172,255,.2)}
      body.recovery-easy .comic-optimize-card strong{display:block;font-size:15px;color:#e9f3ff}
      body.recovery-easy .comic-optimize-card span{display:block;margin-top:4px;font-size:13px;line-height:1.4;color:#9aa8ba}
      body.recovery-easy .comic-optimize-card .button{margin-top:9px}
      @media(max-width:430px){body.recovery-easy .comic-fullscreen-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function mainEditorGeometry() {
    const editor = q('#comicBubbleText');
    if (!editor) return null;
    return {
      left:editor.style.left || '8%',
      top:editor.style.top || '5.5%',
      width:editor.style.width || '84%',
      height:editor.style.height || '27%',
    };
  }

  function currentFontScale() {
    return clamp(Number(q('#comicFontRange')?.value || 46)/1000,0.02,0.09);
  }

  function setMainFontValue(value) {
    const range = q('#comicFontRange');
    if (!range) return;
    range.value = String(clamp(Math.round(value),20,90));
    range.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function applyFullscreenLayout() {
    const overlay = q('#comicFullscreenEditor');
    const frame = q('#comicFullscreenFrame');
    const image = q('#comicFullscreenImage');
    const text = q('#comicFullscreenText');
    if (!overlay || overlay.classList.contains('hidden') || !frame || !image || !text || !image.naturalWidth) return;
    const body = q('.comic-fullscreen-body',overlay);
    const availableW = Math.max(80,(body?.clientWidth || window.innerWidth)-4);
    const availableH = Math.max(120,(body?.clientHeight || window.innerHeight*0.7)-4);
    const scale = Math.min(availableW/image.naturalWidth,availableH/image.naturalHeight);
    frame.style.width = `${Math.max(1,Math.floor(image.naturalWidth*scale))}px`;
    frame.style.height = `${Math.max(1,Math.floor(image.naturalHeight*scale))}px`;
    const geometry = mainEditorGeometry();
    if (geometry) Object.assign(text.style,geometry);
    text.style.fontSize = `${Math.max(12,frame.clientWidth*currentFontScale())}px`;
    updateFullscreenFit();
  }

  function updateFullscreenFit() {
    const text = q('#comicFullscreenText');
    const status = q('#comicFullscreenStatus');
    if (!text || !status) return;
    const tooBig = text.scrollHeight > text.clientHeight+2 || text.scrollWidth > text.clientWidth+2;
    status.className = `comic-fullscreen-status ${tooBig ? 'warn' : 'good'}`;
    status.textContent = tooBig ? 'Text is outside the bubble. Pinch smaller or tap A−.' : '✓ Text fits inside the speech bubble.';
  }

  function syncFullscreenTextFromMain() {
    const text = q('#comicFullscreenText');
    const source = q('#comicBubbleText');
    if (text) text.textContent = source?.innerText || q('#comicMessage')?.value || '';
  }

  function syncMainTextFromFullscreen() {
    const text = q('#comicFullscreenText');
    const area = q('#comicMessage');
    if (!text || !area) return;
    area.value = text.innerText.slice(0,2200);
    area.dispatchEvent(new Event('input',{bubbles:true}));
    updateFullscreenFit();
  }

  function openFullscreenEditor() {
    const source = q('#comicPreviewImg');
    const overlay = q('#comicFullscreenEditor');
    const image = q('#comicFullscreenImage');
    if (!source?.src || !overlay || !image) return toastSafe('Choose a background first.');
    priorBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    syncFullscreenTextFromMain();
    overlay.classList.remove('hidden');
    image.onload = applyFullscreenLayout;
    image.onerror = () => toastSafe('Could not load that background preview.');
    image.src = source.src;
    requestAnimationFrame(applyFullscreenLayout);
  }

  function closeFullscreenEditor() {
    q('#comicFullscreenEditor')?.classList.add('hidden');
    document.body.style.overflow = priorBodyOverflow;
  }

  function wireFullscreenPinch(text) {
    let startDistance = 0;
    let startValue = 46;
    const distance = touches => Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
    text.addEventListener('touchstart',event => {
      if (event.touches.length === 2) {
        startDistance = distance(event.touches);
        startValue = Number(q('#comicFontRange')?.value || 46);
      }
    },{passive:true});
    text.addEventListener('touchmove',event => {
      if (event.touches.length !== 2 || !startDistance) return;
      event.preventDefault();
      setMainFontValue(startValue*(distance(event.touches)/startDistance));
      applyFullscreenLayout();
    },{passive:false});
  }

  function injectFullscreenEditor() {
    if (q('#comicFullscreenEditor')) return;
    const preview = q('#comicPreview');
    if (!preview) return;
    const button = document.createElement('button');
    button.id = 'comicFullscreenOpenBtn';
    button.className = 'button secondary full comic-fullscreen-open';
    button.type = 'button';
    button.textContent = '↗ Open Full-Screen Editor';
    const fontRow = q('.comic-font-row',preview);
    if (fontRow) preview.insertBefore(button,fontRow); else preview.appendChild(button);

    const overlay = document.createElement('div');
    overlay.id = 'comicFullscreenEditor';
    overlay.className = 'comic-fullscreen-editor hidden';
    overlay.innerHTML = `
      <div class="comic-fullscreen-head"><button id="comicFullscreenBack" type="button">‹ Back</button><strong>Comic Text Editor</strong><button id="comicFullscreenDone" type="button">Done</button></div>
      <div class="comic-fullscreen-body"><div id="comicFullscreenFrame" class="comic-fullscreen-frame"><img id="comicFullscreenImage" alt="Full-screen comic preview" /><div id="comicFullscreenText" class="comic-fullscreen-text" contenteditable="true" role="textbox" aria-label="Edit comic speech bubble"></div></div></div>
      <div class="comic-fullscreen-controls">
        <div class="comic-fullscreen-font"><button id="comicFullscreenDown" type="button">A−</button><input id="comicFullscreenRange" type="range" min="20" max="90" value="46" aria-label="Text size" /><button id="comicFullscreenUp" type="button">A+</button></div>
        <div id="comicFullscreenStatus" class="comic-fullscreen-status">Pinch the words or use A− / A+.</div>
        <div class="comic-fullscreen-actions"><button id="comicFullscreenRandom" class="button secondary" type="button">🎲 Different Scene</button><button id="comicFullscreenMake" class="button primary" type="button">Make Comic Post</button></div>
      </div>`;
    document.body.appendChild(overlay);

    button.addEventListener('click',openFullscreenEditor);
    q('#comicFullscreenBack')?.addEventListener('click',closeFullscreenEditor);
    q('#comicFullscreenDone')?.addEventListener('click',closeFullscreenEditor);
    const fullText = q('#comicFullscreenText');
    fullText?.addEventListener('input',syncMainTextFromFullscreen);
    if (fullText) wireFullscreenPinch(fullText);
    q('#comicFullscreenDown')?.addEventListener('click',() => { setMainFontValue(Number(q('#comicFontRange')?.value || 46)-4); syncFullscreenRange(); applyFullscreenLayout(); });
    q('#comicFullscreenUp')?.addEventListener('click',() => { setMainFontValue(Number(q('#comicFontRange')?.value || 46)+4); syncFullscreenRange(); applyFullscreenLayout(); });
    q('#comicFullscreenRange')?.addEventListener('input',event => { setMainFontValue(event.target.value); applyFullscreenLayout(); });
    q('#comicFullscreenRandom')?.addEventListener('click',() => {
      q('#comicRandomBtn')?.click();
      const source = q('#comicPreviewImg');
      const fullImage = q('#comicFullscreenImage');
      if (source?.src && fullImage) { fullImage.onload=applyFullscreenLayout; fullImage.src=source.src; }
      syncFullscreenTextFromMain();
      setTimeout(applyFullscreenLayout,60);
    });
    q('#comicFullscreenMake')?.addEventListener('click',() => { syncMainTextFromFullscreen(); closeFullscreenEditor(); q('#comicMakeBtn')?.click(); });
    window.addEventListener('resize',applyFullscreenLayout,{passive:true});
    window.addEventListener('orientationchange',() => setTimeout(applyFullscreenLayout,120),{passive:true});
    q('#comicFontRange')?.addEventListener('input',() => { syncFullscreenRange(); applyFullscreenLayout(); });
    q('#comicMessage')?.addEventListener('input',() => { if (!overlay.classList.contains('hidden')) syncFullscreenTextFromMain(); });
  }

  function syncFullscreenRange() {
    const main = q('#comicFontRange');
    const full = q('#comicFullscreenRange');
    if (main && full) full.value = main.value;
  }

  async function uploadOptimizedPackage(button) {
    const input = q('#comicPackageInput');
    const files = [...(input?.files || [])].filter(file => /^image\//.test(file.type));
    if (!files.length) return toastSafe('Choose background images first.');
    const category = q('#comicManagerCategory')?.value || DEFAULT_CATEGORY;
    const status = q('#comicPackageStatus');
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Optimizing package…';
    let uploaded = 0;
    try {
      for (let index=0; index<files.length; index++) {
        const original = files[index];
        if (status) status.textContent = `Optimizing ${index+1} of ${files.length}: ${original.name}`;
        const optimized = await optimizeImage(original,original.name);
        const pair = pairName(original.name);
        const id = `${slug(category)}--${pair}--${optimized.format}`;
        const bubble = {x:0.08,y:0.055,width:0.84,height:0.27};
        const response = await fetch(`/api/comic-templates/${encodeURIComponent(id)}`,{
          method:'PUT',
          headers:{
            'content-type':'image/jpeg',
            'x-template-name':prettyName(original.name),
            'x-template-category':category,
            'x-template-pair':pair,
            'x-template-format':optimized.format,
            'x-bubble-x':String(bubble.x),
            'x-bubble-y':String(bubble.y),
            'x-bubble-width':String(bubble.width),
            'x-bubble-height':String(bubble.height),
          },
          body:optimized.file,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Could not upload ${original.name}.`);
        uploaded++;
      }
      if (input) input.value = '';
      button.disabled = true;
      if (status) status.textContent = `${uploaded} optimized JPEG background${uploaded === 1 ? '' : 's'} uploaded to “${category}”. Maximum size is 1080 × 1920.`;
      q('#comicReloadBtn')?.click();
      toastSafe('Optimized background package uploaded.');
    } catch (error) {
      if (status) status.textContent = error.message || 'Package upload stopped.';
      toastSafe(error.message || 'Could not upload the package.');
    } finally {
      button.textContent = oldText;
      if (input?.files?.length) button.disabled = false;
    }
  }

  async function optimizeExistingLibrary(button) {
    const status = q('#comicOptimizeStatus');
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Optimizing library…';
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load the background library.');
      const templates = Array.isArray(data.templates) ? data.templates : [];
      if (!templates.length) {
        if (status) status.textContent = 'There are no saved backgrounds to optimize yet.';
        return;
      }
      let before = 0;
      let after = 0;
      for (let index=0; index<templates.length; index++) {
        const template = templates[index];
        before += Number(template.size || 0);
        if (status) status.textContent = `Optimizing ${index+1} of ${templates.length}: ${template.name || template.id}`;
        const media = await fetch(template.url,{cache:'no-store'});
        if (!media.ok) throw new Error(`Could not read ${template.name || template.id}.`);
        const blob = await media.blob();
        const optimized = await optimizeImage(blob,template.name || template.id,template.format);
        after += optimized.file.size;
        const newBaseId = String(template.id || '').replace(/\.[^.]+$/,'');
        const bubble = template.bubble || {};
        const put = await fetch(`/api/comic-templates/${encodeURIComponent(newBaseId)}`,{
          method:'PUT',
          headers:{
            'content-type':'image/jpeg',
            'x-template-name':template.name || newBaseId,
            'x-template-category':template.category || DEFAULT_CATEGORY,
            'x-template-pair':template.pairId || pairName(template.name || template.id),
            'x-template-format':optimized.format,
            'x-bubble-x':String(Number(bubble.x || 0.08)),
            'x-bubble-y':String(Number(bubble.y || 0.055)),
            'x-bubble-width':String(Number(bubble.width || 0.84)),
            'x-bubble-height':String(Number(bubble.height || 0.27)),
          },
          body:optimized.file,
        });
        const putData = await put.json().catch(() => ({}));
        if (!put.ok) throw new Error(putData.error || `Could not optimize ${template.name || template.id}.`);
        const newId = putData.template?.id || `${newBaseId}.jpg`;
        if (newId !== template.id) {
          await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{method:'DELETE'}).catch(() => null);
        }
      }
      q('#comicReloadBtn')?.click();
      const beforeMb = (before/1024/1024).toFixed(1);
      const afterMb = (after/1024/1024).toFixed(1);
      if (status) status.textContent = `Done. Existing backgrounds are now social-ready JPEGs: ${beforeMb} MB → ${afterMb} MB.`;
      toastSafe('Existing background library optimized.');
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not optimize the library.';
      toastSafe(error.message || 'Could not optimize the library.');
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function injectOptimizerManager() {
    const manager = q('#comicBackgroundManager');
    if (!manager || q('#comicOptimizeExistingBtn')) return;
    const count = q('#comicLibraryCount',manager);
    const box = document.createElement('div');
    box.className = 'comic-optimize-card';
    box.innerHTML = `<strong>Social-ready image optimizer</strong><span>New image uploads are automatically converted to lightweight JPEG and capped at 1080 × 1920. Use this once to convert backgrounds you already uploaded.</span><button id="comicOptimizeExistingBtn" class="button secondary full" type="button">Optimize Existing Backgrounds</button><div id="comicOptimizeStatus" class="comic-manager-note"></div>`;
    if (count) count.after(box); else manager.prepend(box);
    q('#comicOptimizeExistingBtn')?.addEventListener('click',event => optimizeExistingLibrary(event.currentTarget));
    const packageInput = q('#comicPackageInput');
    if (packageInput) packageInput.setAttribute('accept','image/*');
  }

  function interceptPackageUploads() {
    document.addEventListener('click',event => {
      const button = event.target.closest?.('#comicUploadPackageBtn');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      uploadOptimizedPackage(button);
    },true);
  }

  function boot() {
    injectStyles();
    overrideGlobalImageOptimizer();
    injectFullscreenEditor();
    injectOptimizerManager();
    interceptPackageUploads();
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Full-Screen Comic Editor';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
