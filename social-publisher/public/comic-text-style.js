// Comic speech-bubble typography controls.
// Loads before the exact WYSIWYG renderer so font/color choices are used by Fit to Bubble and final export.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const STYLE_KEY = 'socialPublisherComicTextStylesByCategory';
  const FONTS = {
    'comic-bold': {
      label:'Comic Bold',
      css:'"Arial Black", Arial, sans-serif',
      canvas:'"Arial Black", Arial, sans-serif',
      weight:'900',
    },
    'classic-comic': {
      label:'Classic Comic',
      css:'"Trebuchet MS", Arial, sans-serif',
      canvas:'"Trebuchet MS", Arial, sans-serif',
      weight:'700',
    },
    'impact': {
      label:'Impact / Shout',
      css:'Impact, Haettenschweiler, sans-serif',
      canvas:'Impact, Haettenschweiler, sans-serif',
      weight:'700',
    },
    'handwritten': {
      label:'Handwritten',
      css:'"Marker Felt", "Comic Sans MS", cursive',
      canvas:'"Marker Felt", "Comic Sans MS", cursive',
      weight:'700',
    },
  };
  const COLORS = {
    '#111111':'Black',
    '#FFFFFF':'White (black bubbles)',
    '#FFD400':'Yellow',
    '#FF3B30':'Red',
  };

  let fontId = 'comic-bold';
  let color = '#111111';
  let templates = [];
  let renderBusy = false;

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function normalize(value='') {
    return String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
  }

  function categoryName() {
    return String(q('#comicCategoryPicker')?.value || 'default').trim() || 'default';
  }

  function defaultStyle(category=categoryName()) {
    const conversation = normalize(category).includes('conversation');
    return {font:'comic-bold',color:conversation ? '#FFFFFF' : '#111111'};
  }

  function readStyleMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STYLE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  function loadCategoryStyle() {
    const map = readStyleMap();
    const fallback = defaultStyle();
    const saved = map[categoryName()] || {};
    fontId = FONTS[saved.font] ? saved.font : fallback.font;
    color = COLORS[String(saved.color || '').toUpperCase()] ? String(saved.color).toUpperCase() : fallback.color;
    syncControlValues();
    scheduleEditorStyle();
  }

  function saveCategoryStyle() {
    try {
      const map = readStyleMap();
      map[categoryName()] = {font:fontId,color};
      localStorage.setItem(STYLE_KEY,JSON.stringify(map));
    } catch {}
  }

  function fontConfig() {
    return FONTS[fontId] || FONTS['comic-bold'];
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
    scheduleEditorStyle();
  }

  function visualText() {
    const full = q('#comicFullscreenEditor');
    if (full && !full.classList.contains('hidden')) return String(q('#comicFullscreenText')?.innerText || '').slice(0,2200);
    return String(q('#comicBubbleText')?.innerText || q('#comicMessage')?.value || '').slice(0,2200);
  }

  function syncFullscreenToMain() {
    const full = q('#comicFullscreenText');
    const area = q('#comicMessage');
    if (!full || !area) return;
    const text = String(full.innerText || '').slice(0,2200);
    if (text || !area.value) {
      area.value = text;
      area.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }

  function applyEditorStyle() {
    const config = fontConfig();
    for (const editor of [q('#comicBubbleText'),q('#comicFullscreenText')]) {
      if (!editor) continue;
      editor.style.setProperty('font-family',config.css,'important');
      editor.style.setProperty('font-weight',config.weight,'important');
      editor.style.setProperty('color',color,'important');
    }
  }

  function scheduleEditorStyle() {
    applyEditorStyle();
    requestAnimationFrame(applyEditorStyle);
    setTimeout(applyEditorStyle,80);
    setTimeout(applyEditorStyle,180);
  }

  function syncControlValues() {
    for (const id of ['comicTextFont','comicFullscreenTextFont']) {
      const select = q(`#${id}`);
      if (select && select.value !== fontId) select.value = fontId;
    }
    for (const id of ['comicTextColor','comicFullscreenTextColor']) {
      const select = q(`#${id}`);
      if (select && select.value !== color) select.value = color;
    }
  }

  function fontOptions() {
    return Object.entries(FONTS).map(([value,item]) => `<option value="${value}">${item.label}</option>`).join('');
  }

  function colorOptions() {
    return Object.entries(COLORS).map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
  }

  function controlMarkup(prefix='comicText') {
    return `
      <div class="comic-text-style-title">Text Style</div>
      <div class="comic-text-style-grid">
        <label>Font<select id="${prefix}Font">${fontOptions()}</select></label>
        <label>Color<select id="${prefix}Color">${colorOptions()}</select></label>
      </div>`;
  }

  function wireControls(prefix='comicText') {
    q(`#${prefix}Font`)?.addEventListener('change',event => {
      if (!FONTS[event.target.value]) return;
      fontId = event.target.value;
      saveCategoryStyle();
      syncControlValues();
      scheduleEditorStyle();
    });
    q(`#${prefix}Color`)?.addEventListener('change',event => {
      const next = String(event.target.value || '').toUpperCase();
      if (!COLORS[next]) return;
      color = next;
      saveCategoryStyle();
      syncControlValues();
      scheduleEditorStyle();
    });
  }

  function injectStyles() {
    if (q('#comicTextStyleCss')) return;
    const style = document.createElement('style');
    style.id = 'comicTextStyleCss';
    style.textContent = `
      body.recovery-easy .comic-text-style-panel{margin:10px 0;padding:10px;border-radius:12px;background:#0a1018;border:1px solid rgba(123,102,255,.24)}
      body.recovery-easy .comic-text-style-title{font-size:14px;font-weight:900;color:#f3f1ff;margin-bottom:7px}
      body.recovery-easy .comic-text-style-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      body.recovery-easy .comic-text-style-grid label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#aab5c4}
      body.recovery-easy .comic-text-style-grid select{width:100%;min-width:0;min-height:44px;padding:0 9px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#080e16;color:#fff;font-size:14px;font-weight:750}
      @media(max-width:370px){body.recovery-easy .comic-text-style-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectControls() {
    const preview = q('#comicPreview');
    if (preview && !q('#comicTextStyleMain')) {
      const panel = document.createElement('div');
      panel.id = 'comicTextStyleMain';
      panel.className = 'comic-text-style-panel';
      panel.innerHTML = controlMarkup('comicText');
      const fit = q('#comicFitBtn',preview);
      const open = q('#comicFullscreenOpenBtn',preview);
      if (fit) fit.before(panel); else if (open) open.before(panel); else preview.appendChild(panel);
      wireControls('comicText');
    }

    const controls = q('.comic-fullscreen-controls');
    if (controls && !q('#comicTextStyleFullscreen')) {
      const panel = document.createElement('div');
      panel.id = 'comicTextStyleFullscreen';
      panel.className = 'comic-text-style-panel';
      panel.innerHTML = controlMarkup('comicFullscreenText');
      const fit = q('#comicFullscreenFit',controls);
      if (fit) fit.before(panel); else controls.prepend(panel);
      wireControls('comicFullscreenText');
    }
    syncControlValues();
    scheduleEditorStyle();
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
    if (Number(b.width) > .08 && Number(b.height) > .06) {
      return {
        x:clamp(Number(b.x)||0,0,1),
        y:clamp(Number(b.y)||0,0,1),
        width:clamp(Number(b.width)||0,.05,1),
        height:clamp(Number(b.height)||0,.05,1),
      };
    }
    return {x:.08,y:.055,width:.84,height:.27};
  }

  function canvasFont(fontSize) {
    const config = fontConfig();
    return `${config.weight} ${fontSize}px ${config.canvas}`;
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
    ctx.font = canvasFont(fontSize);
    const lines = wrapCanvasText(ctx,text,Math.max(1,w-pad*2));
    const lineHeight = fontSize*1.12;
    const maxLine = Math.max(0,...lines.map(line => ctx.measureText(line).width));
    const fits = maxLine <= w-pad*2+1 && lines.length*lineHeight <= h-pad*2+1;
    return {fontSize,x,y,w,h,pad,lines,lineHeight,fits};
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

  async function fitStyledText() {
    if (!templates.length) await loadTemplates();
    const template = selectedTemplate();
    const dims = await imageDimensions();
    const text = visualText().trim();
    if (!template || !dims) return toastSafe('Choose a background first.');
    if (!text) return toastSafe('Type your speech bubble text first.');
    const bubble = normalizedBubble(template);
    let low=.02, high=.09, best=.02;
    for (let i=0;i<18;i++) {
      const mid = (low+high)/2;
      if (metricsFor(text,dims.width,dims.height,bubble,mid).fits) {
        best=mid; low=mid;
      } else high=mid;
    }
    setScale(best*.97);
    toastSafe('Text fitted to the speech bubble.');
  }

  function loadImage(src) {
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load this background.'));
      image.src = src;
    });
  }

  async function makeStyledComic(trigger) {
    if (renderBusy) return;
    renderBusy = true;
    const oldText = trigger?.textContent || '';
    if (trigger) { trigger.disabled = true; trigger.textContent = 'Making preview…'; }
    try {
      syncFullscreenToMain();
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
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = canvasFont(m.fontSize);
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
      toastSafe('Comic graphic is ready with your selected font and color.');
      q('#dropZone')?.scrollIntoView({behavior:'smooth',block:'center'});
    } catch (error) {
      toastSafe(error.message || 'Could not make the comic graphic.');
    } finally {
      renderBusy = false;
      if (trigger) { trigger.disabled = false; trigger.textContent = oldText; }
    }
  }

  function interceptExactActions() {
    // This script intentionally loads before comic-blast-wysiwyg.js so this capture handler
    // can replace the legacy hard-coded Arial/black Fit and Make handlers.
    document.addEventListener('click',event => {
      const fit = event.target.closest?.('#comicFitBtn,#comicFullscreenFit');
      if (fit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void fitStyledText();
        return;
      }
      const make = event.target.closest?.('#comicMakeBtn,#comicFullscreenMake');
      if (make) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void makeStyledComic(make);
        return;
      }
      if (event.target.closest?.('#comicFullscreenOpenBtn,#comicRandomBtn')) setTimeout(scheduleEditorStyle,100);
    },true);
  }

  function wireStyleSync() {
    document.addEventListener('input',event => {
      if (['comicMessage','comicBubbleText','comicFullscreenText','comicFontRange','comicFullscreenRange'].includes(event.target?.id)) scheduleEditorStyle();
    },true);
    q('#comicCategoryPicker')?.addEventListener('change',() => {
      loadCategoryStyle();
      setTimeout(injectControls,80);
    });
    q('#comicScenePicker')?.addEventListener('change',scheduleEditorStyle);
    window.addEventListener('resize',scheduleEditorStyle,{passive:true});
  }

  function waitForStudio() {
    let tries=0;
    const ready = () => {
      injectControls();
      if (q('#comicBlastStudio') && q('#comicPreview')) {
        loadCategoryStyle();
        wireStyleSync();
        loadTemplates();
        return true;
      }
      return false;
    };
    if (ready()) return;
    const timer = setInterval(() => {
      tries++;
      if (ready() || tries > 40) clearInterval(timer);
    },120);
  }

  injectStyles();
  interceptExactActions();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',waitForStudio,{once:true});
  else waitForStudio();
})();
