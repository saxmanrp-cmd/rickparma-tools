// Comic Blast Stage 12: true-size bubble rendering + Text Blast captions.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const TOKEN_KEY = 'socialPublisherTextBlastToken';
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  let templates = [];
  let captionBlasts = [];
  let renderBusy = false;

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function saveToken(value) {
    try { value ? localStorage.setItem(TOKEN_KEY,value) : localStorage.removeItem(TOKEN_KEY); } catch {}
  }

  function injectStyles() {
    if (q('#comicWysiwygStyles')) return;
    const style = document.createElement('style');
    style.id = 'comicWysiwygStyles';
    style.textContent = `
      body.recovery-easy #comicBlastStudio #comicBlastConnect,
      body.recovery-easy #comicBlastStudio #comicBlastConnected,
      body.recovery-easy #comicBlastStudio #comicBlastStatus{display:none!important}
      body.recovery-easy .comic-edit-text,
      body.recovery-easy .comic-fullscreen-text{font-family:Arial,sans-serif!important;font-weight:700!important;letter-spacing:0!important;word-spacing:0!important;line-height:1.12!important;text-wrap:wrap!important}
      body.recovery-easy .comic-caption-blast{margin:0 0 12px;padding:12px;border-radius:13px;background:#0a1018;border:1px solid rgba(123,102,255,.22)}
      body.recovery-easy .comic-caption-blast strong{display:block;font-size:15px;color:#f1efff}
      body.recovery-easy .comic-caption-blast p{margin:4px 0 9px;color:#9ca8ba;font-size:13px;line-height:1.4}
      body.recovery-easy .comic-caption-blast .comic-caption-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}
      body.recovery-easy .comic-caption-blast select,
      body.recovery-easy .comic-caption-blast input{width:100%;min-height:46px;border-radius:11px;border:1px solid rgba(255,255,255,.13);background:#080e16;color:#fff;padding:0 10px;font-size:15px;box-sizing:border-box}
      body.recovery-easy .comic-caption-blast button{min-height:46px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:#151d29;color:#fff;padding:0 12px;font-size:14px;font-weight:850}
      body.recovery-easy .comic-caption-status{margin-top:7px;color:#93a0b2;font-size:12px;line-height:1.35}
      body.recovery-easy .comic-fit-button{margin-top:9px;min-height:46px!important;font-size:15px!important}
      body.recovery-easy #comicFullscreenFit{width:100%;margin-top:8px;min-height:44px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:#151d29;color:#fff;font-size:14px;font-weight:900}
      @media(max-width:430px){body.recovery-easy .comic-caption-blast .comic-caption-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function loadTemplates() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (response.ok) templates = Array.isArray(data.templates) ? data.templates : [];
    } catch {}
    return templates;
  }

  function selectedTemplate() {
    const id = q('#comicScenePicker')?.value || '';
    return templates.find(template => template.id === id) || null;
  }

  function normalizedBubble(template) {
    const b = template?.bubble || {};
    if (Number(b.width) > 0.08 && Number(b.height) > 0.06) {
      return {
        x:clamp(Number(b.x)||0,0,1),
        y:clamp(Number(b.y)||0,0,1),
        width:clamp(Number(b.width)||0,.05,1),
        height:clamp(Number(b.height)||0,.05,1),
      };
    }
    return {x:.08,y:.055,width:.84,height:.27};
  }

  function currentScale() {
    return clamp(Number(q('#comicFontRange')?.value || 46)/1000,.02,.09);
  }

  function setScale(scale) {
    const value = Math.round(clamp(scale,.02,.09)*1000);
    const main = q('#comicFontRange');
    const full = q('#comicFullscreenRange');
    if (main) {
      main.value = String(value);
      main.dispatchEvent(new Event('input',{bubbles:true}));
    }
    if (full) full.value = String(value);
    syncTypographySoon();
  }

  function visualText() {
    const full = q('#comicFullscreenEditor');
    if (full && !full.classList.contains('hidden')) return String(q('#comicFullscreenText')?.innerText || '').slice(0,2200);
    return String(q('#comicBubbleText')?.innerText || q('#comicMessage')?.value || '').slice(0,2200);
  }

  function syncBubbleTextFromFullscreen() {
    const fullText = q('#comicFullscreenText');
    const area = q('#comicMessage');
    if (!fullText || !area) return;
    area.value = String(fullText.innerText || '').slice(0,2200);
    area.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function applyExactTypography(editor) {
    if (!editor?.parentElement) return;
    const width = editor.parentElement.clientWidth || 0;
    if (!width) return;
    const fontPx = width * currentScale();
    editor.style.fontFamily = 'Arial, sans-serif';
    editor.style.fontWeight = '700';
    editor.style.fontSize = `${fontPx}px`;
    editor.style.lineHeight = '1.12';
    editor.style.padding = `${Math.max(3,fontPx*.18)}px`;
    editor.style.letterSpacing = '0';
    editor.style.wordSpacing = '0';
  }

  function syncTypography() {
    applyExactTypography(q('#comicBubbleText'));
    applyExactTypography(q('#comicFullscreenText'));
    updateExactFitStatus();
  }

  function syncTypographySoon() {
    requestAnimationFrame(() => requestAnimationFrame(syncTypography));
    setTimeout(syncTypography,60);
  }

  function wrapCanvasText(ctx,text,maxWidth) {
    const lines = [];
    for (const paragraph of String(text || '').split(/\n/)) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      const words = paragraph.trim().split(/\s+/);
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [''];
  }

  function metricsFor(text,width,height,bubble,scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,width);
    canvas.height = Math.max(1,height);
    const ctx = canvas.getContext('2d');
    const fontSize = width * scale;
    const x = bubble.x*width;
    const y = bubble.y*height;
    const w = bubble.width*width;
    const h = bubble.height*height;
    const pad = Math.max(8,fontSize*.18);
    ctx.font = `bold ${fontSize}px Arial`;
    const lines = wrapCanvasText(ctx,text,Math.max(1,w-pad*2));
    const lineHeight = fontSize*1.12;
    const maxLine = Math.max(0,...lines.map(line => ctx.measureText(line).width));
    const fits = maxLine <= w-pad*2+1 && lines.length*lineHeight <= h-pad*2+1;
    return {ctx,fontSize,x,y,w,h,pad,lines,lineHeight,fits};
  }

  async function imageDimensions() {
    const image = q('#comicPreviewImg');
    if (image?.naturalWidth && image?.naturalHeight) return {width:image.naturalWidth,height:image.naturalHeight};
    const template = selectedTemplate();
    if (!template?.url) return null;
    return new Promise(resolve => {
      const probe = new Image();
      probe.onload = () => resolve({width:probe.naturalWidth || probe.width,height:probe.naturalHeight || probe.height});
      probe.onerror = () => resolve(null);
      probe.src = template.url;
    });
  }

  async function updateExactFitStatus() {
    if (!templates.length) await loadTemplates();
    const template = selectedTemplate();
    const dims = await imageDimensions();
    if (!template || !dims) return;
    const text = visualText();
    const m = metricsFor(text,dims.width,dims.height,normalizedBubble(template),currentScale());
    const message = m.fits ? '✓ This is the exact final text size and it fits.' : 'Text is outside the bubble. Tap Fit to Bubble or make it smaller.';
    const main = q('#comicFitStatus');
    const full = q('#comicFullscreenStatus');
    for (const status of [main,full]) {
      if (!status) continue;
      status.className = status.id === 'comicFitStatus' ? `comic-fit ${m.fits ? 'good' : 'warn'}` : `comic-fullscreen-status ${m.fits ? 'good' : 'warn'}`;
      status.textContent = message;
    }
  }

  async function fitToBubble() {
    if (!templates.length) await loadTemplates();
    const template = selectedTemplate();
    const dims = await imageDimensions();
    const text = visualText().trim();
    if (!template || !dims) return toastSafe('Choose a background first.');
    if (!text) return toastSafe('Type your speech bubble text first.');
    const bubble = normalizedBubble(template);
    let low = .02;
    let high = .09;
    let best = .02;
    for (let i=0;i<18;i++) {
      const mid = (low+high)/2;
      if (metricsFor(text,dims.width,dims.height,bubble,mid).fits) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }
    setScale(best*.97);
    toastSafe('Text fitted to the speech bubble.');
  }

  function injectFitButtons() {
    const preview = q('#comicPreview');
    if (preview && !q('#comicFitBtn')) {
      const button = document.createElement('button');
      button.id = 'comicFitBtn';
      button.className = 'button secondary full comic-fit-button';
      button.type = 'button';
      button.textContent = '↔ Fit to Bubble';
      const open = q('#comicFullscreenOpenBtn',preview);
      if (open) open.before(button); else preview.appendChild(button);
      button.addEventListener('click',fitToBubble);
    }
    const controls = q('.comic-fullscreen-controls');
    if (controls && !q('#comicFullscreenFit')) {
      const button = document.createElement('button');
      button.id = 'comicFullscreenFit';
      button.type = 'button';
      button.textContent = '↔ Fit to Bubble';
      const status = q('#comicFullscreenStatus',controls);
      if (status) status.before(button); else controls.prepend(button);
      button.addEventListener('click',fitToBubble);
    }
  }

  function updateStudioCopy() {
    const copy = q('#comicBlastStudio .comic-studio-copy');
    if (copy) copy.textContent = 'Pick a background and type a short line directly into the speech bubble. Your full Text Blast can be loaded into the caption below.';
    const label = q('label[for="comicMessage"]');
    if (label) label.textContent = 'Speech Bubble Text — type what you want';
    const area = q('#comicMessage');
    if (area) area.placeholder = 'Type the short line that appears inside the bubble';
  }

  function injectCaptionBlast() {
    if (q('#comicCaptionBlast')) return;
    const caption = q('#caption');
    if (!caption) return;
    const block = document.createElement('div');
    block.id = 'comicCaptionBlast';
    block.className = 'comic-caption-blast';
    block.innerHTML = `
      <strong>💬 Load a Text Blast into the caption</strong>
      <p>Keep the comic bubble short. Use one of your previous Text Blasts for the full post caption.</p>
      <div id="comicCaptionBlastConnect" class="comic-caption-row">
        <input id="comicCaptionBlastPassword" type="password" autocomplete="current-password" placeholder="Text Blast admin password" />
        <button id="comicCaptionBlastConnectBtn" type="button">Connect</button>
      </div>
      <div id="comicCaptionBlastReady" class="comic-caption-row hidden">
        <select id="comicCaptionBlastPicker"><option value="">Choose a recent Text Blast…</option></select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px"><button id="comicCaptionBlastRefresh" type="button">Refresh</button><button id="comicCaptionBlastDisconnect" type="button">Disconnect</button></div>
      </div>
      <div id="comicCaptionBlastStatus" class="comic-caption-status"></div>`;
    caption.before(block);
    q('#comicCaptionBlastConnectBtn')?.addEventListener('click',async () => {
      const input = q('#comicCaptionBlastPassword');
      const password = String(input?.value || '').trim();
      if (!password) return toastSafe('Enter your Text Blast admin password.');
      saveToken(password);
      if (input) input.value = '';
      await loadCaptionBlasts(true);
    });
    q('#comicCaptionBlastRefresh')?.addEventListener('click',() => loadCaptionBlasts(true));
    q('#comicCaptionBlastDisconnect')?.addEventListener('click',() => {
      saveToken('');
      captionBlasts = [];
      renderCaptionBlastState();
    });
    q('#comicCaptionBlastPicker')?.addEventListener('change',event => {
      const index = Number(event.target.value);
      if (!Number.isFinite(index) || !captionBlasts[index]) return;
      const message = String(captionBlasts[index].message || '').trim();
      const captionArea = q('#caption');
      if (captionArea) {
        captionArea.value = message;
        captionArea.dispatchEvent(new Event('input',{bubbles:true}));
        captionArea.focus({preventScroll:true});
      }
      toastSafe('Text Blast loaded into the caption.');
    });
    renderCaptionBlastState();
  }

  function renderCaptionBlastState() {
    const connected = Boolean(token());
    q('#comicCaptionBlastConnect')?.classList.toggle('hidden',connected);
    q('#comicCaptionBlastReady')?.classList.toggle('hidden',!connected);
    const status = q('#comicCaptionBlastStatus');
    if (status && !connected) status.textContent = 'Connect once, then your recent sent Text Blasts will be available here.';
  }

  function cleanupLegacyBubble() {
    const area = q('#comicMessage');
    if (!area?.value.trim() || !captionBlasts.length) return;
    const current = area.value.trim();
    const isBlast = captionBlasts.some(entry => {
      const raw = String(entry.message || '').trim();
      const friends = raw.replace(/\{\{\s*(first_name|name)\s*\}\}/gi,'friends').trim();
      return current === raw || current === friends;
    });
    if (!isBlast) return;
    area.value = '';
    area.dispatchEvent(new Event('input',{bubbles:true}));
  }

  async function loadCaptionBlasts(showToast=false) {
    renderCaptionBlastState();
    const auth = token();
    const status = q('#comicCaptionBlastStatus');
    const picker = q('#comicCaptionBlastPicker');
    if (!auth) return;
    if (status) status.textContent = 'Loading recent Text Blasts…';
    try {
      const response = await fetch('/api/text-blast/history',{headers:{'x-text-blast-token':auth,accept:'application/json'},cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) saveToken('');
        throw new Error(data.error || 'Could not load Text Blasts.');
      }
      captionBlasts = Array.isArray(data.log) ? data.log.slice(0,30) : [];
      renderCaptionBlastState();
      if (picker) {
        picker.innerHTML = '<option value="">Choose a recent Text Blast…</option>' + captionBlasts.map((entry,index) => {
          const text = String(entry.message || '').replace(/\s+/g,' ').slice(0,72) || 'Media-only blast';
          return `<option value="${index}">${text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</option>`;
        }).join('');
        picker.disabled = !captionBlasts.length;
      }
      cleanupLegacyBubble();
      if (status) status.textContent = captionBlasts.length ? 'Choose a blast to put its full message into the caption.' : 'Connected, but no recent sent blasts were found.';
      if (showToast) toastSafe('Text Blast captions refreshed.');
    } catch (error) {
      renderCaptionBlastState();
      if (status) status.textContent = error.message || 'Could not load Text Blasts.';
    }
  }

  function loadImage(src) {
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load this background.'));
      image.src = src;
    });
  }

  async function makeExactComic(trigger) {
    if (renderBusy) return;
    renderBusy = true;
    if (trigger) trigger.disabled = true;
    const oldText = trigger?.textContent || '';
    if (trigger) trigger.textContent = 'Making exact preview…';
    try {
      syncBubbleTextFromFullscreen();
      if (!templates.length) await loadTemplates();
      const template = selectedTemplate();
      const text = String(q('#comicMessage')?.value || '').trim();
      if (!template) throw new Error('Choose a background first.');
      if (!text) throw new Error('Type something in the speech bubble first.');
      const image = await loadImage(template.url);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const bubble = normalizedBubble(template);
      const m = metricsFor(text,width,height,bubble,currentScale());
      if (!m.fits) throw new Error('The bubble text is too large. Tap Fit to Bubble first.');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image,0,0,width,height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(m.x,m.y,m.w,m.h);
      ctx.clip();
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${m.fontSize}px Arial`;
      let lineY = m.y + m.h/2 - ((m.lines.length-1)*m.lineHeight)/2;
      for (const line of m.lines) {
        ctx.fillText(line,m.x+m.w/2,lineY);
        lineY += m.lineHeight;
      }
      ctx.restore();
      const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not render the graphic.')),'image/jpeg',.95));
      const file = new File([blob],`comic-blast-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
      q('#comicFullscreenDone')?.click();
      if (typeof navigate === 'function') navigate('create');
      if (typeof handleMedia === 'function') await handleMedia(file);
      const format = q('#comicFormatPicker')?.value || 'feed';
      const igType = format === 'story' ? 'story' : 'post';
      q(`input[name="igType"][value="${igType}"]`)?.closest('.segment')?.click();
      toastSafe('Comic graphic is ready — this is the exact text size you edited.');
      q('#dropZone')?.scrollIntoView({behavior:'smooth',block:'center'});
    } catch (error) {
      toastSafe(error.message || 'Could not make the Comic Blast graphic.');
    } finally {
      renderBusy = false;
      if (trigger) {
        trigger.disabled = false;
        trigger.textContent = oldText;
      }
    }
  }

  function interceptLegacyMakeButtons() {
    document.addEventListener('click',event => {
      const button = event.target.closest?.('#comicMakeBtn,#comicFullscreenMake');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      makeExactComic(button);
    },true);
  }

  function wireExactSizing() {
    const resync = () => syncTypographySoon();
    document.addEventListener('input',event => {
      if (['comicMessage','comicBubbleText','comicFullscreenText','comicFontRange','comicFullscreenRange'].includes(event.target?.id)) resync();
    },true);
    document.addEventListener('click',event => {
      if (event.target.closest?.('#comicFontDown,#comicFontUp,#comicFullscreenDown,#comicFullscreenUp,#comicFullscreenOpenBtn,#comicRandomBtn')) setTimeout(resync,30);
    });
    window.addEventListener('resize',resync,{passive:true});
    window.addEventListener('orientationchange',() => setTimeout(resync,120),{passive:true});
    const overlay = q('#comicFullscreenEditor');
    if (overlay) new MutationObserver(resync).observe(overlay,{attributes:true,attributeFilter:['class']});
    const image = q('#comicPreviewImg');
    if (image) image.addEventListener('load',resync);
  }

  function boot() {
    injectStyles();
    updateStudioCopy();
    injectCaptionBlast();
    injectFitButtons();
    interceptLegacyMakeButtons();
    wireExactSizing();
    loadTemplates().then(() => {
      syncTypographySoon();
      if (token()) loadCaptionBlasts(false);
    });
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Exact Comic Editor';
  }

  function waitForStudio() {
    if (q('#comicBlastStudio') && q('#caption') && q('#comicPreview')) return boot();
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (q('#comicBlastStudio') && q('#caption') && q('#comicPreview')) {
        clearInterval(timer);
        boot();
      } else if (tries > 30) {
        clearInterval(timer);
      }
    },120);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',waitForStudio,{once:true});
  else waitForStudio();
})();
