// Comic Blast Studio: category-based template library, Text Blast editor, and package uploads.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const TOKEN_KEY = 'socialPublisherTextBlastToken';
  const DEFAULT_CATEGORY = 'Rick Parma Comics';
  const state = {
    templates: [],
    categories: [DEFAULT_CATEGORY],
    filtered: [],
    category: DEFAULT_CATEGORY,
    managerCategory: DEFAULT_CATEGORY,
    selectedId: '',
    format: 'feed',
    text: '',
    fontScale: 0.046,
    blasts: [],
    uploadFiles: [],
    mapId: '',
    mapBox: { x:0.08, y:0.055, width:0.84, height:0.27 },
  };

  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const esc = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = (value='') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }
  function saveToken(value) {
    try { value ? localStorage.setItem(TOKEN_KEY,value) : localStorage.removeItem(TOKEN_KEY); } catch {}
  }
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
      body.recovery-easy .comic-select,body.recovery-easy .comic-textarea,body.recovery-easy .comic-input{width:100%;border:1px solid rgba(255,255,255,.13);background:#0a1018;color:#fff;border-radius:13px;font-size:16px;box-sizing:border-box}
      body.recovery-easy .comic-select,body.recovery-easy .comic-input{min-height:50px;padding:0 12px}
      body.recovery-easy .comic-textarea{min-height:104px;padding:12px;line-height:1.4;resize:vertical}
      body.recovery-easy .comic-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}
      body.recovery-easy .comic-actions .button{min-height:50px!important;font-size:16px!important}
      body.recovery-easy .comic-preview-wrap{margin-top:12px;padding:10px;border-radius:16px;background:#070b11;border:1px solid rgba(255,255,255,.08)}
      body.recovery-easy .comic-preview{position:relative;width:min(100%,440px);margin:0 auto;border-radius:12px;overflow:hidden;background:#131923;box-shadow:0 10px 30px rgba(0,0,0,.24)}
      body.recovery-easy .comic-preview img{display:block;width:100%;height:auto}
      body.recovery-easy .comic-edit-text{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;color:#111;font-weight:850;line-height:1.12;white-space:pre-wrap;overflow:hidden;outline:none;padding:4px;box-sizing:border-box;touch-action:manipulation;text-wrap:balance;text-shadow:none}
      body.recovery-easy .comic-edit-text:empty::before{content:'Tap here and type';color:#777}
      body.recovery-easy .comic-font-row{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-top:10px}
      body.recovery-easy .comic-font-row button{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:#111824;color:#fff;font-size:20px;font-weight:900}
      body.recovery-easy .comic-font-row input{width:100%}
      body.recovery-easy .comic-fit{font-size:13px;line-height:1.35;margin-top:8px;color:#9aa7b9}
      body.recovery-easy .comic-fit.good{color:#81d59b}.comic-fit.warn{color:#ffb36c}
      body.recovery-easy .comic-empty{padding:18px 12px;text-align:center;color:#9ca7b7;font-size:15px;line-height:1.45}
      body.recovery-easy .comic-connect{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}
      body.recovery-easy .comic-status{font-size:13px;color:#98a5b7;line-height:1.4;margin-top:7px}
      body.recovery-easy .comic-manager{margin-top:14px}
      body.recovery-easy .comic-manager-head strong{display:block;font-size:19px;color:#fff}
      body.recovery-easy .comic-manager-head span{display:block;font-size:14px;color:#aeb8c7;line-height:1.4;margin-top:4px}
      body.recovery-easy .comic-manager-section{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
      body.recovery-easy .comic-package-label{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:14px;border:1px dashed rgba(255,189,89,.55);background:#17120c;color:#ffd488;font-size:16px;font-weight:900;cursor:pointer;padding:0 12px;text-align:center}
      body.recovery-easy .comic-upload-preview{position:relative;width:min(100%,400px);margin:12px auto 0;border-radius:14px;overflow:hidden;background:#0b1017;touch-action:none}
      body.recovery-easy .comic-upload-preview img{display:block;width:100%;height:auto}
      body.recovery-easy .comic-bubble-map{position:absolute;border:2px dashed #ffbd59;background:rgba(255,189,89,.14);border-radius:12px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#fff6dd;font-weight:900;font-size:13px;text-shadow:0 1px 3px #000;touch-action:none}
      body.recovery-easy .comic-bubble-map::after{content:'TEXT AREA'}
      body.recovery-easy .comic-resize-handle{position:absolute;width:28px;height:28px;right:-8px;bottom:-8px;border-radius:50%;background:#ffbd59;border:3px solid #0b1017;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      body.recovery-easy .comic-manager-note{font-size:13px;line-height:1.4;color:#9aa6b7;margin-top:9px}
      body.recovery-easy .comic-library-list{display:grid;gap:8px;margin-top:12px;max-height:380px;overflow:auto}
      body.recovery-easy .comic-library-item{display:grid;grid-template-columns:48px 1fr auto;align-items:center;gap:10px;padding:8px;border-radius:12px;background:#0b1119;border:1px solid rgba(255,255,255,.07)}
      body.recovery-easy .comic-library-item img{width:48px;height:58px;object-fit:cover;border-radius:8px;background:#111}
      body.recovery-easy .comic-library-item strong{display:block;font-size:14px;color:#eef2f8}.comic-library-item span{display:block;font-size:12px;color:#95a1b2;margin-top:2px}
      body.recovery-easy .comic-mini-btn{min-height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#151d29;color:#fff;padding:0 10px;font-size:13px;font-weight:850}
      body.recovery-easy .comic-map-editor.hidden{display:none}
      @media(max-width:430px){body.recovery-easy .comic-grid,body.recovery-easy .comic-actions,body.recovery-easy .comic-connect{grid-template-columns:1fr}}
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
    return state.templates.find(template => template.id === state.selectedId) || state.filtered[0] || null;
  }

  function categoriesHtml(selected) {
    return state.categories.map(category => `<option value="${esc(category)}"${category === selected ? ' selected' : ''}>${esc(category)}</option>`).join('');
  }

  function renderCategoryPickers() {
    const create = q('#comicCategoryPicker');
    const manager = q('#comicManagerCategory');
    if (create) create.innerHTML = categoriesHtml(state.category);
    if (manager) manager.innerHTML = categoriesHtml(state.managerCategory);
  }

  function applyFilter(keepSelection=true) {
    state.filtered = state.templates.filter(template =>
      (template.category || DEFAULT_CATEGORY) === state.category &&
      (template.format === state.format || template.format === 'unknown')
    );
    if (!keepSelection || !state.filtered.some(template => template.id === state.selectedId)) state.selectedId = state.filtered[0]?.id || '';
    renderTemplatePicker();
    renderPreview();
  }

  function renderTemplatePicker() {
    const select = q('#comicScenePicker');
    if (!select) return;
    if (!state.filtered.length) {
      select.innerHTML = '<option value="">No backgrounds in this category</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = state.filtered.map(template => `<option value="${esc(template.id)}">${esc(template.name || template.id)}</option>`).join('');
    if (state.filtered.some(template => template.id === state.selectedId)) select.value = state.selectedId;
  }

  function renderLibraryList() {
    const list = q('#comicLibraryList');
    if (!list) return;
    const templates = state.templates.filter(template => (template.category || DEFAULT_CATEGORY) === state.managerCategory);
    if (!templates.length) {
      list.innerHTML = '<div class="comic-manager-note">This category is empty. Upload a package below.</div>';
      return;
    }
    list.innerHTML = templates.map(template => `
      <div class="comic-library-item">
        <img src="${esc(template.url)}" alt="" />
        <div><strong>${esc(template.name || template.id)}</strong><span>${template.format === 'story' ? '9:16 Story Vertical' : template.format === 'feed' ? '4:5 Feed Vertical' : 'Format not assigned'}</span></div>
        <button class="comic-mini-btn" type="button" data-map-template="${esc(template.id)}">Map Bubble</button>
      </div>`).join('');
    list.querySelectorAll('[data-map-template]').forEach(button => button.addEventListener('click', () => openMapEditor(button.dataset.mapTemplate)));
  }

  async function loadTemplates() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load backgrounds.');
      state.templates = Array.isArray(data.templates) ? data.templates : [];
      state.categories = Array.isArray(data.categories) && data.categories.length ? data.categories : [DEFAULT_CATEGORY];
      if (!state.categories.includes(state.category)) state.category = state.categories[0];
      if (!state.categories.includes(state.managerCategory)) state.managerCategory = state.categories[0];
      renderCategoryPickers();
      applyFilter(true);
      renderLibraryList();
      const count = q('#comicLibraryCount');
      if (count) count.textContent = `${state.templates.length} background${state.templates.length === 1 ? '' : 's'} saved in ${state.categories.length} categor${state.categories.length === 1 ? 'y' : 'ies'}`;
    } catch (error) {
      const empty = q('#comicEmptyState');
      if (empty) empty.textContent = error.message || 'Could not load backgrounds.';
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
      empty.textContent = 'No backgrounds match this category and format yet.';
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
    fit.textContent = tooBig ? 'Text is too large for this bubble — pinch smaller or tap A−.' : '✓ Text fits inside the mapped bubble area.';
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
      state.fontScale = clamp(startScale * (distance(event.touches) / startDistance),0.02,0.09);
      applyEditorGeometry();
    }, {passive:false});
  }

  function renderBlastUi() {
    const connected = Boolean(token());
    q('#comicBlastConnect')?.classList.toggle('hidden', connected);
    q('#comicBlastConnected')?.classList.toggle('hidden', !connected);
    if (!connected) {
      const status = q('#comicBlastStatus');
      if (status) status.textContent = 'Connect your Text Blast account here once, then choose any recent message.';
    }
  }

  async function connectTextBlast() {
    const input = q('#comicBlastPassword');
    const password = String(input?.value || '').trim();
    if (!password) return toastSafe('Enter your Text Blast admin password.');
    saveToken(password);
    if (input) input.value = '';
    renderBlastUi();
    await loadBlasts(true);
  }

  function disconnectTextBlast() {
    saveToken('');
    state.blasts = [];
    renderBlastUi();
    const picker = q('#comicBlastPicker');
    if (picker) picker.innerHTML = '';
  }

  async function loadBlasts(showToast=false) {
    const auth = token();
    const select = q('#comicBlastPicker');
    const status = q('#comicBlastStatus');
    if (!auth) { renderBlastUi(); return; }
    if (status) status.textContent = 'Loading recent Text Blasts…';
    try {
      const response = await fetch('/api/text-blast/history',{headers:{'x-text-blast-token':auth,accept:'application/json'},cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) saveToken('');
        throw new Error(data.error || 'Could not load Text Blasts.');
      }
      state.blasts = Array.isArray(data.log) ? data.log.slice(0,30) : [];
      renderBlastUi();
      if (!select) return;
      if (!state.blasts.length) {
        select.innerHTML = '<option>No recent Text Blasts</option>';
        select.disabled = true;
        if (status) status.textContent = 'Connected, but no recent sent blasts were found.';
        return;
      }
      select.disabled = false;
      select.innerHTML = state.blasts.map((entry,index) => {
        const text = String(entry.message || '').replace(/\s+/g,' ').slice(0,64) || 'Media-only blast';
        return `<option value="${index}">${esc(text)}</option>`;
      }).join('');
      if (status) status.textContent = 'Choose a Text Blast, then edit any words before creating the graphic.';
      useSelectedBlast();
      if (showToast) toastSafe('Text Blast connected.');
    } catch (error) {
      renderBlastUi();
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
    if (!state.filtered.length) return toastSafe('There are no backgrounds in this category and format yet.');
    const candidates = state.filtered.length > 1 ? state.filtered.filter(template => template.id !== state.selectedId) : state.filtered;
    const template = candidates[Math.floor(Math.random()*candidates.length)];
    state.selectedId = template.id;
    const select = q('#comicScenePicker');
    if (select) select.value = template.id;
    renderPreview();
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

  async function makeComicPost() {
    const template = selectedTemplate();
    if (!template) return toastSafe('Choose a background first.');
    if (!state.text.trim()) return toastSafe('Choose a Text Blast or type a message first.');
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
      const b = normalizedBubble(template);
      const x = b.x*canvas.width, y = b.y*canvas.height, w = b.width*canvas.width, h = b.height*canvas.height;
      const fontSize = Math.max(18,canvas.width*state.fontScale);
      const pad = Math.max(8,fontSize*.18);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x,y,w,h);
      ctx.clip();
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `850 ${fontSize}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
      const lines = wrapCanvasText(ctx,state.text,w-pad*2);
      const lineHeight = fontSize*1.12;
      let lineY = y + h/2 - ((lines.length-1)*lineHeight)/2;
      for (const line of lines) {
        ctx.fillText(line,x+w/2,lineY,w-pad*2);
        lineY += lineHeight;
      }
      ctx.restore();
      const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not render the graphic.')),'image/jpeg',.95));
      const file = new File([blob],`comic-blast-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
      if (typeof navigate === 'function') navigate('create');
      if (typeof handleMedia === 'function') await handleMedia(file);
      const caption = q('#caption');
      if (caption && !caption.value.trim()) {
        caption.value = state.text.trim();
        caption.dispatchEvent(new Event('input',{bubbles:true}));
      }
      const igType = state.format === 'story' ? 'story' : 'post';
      q(`input[name="igType"][value="${igType}"]`)?.closest('.segment')?.click();
      toastSafe('Comic Blast graphic is ready.');
      q('#dropZone')?.scrollIntoView({behavior:'smooth',block:'center'});
    } catch (error) {
      toastSafe(error.message || 'Could not make the Comic Blast graphic.');
    } finally {
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  function injectStudio() {
    if (q('#comicBlastStudio')) return;
    const composer = q('#view-create .composer');
    if (!composer) return;
    const details = document.createElement('details');
    details.id = 'comicBlastStudio';
    details.className = 'comic-studio';
    details.innerHTML = `
      <summary>💥 Comic Blast Studio</summary>
      <div class="comic-studio-inner">
        <div class="comic-studio-copy">Pick a background package, choose a scene, bring in a Text Blast, then edit and resize the words right inside the speech bubble.</div>
        <div class="comic-grid">
          <div><label class="comic-label" for="comicCategoryPicker">Background category</label><select id="comicCategoryPicker" class="comic-select"></select></div>
          <div><label class="comic-label" for="comicFormatPicker">Format</label><select id="comicFormatPicker" class="comic-select"><option value="feed">4:5 Feed · Vertical</option><option value="story">9:16 Story · Vertical</option></select></div>
        </div>
        <div class="comic-grid" style="margin-top:9px">
          <div><label class="comic-label" for="comicScenePicker">Scene</label><select id="comicScenePicker" class="comic-select"></select></div>
          <div style="align-self:end"><button id="comicRandomBtn" class="button secondary full" type="button">🎲 Random Scene</button></div>
        </div>
        <div id="comicBlastConnect" class="comic-connect hidden">
          <input id="comicBlastPassword" class="comic-input" type="password" autocomplete="current-password" placeholder="Text Blast admin password" />
          <button id="comicBlastConnectBtn" class="button secondary" type="button">Connect Text Blast</button>
        </div>
        <div id="comicBlastConnected" class="comic-grid hidden" style="margin-top:10px">
          <div><label class="comic-label" for="comicBlastPicker">Recent Text Blast</label><select id="comicBlastPicker" class="comic-select"></select></div>
          <div style="align-self:end;display:grid;grid-template-columns:1fr 1fr;gap:7px"><button id="comicBlastRefreshBtn" class="button secondary" type="button">Refresh</button><button id="comicBlastDisconnectBtn" class="button secondary" type="button">Disconnect</button></div>
        </div>
        <div id="comicBlastStatus" class="comic-status"></div>
        <div style="margin-top:10px"><label class="comic-label" for="comicMessage">Message — edit anything you want</label><textarea id="comicMessage" class="comic-textarea" maxlength="2200" placeholder="Your message"></textarea></div>
        <div id="comicEmptyState" class="comic-empty"></div>
        <div id="comicPreview" class="comic-preview-wrap hidden"><div class="comic-preview"><img id="comicPreviewImg" alt="Comic background preview" /><div id="comicBubbleText" class="comic-edit-text" contenteditable="true" role="textbox" aria-label="Edit speech bubble text"></div></div>
          <div class="comic-font-row"><button id="comicFontDown" type="button" aria-label="Smaller text">A−</button><input id="comicFontRange" type="range" min="20" max="90" value="46" aria-label="Text size" /><button id="comicFontUp" type="button" aria-label="Larger text">A+</button></div>
          <div id="comicFitStatus" class="comic-fit">Pinch the text or use A− / A+ until it fits.</div>
        </div>
        <div class="comic-actions"><button id="comicMakeBtn" class="button primary" type="button">Make Comic Post</button><button id="comicReloadBtn" class="button secondary" type="button">Reload Backgrounds</button></div>
      </div>`;
    const mediaStep = q('#easyMediaStep');
    const hero = q('#easyCreateIntro');
    if (mediaStep?.parentNode) mediaStep.parentNode.insertBefore(details,mediaStep);
    else if (hero) hero.after(details);
    else composer.insertBefore(details,composer.firstChild);

    q('#comicCategoryPicker')?.addEventListener('change', event => { state.category = event.target.value; applyFilter(false); });
    q('#comicFormatPicker')?.addEventListener('change', event => { state.format = event.target.value; applyFilter(false); });
    q('#comicScenePicker')?.addEventListener('change', event => { state.selectedId = event.target.value; renderPreview(); });
    q('#comicRandomBtn')?.addEventListener('click', randomScene);
    q('#comicBlastConnectBtn')?.addEventListener('click', connectTextBlast);
    q('#comicBlastRefreshBtn')?.addEventListener('click', () => loadBlasts(true));
    q('#comicBlastDisconnectBtn')?.addEventListener('click', disconnectTextBlast);
    q('#comicBlastPicker')?.addEventListener('change', useSelectedBlast);
    q('#comicMessage')?.addEventListener('input', event => setMessage(event.target.value));
    const editor = q('#comicBubbleText');
    editor?.addEventListener('input', () => setMessage(editor.innerText));
    if (editor) wirePinchZoom(editor);
    q('#comicFontDown')?.addEventListener('click', () => adjustFont(-.004));
    q('#comicFontUp')?.addEventListener('click', () => adjustFont(.004));
    q('#comicFontRange')?.addEventListener('input', event => { state.fontScale = clamp(Number(event.target.value)/1000,.02,.09); applyEditorGeometry(); });
    q('#comicMakeBtn')?.addEventListener('click', makeComicPost);
    q('#comicReloadBtn')?.addEventListener('click', loadTemplates);
  }

  function prettyName(fileName='') {
    return fileName.replace(/\.[^.]+$/,'').replace(/(?:^|[-_])(9x16|9-16|4x5|4-5|story|feed|vertical)(?=$|[-_])/gi,' ').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g, char => char.toUpperCase()) || 'Comic Scene';
  }

  function pairName(fileName='') {
    return slug(fileName.replace(/\.[^.]+$/,'').replace(/(?:^|[-_])(9x16|9-16|4x5|4-5|story|feed|vertical)(?=$|[-_])/gi,' ').replace(/\s+/g,' '));
  }

  function inspectImage(file) {
    return new Promise((resolve,reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        URL.revokeObjectURL(url);
        resolve({ width, height, format:(width/height) < .68 ? 'story' : 'feed' });
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}.`)); };
      image.src = url;
    });
  }

  async function createCategory() {
    const input = q('#comicNewCategory');
    const name = String(input?.value || '').trim();
    if (!name) return toastSafe('Type a category name first.');
    const button = q('#comicCreateCategoryBtn');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/comic-templates/categories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not create category.');
      state.categories = data.categories || state.categories;
      state.managerCategory = name;
      state.category = name;
      if (input) input.value = '';
      renderCategoryPickers();
      applyFilter(false);
      renderLibraryList();
      toastSafe(`Category “${name}” is ready.`);
    } catch (error) {
      toastSafe(error.message || 'Could not create category.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function choosePackage(event) {
    state.uploadFiles = [...(event.target.files || [])].filter(file => /^image\//.test(file.type));
    const note = q('#comicPackageStatus');
    const button = q('#comicUploadPackageBtn');
    if (note) note.textContent = state.uploadFiles.length ? `${state.uploadFiles.length} image${state.uploadFiles.length === 1 ? '' : 's'} selected. They will all go into “${state.managerCategory}”.` : 'Choose multiple 4:5 and/or 9:16 backgrounds at once.';
    if (button) button.disabled = !state.uploadFiles.length;
  }

  async function uploadPackage() {
    if (!state.uploadFiles.length) return toastSafe('Choose background images first.');
    const category = state.managerCategory;
    const button = q('#comicUploadPackageBtn');
    const status = q('#comicPackageStatus');
    if (button) { button.disabled = true; button.textContent = 'Uploading package…'; }
    let uploaded = 0;
    try {
      for (let index=0; index<state.uploadFiles.length; index++) {
        const file = state.uploadFiles[index];
        if (status) status.textContent = `Uploading ${index+1} of ${state.uploadFiles.length}: ${file.name}`;
        const info = await inspectImage(file);
        const pair = pairName(file.name);
        const id = `${slug(category)}--${pair}--${info.format}`;
        const bubble = fallbackBubble();
        const response = await fetch(`/api/comic-templates/${encodeURIComponent(id)}`,{
          method:'PUT',
          headers:{
            'content-type':file.type || 'image/jpeg',
            'x-template-name':prettyName(file.name),
            'x-template-category':category,
            'x-template-pair':pair,
            'x-template-format':info.format,
            'x-bubble-x':String(bubble.x),
            'x-bubble-y':String(bubble.y),
            'x-bubble-width':String(bubble.width),
            'x-bubble-height':String(bubble.height),
          },
          body:file,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Could not upload ${file.name}.`);
        uploaded++;
      }
      state.uploadFiles = [];
      const input = q('#comicPackageInput');
      if (input) input.value = '';
      if (status) status.textContent = `${uploaded} background${uploaded === 1 ? '' : 's'} uploaded to “${category}”. Use Map Bubble below to fine-tune each speech bubble when you want.`;
      await loadTemplates();
      toastSafe('Background package uploaded.');
    } catch (error) {
      if (status) status.textContent = error.message || 'Package upload stopped.';
      toastSafe(error.message || 'Could not upload the package.');
    } finally {
      if (button) { button.disabled = !state.uploadFiles.length; button.textContent = 'Upload Package'; }
    }
  }

  function applyMapGeometry() {
    const box = q('#comicMapBox');
    if (!box) return;
    const b = state.mapBox;
    box.style.left = `${b.x*100}%`;
    box.style.top = `${b.y*100}%`;
    box.style.width = `${b.width*100}%`;
    box.style.height = `${b.height*100}%`;
  }

  function openMapEditor(id) {
    const template = state.templates.find(item => item.id === id);
    if (!template) return;
    state.mapId = id;
    state.mapBox = normalizedBubble(template);
    const editor = q('#comicMapEditor');
    const image = q('#comicMapImage');
    const title = q('#comicMapTitle');
    if (title) title.textContent = `Map bubble: ${template.name || template.id}`;
    if (image) image.src = template.url;
    editor?.classList.remove('hidden');
    applyMapGeometry();
    editor?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function wireMapBox(box, preview) {
    let mode = '';
    let startX = 0, startY = 0, start = null;
    const begin = (event, nextMode) => {
      event.preventDefault();
      mode = nextMode;
      startX = event.clientX;
      startY = event.clientY;
      start = {...state.mapBox};
      box.setPointerCapture?.(event.pointerId);
    };
    box.addEventListener('pointerdown', event => {
      if (event.target.classList.contains('comic-resize-handle')) return begin(event,'resize');
      begin(event,'move');
    });
    box.addEventListener('pointermove', event => {
      if (!mode || !start) return;
      event.preventDefault();
      const rect = preview.getBoundingClientRect();
      const dx = (event.clientX-startX)/rect.width;
      const dy = (event.clientY-startY)/rect.height;
      if (mode === 'move') {
        state.mapBox.x = clamp(start.x+dx,0,1-start.width);
        state.mapBox.y = clamp(start.y+dy,0,1-start.height);
      } else {
        state.mapBox.width = clamp(start.width+dx,.10,1-start.x);
        state.mapBox.height = clamp(start.height+dy,.08,1-start.y);
      }
      applyMapGeometry();
    });
    const stop = () => { mode=''; start=null; };
    box.addEventListener('pointerup',stop);
    box.addEventListener('pointercancel',stop);
  }

  async function saveMap() {
    if (!state.mapId) return;
    const button = q('#comicSaveMapBtn');
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const response = await fetch(`/api/comic-templates/${encodeURIComponent(state.mapId)}`,{
        method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({bubble:state.mapBox}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the text area.');
      await loadTemplates();
      toastSafe('Speech bubble text area saved.');
    } catch (error) {
      toastSafe(error.message || 'Could not save the text area.');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Save Text Area'; }
    }
  }

  function injectManager() {
    if (q('#comicBackgroundManager')) return;
    const settings = q('#view-settings');
    if (!settings) return;
    const card = document.createElement('div');
    card.id = 'comicBackgroundManager';
    card.className = 'card comic-manager';
    card.innerHTML = `
      <div class="comic-manager-head"><strong>🗂 Background Library</strong><span>This is storage only. Create categories, upload whole image packages, then use those backgrounds anytime in Comic Blast Studio.</span></div>
      <div id="comicLibraryCount" class="comic-manager-note"></div>
      <div class="comic-manager-section">
        <label class="comic-label" for="comicManagerCategory">Category</label>
        <select id="comicManagerCategory" class="comic-select"></select>
        <div class="comic-connect"><input id="comicNewCategory" class="comic-input" maxlength="80" placeholder="New category, e.g. Holidays" /><button id="comicCreateCategoryBtn" class="button secondary" type="button">Create Category</button></div>
      </div>
      <div class="comic-manager-section">
        <div class="comic-label">Upload a background package</div>
        <label class="comic-package-label" for="comicPackageInput">＋ Choose Multiple Backgrounds</label>
        <input id="comicPackageInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden />
        <div id="comicPackageStatus" class="comic-manager-note">Choose multiple 4:5 and/or 9:16 backgrounds at once. Format is detected automatically.</div>
        <button id="comicUploadPackageBtn" class="button primary full" type="button" disabled style="margin-top:10px">Upload Package</button>
      </div>
      <div class="comic-manager-section">
        <div class="comic-label">Saved backgrounds in this category</div>
        <div class="comic-manager-note">Tap Map Bubble only when you need to adjust the safe text area for a scene.</div>
        <div id="comicLibraryList" class="comic-library-list"></div>
      </div>
      <div id="comicMapEditor" class="comic-manager-section comic-map-editor hidden">
        <div id="comicMapTitle" class="comic-label">Map speech bubble</div>
        <div class="comic-manager-note">Drag the gold box into the speech bubble. Drag the gold dot to resize it.</div>
        <div id="comicMapPreview" class="comic-upload-preview"><img id="comicMapImage" alt="Background mapping preview" /><div id="comicMapBox" class="comic-bubble-map"><span class="comic-resize-handle"></span></div></div>
        <button id="comicSaveMapBtn" class="button primary full" type="button" style="margin-top:10px">Save Text Area</button>
      </div>`;
    const anchor = q('#logoutBtn',settings) || q('#clearHistoryBtn',settings);
    if (anchor?.parentNode) anchor.parentNode.insertBefore(card,anchor); else settings.appendChild(card);

    q('#comicManagerCategory')?.addEventListener('change', event => { state.managerCategory = event.target.value; renderLibraryList(); });
    q('#comicCreateCategoryBtn')?.addEventListener('click', createCategory);
    q('#comicPackageInput')?.addEventListener('change', choosePackage);
    q('#comicUploadPackageBtn')?.addEventListener('click', uploadPackage);
    q('#comicSaveMapBtn')?.addEventListener('click', saveMap);
    const mapBox = q('#comicMapBox');
    const mapPreview = q('#comicMapPreview');
    if (mapBox && mapPreview) wireMapBox(mapBox,mapPreview);
  }

  function boot() {
    injectStyles();
    injectStudio();
    injectManager();
    renderBlastUi();
    loadTemplates();
    if (token()) loadBlasts(false);
    window.addEventListener('resize',applyEditorGeometry,{passive:true});
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Comic Library';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
