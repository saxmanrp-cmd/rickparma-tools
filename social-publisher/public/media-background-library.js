// Media tab background library: browse, upload, rename, categorize, map speech bubbles, and delete in one place.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  const DEFAULT_CATEGORY = 'Rick Parma Comics';
  const STORAGE_KEY = 'socialPublisherV3';
  const MIGRATION_KEY = 'socialPublisherMediaBackgroundMigrationV1';
  const MAX_WIDTH = 1080;
  const MAX_HEIGHT = 1920;
  const JPEG_QUALITY = 0.86;
  const state = {
    templates: [],
    categories: [DEFAULT_CATEGORY],
    category: DEFAULT_CATEGORY,
    uploadItems: [],
    editId: '',
    mapBox: {x:0.08,y:0.055,width:0.84,height:0.27},
  };
  let rendering = false;

  const esc = (value='') => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = (value='') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function prettyName(fileName='') {
    return String(fileName)
      .replace(/\.[^.]+$/,'')
      .replace(/(?:^|[-_])(9x16|9-16|4x5|4-5|story|feed|vertical)(?=$|[-_])/gi,' ')
      .replace(/[-_]+/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .replace(/\b\w/g,char=>char.toUpperCase()) || 'Background';
  }

  function formatLabel(template) {
    return template?.format === 'story' ? '9:16 Story Vertical' : template?.format === 'feed' ? '4:5 Feed Vertical' : 'Format not assigned';
  }

  function normalizedBubble(template) {
    const b = template?.bubble || {};
    const width = Number(b.width);
    const height = Number(b.height);
    if (width > .08 && height > .06) {
      return {
        x:clamp(Number(b.x)||0,0,1),
        y:clamp(Number(b.y)||0,0,1),
        width:clamp(width,.08,1),
        height:clamp(height,.06,1),
      };
    }
    return {x:0.08,y:0.055,width:0.84,height:0.27};
  }

  function injectStyles() {
    if (q('#mediaBackgroundLibraryStyles')) return;
    const style = document.createElement('style');
    style.id = 'mediaBackgroundLibraryStyles';
    style.textContent = `
      body.recovery-easy #view-media .page-row{margin-bottom:10px}
      body.recovery-easy .bg-media-shell{display:grid;gap:12px;padding-bottom:20px}
      body.recovery-easy .bg-media-toolbar{padding:13px;border-radius:16px;background:#101722;border:1px solid rgba(255,255,255,.08)}
      body.recovery-easy .bg-media-toolbar-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}
      body.recovery-easy .bg-media-label{display:block;font-size:13px;font-weight:850;color:#cfd6e1;margin:0 0 6px}
      body.recovery-easy .bg-media-select,body.recovery-easy .bg-media-input{width:100%;min-height:46px;border-radius:11px;border:1px solid rgba(255,255,255,.13);background:#080e16;color:#fff;padding:0 11px;font-size:15px;box-sizing:border-box}
      body.recovery-easy .bg-media-new-row{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:9px}
      body.recovery-easy .bg-media-new-row.hidden{display:none}
      body.recovery-easy .bg-media-btn{min-height:46px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:#151d29;color:#fff;padding:0 13px;font-size:14px;font-weight:850}
      body.recovery-easy .bg-media-btn.primary{border-color:rgba(145,116,255,.42);background:linear-gradient(135deg,#6a59eb,#9c68ff)}
      body.recovery-easy .bg-media-btn.danger{border-color:rgba(255,91,91,.3);background:#241116;color:#ffc1c1}
      body.recovery-easy .bg-media-upload-label{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:13px;border:1px dashed rgba(145,116,255,.55);background:#121225;color:#d9d0ff;font-size:15px;font-weight:900;cursor:pointer;margin-top:10px}
      body.recovery-easy .bg-media-note{font-size:13px;line-height:1.4;color:#98a5b7;margin-top:8px}
      body.recovery-easy .bg-upload-stage{display:grid;gap:9px;margin-top:10px}
      body.recovery-easy .bg-upload-item{display:grid;grid-template-columns:68px 1fr;gap:10px;align-items:center;padding:9px;border-radius:12px;background:#0a1018;border:1px solid rgba(255,255,255,.07)}
      body.recovery-easy .bg-upload-item img{width:68px;height:82px;object-fit:cover;border-radius:9px;background:#111}
      body.recovery-easy .bg-upload-item input{width:100%;min-height:42px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:#080e16;color:#fff;padding:0 10px;font-size:14px;box-sizing:border-box}
      body.recovery-easy .bg-upload-meta{font-size:12px;color:#8e9aac;margin-top:4px}
      body.recovery-easy .bg-media-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      body.recovery-easy .bg-media-card{position:relative;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#0b1119;overflow:hidden;padding:0;text-align:left;color:#fff}
      body.recovery-easy .bg-media-card img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;background:#111}
      body.recovery-easy .bg-media-card.story img{aspect-ratio:9/16}
      body.recovery-easy .bg-media-card-copy{padding:9px}
      body.recovery-easy .bg-media-card strong{display:block;font-size:14px;line-height:1.25}
      body.recovery-easy .bg-media-card span{display:block;margin-top:3px;font-size:11px;color:#96a2b3}
      body.recovery-easy .bg-media-empty{padding:28px 16px;text-align:center;border-radius:16px;background:#0c121b;border:1px solid rgba(255,255,255,.07);color:#9ca8b9;font-size:15px}
      body.recovery-easy .bg-edit-panel{padding:13px;border-radius:16px;background:#101722;border:1px solid rgba(145,116,255,.25)}
      body.recovery-easy .bg-edit-panel.hidden{display:none}
      body.recovery-easy .bg-edit-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      body.recovery-easy .bg-edit-head strong{font-size:18px}
      body.recovery-easy .bg-map-preview{position:relative;width:min(100%,460px);margin:0 auto 12px;border-radius:12px;overflow:hidden;background:#0a0d12;touch-action:none}
      body.recovery-easy .bg-map-preview img{display:block;width:100%;height:auto}
      body.recovery-easy .bg-map-box{position:absolute;border:2px dashed #ffbd59;background:rgba(255,189,89,.13);border-radius:11px;box-sizing:border-box;touch-action:none}
      body.recovery-easy .bg-map-box::after{content:'TEXT AREA';position:absolute;inset:0;display:grid;place-items:center;color:#fff4d2;font-size:12px;font-weight:900;text-shadow:0 1px 3px #000;pointer-events:none}
      body.recovery-easy .bg-map-handle{position:absolute;width:28px;height:28px;right:-9px;bottom:-9px;border-radius:50%;background:#ffbd59;border:3px solid #101722;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      body.recovery-easy .bg-edit-fields{display:grid;gap:9px}
      body.recovery-easy .bg-edit-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}
      body.recovery-easy .bg-edit-save{grid-column:1/-1}
      body.recovery-easy #comicBackgroundManager{display:none!important}
      body.recovery-easy #comicOptimizerSettingsCard{margin-top:12px}
      @media(min-width:700px){body.recovery-easy .bg-media-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function clearLegacyTestMediaOnce() {
    try {
      if (localStorage.getItem(MIGRATION_KEY)) return;
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object') {
        saved.media = [];
        localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));
      }
      localStorage.setItem(MIGRATION_KEY,'1');
    } catch {}
  }

  function moveOptimizerToSettings() {
    const settings = q('#view-settings');
    const manager = q('#comicBackgroundManager');
    if (!settings || !manager) return false;
    const optimizer = q('.comic-optimize-card',manager);
    if (optimizer && !q('#comicOptimizerSettingsCard')) {
      const card = document.createElement('div');
      card.id = 'comicOptimizerSettingsCard';
      card.className = 'card';
      card.appendChild(optimizer);
      const anchor = q('#logoutBtn',settings) || q('#clearHistoryBtn',settings);
      if (anchor?.parentNode) anchor.parentNode.insertBefore(card,anchor); else settings.appendChild(card);
    }
    manager.style.display = 'none';
    return true;
  }

  function observeSettingsManager() {
    if (moveOptimizerToSettings()) return;
    const settings = q('#view-settings');
    if (!settings) return;
    const observer = new MutationObserver(() => {
      if (moveOptimizerToSettings()) observer.disconnect();
    });
    observer.observe(settings,{childList:true,subtree:true});
  }

  function categoryOptions(selected='') {
    return state.categories.map(category => `<option value="${esc(category)}"${category === selected ? ' selected' : ''}>${esc(category)}</option>`).join('');
  }

  function currentItems() {
    return state.templates.filter(template => String(template.category || DEFAULT_CATEGORY) === state.category);
  }

  function editorTemplate() {
    return state.templates.find(template => template.id === state.editId) || null;
  }

  async function loadTemplates() {
    const response = await fetch('/api/comic-templates',{cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load backgrounds.');
    state.templates = Array.isArray(data.templates) ? data.templates : [];
    state.categories = Array.isArray(data.categories) && data.categories.length ? data.categories : [DEFAULT_CATEGORY];
    if (!state.categories.includes(state.category)) state.category = state.categories[0] || DEFAULT_CATEGORY;
  }

  function renderUploadStage() {
    const host = q('#bgUploadStage');
    const uploadBtn = q('#bgUploadBtn');
    if (!host) return;
    if (!state.uploadItems.length) {
      host.innerHTML = '';
      if (uploadBtn) uploadBtn.classList.add('hidden');
      return;
    }
    host.innerHTML = state.uploadItems.map((item,index) => `
      <div class="bg-upload-item" data-upload-item="${index}">
        <img src="${esc(item.previewUrl)}" alt="Upload preview" />
        <div>
          <label class="bg-media-label">Name</label>
          <input data-upload-name="${index}" value="${esc(item.name)}" maxlength="120" />
          <div class="bg-upload-meta">${esc(item.formatLabel)}</div>
        </div>
      </div>`).join('');
    qa('[data-upload-name]',host).forEach(input => input.addEventListener('input',event => {
      const item = state.uploadItems[Number(event.target.dataset.uploadName)];
      if (item) item.name = event.target.value;
    }));
    if (uploadBtn) uploadBtn.classList.remove('hidden');
  }

  function renderGrid() {
    const host = q('#bgMediaGrid');
    if (!host) return;
    const items = currentItems();
    if (!items.length) {
      host.innerHTML = '<div class="bg-media-empty" style="grid-column:1/-1">No backgrounds in this category yet.</div>';
      return;
    }
    host.innerHTML = items.map(template => `
      <button class="bg-media-card ${template.format === 'story' ? 'story' : ''}" type="button" data-bg-edit="${esc(template.id)}">
        <img src="${esc(template.url)}" alt="${esc(template.name || 'Background')}" />
        <div class="bg-media-card-copy"><strong>${esc(template.name || 'Background')}</strong><span>${esc(formatLabel(template))}</span></div>
      </button>`).join('');
    qa('[data-bg-edit]',host).forEach(button => button.addEventListener('click',() => openEditor(button.dataset.bgEdit)));
  }

  function applyMapGeometry() {
    const box = q('#bgMapBox');
    if (!box) return;
    const b = state.mapBox;
    box.style.left = `${b.x*100}%`;
    box.style.top = `${b.y*100}%`;
    box.style.width = `${b.width*100}%`;
    box.style.height = `${b.height*100}%`;
  }

  function openEditor(id) {
    const template = state.templates.find(item => item.id === id);
    if (!template) return;
    state.editId = id;
    state.mapBox = normalizedBubble(template);
    const panel = q('#bgEditPanel');
    const image = q('#bgEditImage');
    const name = q('#bgEditName');
    const category = q('#bgEditCategory');
    const format = q('#bgEditFormat');
    if (image) image.src = template.url;
    if (name) name.value = template.name || template.id;
    if (category) { category.innerHTML = categoryOptions(template.category || DEFAULT_CATEGORY); category.value = template.category || DEFAULT_CATEGORY; }
    if (format) format.textContent = formatLabel(template);
    panel?.classList.remove('hidden');
    applyMapGeometry();
    requestAnimationFrame(() => panel?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function closeEditor() {
    state.editId = '';
    q('#bgEditPanel')?.classList.add('hidden');
  }

  function wireMapBox() {
    const box = q('#bgMapBox');
    const preview = q('#bgMapPreview');
    if (!box || !preview || box.dataset.wired) return;
    box.dataset.wired = '1';
    let mode = '';
    let startX = 0;
    let startY = 0;
    let start = null;
    const begin = (event,nextMode) => {
      event.preventDefault();
      mode = nextMode;
      startX = event.clientX;
      startY = event.clientY;
      start = {...state.mapBox};
      box.setPointerCapture?.(event.pointerId);
    };
    box.addEventListener('pointerdown',event => begin(event,event.target.classList.contains('bg-map-handle') ? 'resize' : 'move'));
    box.addEventListener('pointermove',event => {
      if (!mode || !start) return;
      event.preventDefault();
      const rect = preview.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
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

  async function saveEditor() {
    const template = editorTemplate();
    if (!template) return;
    const name = String(q('#bgEditName')?.value || '').trim();
    const category = q('#bgEditCategory')?.value || state.category;
    if (!name) return toastSafe('Give this background a name first.');
    const button = q('#bgEditSave');
    const old = button?.textContent || 'Save Changes';
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const response = await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{
        method:'PATCH',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({name,category,pairId:slug(name),bubble:state.mapBox}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save this background.');
      state.category = category;
      await refreshPage(false);
      closeEditor();
      q('#comicReloadBtn')?.click();
      toastSafe('Background saved.');
    } catch (error) {
      toastSafe(error.message || 'Could not save this background.');
    } finally {
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  async function deleteEditor() {
    const template = editorTemplate();
    if (!template) return;
    if (!window.confirm(`Delete “${template.name || 'this background'}”? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{method:'DELETE'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete this background.');
      closeEditor();
      await refreshPage(false);
      q('#comicReloadBtn')?.click();
      toastSafe('Background deleted.');
    } catch (error) {
      toastSafe(error.message || 'Could not delete this background.');
    }
  }

  async function createCategory() {
    const input = q('#bgNewCategoryInput');
    const name = String(input?.value || '').trim();
    if (!name) return toastSafe('Type a category name first.');
    try {
      const response = await fetch('/api/comic-templates/categories',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not create category.');
      state.categories = Array.isArray(data.categories) ? data.categories : [...new Set([...state.categories,name])];
      state.category = name;
      if (input) input.value = '';
      q('#bgNewCategoryRow')?.classList.add('hidden');
      await refreshPage(false);
      toastSafe(`Category “${name}” is ready.`);
    } catch (error) {
      toastSafe(error.message || 'Could not create category.');
    }
  }

  function decodeImage(file) {
    const url = URL.createObjectURL(file);
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve({image,url,width:image.naturalWidth||image.width,height:image.naturalHeight||image.height});
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}.`)); };
      image.src = url;
    });
  }

  function canvasBlob(canvas,quality) {
    return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not optimize this image.')),'image/jpeg',quality));
  }

  async function optimizeImage(file) {
    const decoded = await decodeImage(file);
    try {
      const scale = Math.min(1,MAX_WIDTH/decoded.width,MAX_HEIGHT/decoded.height);
      const width = Math.max(1,Math.round(decoded.width*scale));
      const height = Math.max(1,Math.round(decoded.height*scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d',{alpha:false});
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,width,height);
      ctx.drawImage(decoded.image,0,0,width,height);
      let blob = await canvasBlob(canvas,JPEG_QUALITY);
      if (blob.size > 1400000) blob = await canvasBlob(canvas,.80);
      return {
        file:new File([blob],`${slug(file.name.replace(/\.[^.]+$/,''))}.jpg`,{type:'image/jpeg',lastModified:Date.now()}),
        format:width/height < .68 ? 'story' : 'feed',
      };
    } finally {
      URL.revokeObjectURL(decoded.url);
    }
  }

  async function stageFiles(files) {
    for (const item of state.uploadItems) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    state.uploadItems = [];
    const imageFiles = [...files].filter(file => /^image\//.test(file.type));
    for (const file of imageFiles) {
      const previewUrl = URL.createObjectURL(file);
      let formatLabelText = 'Image';
      try {
        const image = new Image();
        await new Promise((resolve,reject) => { image.onload=resolve; image.onerror=reject; image.src=previewUrl; });
        formatLabelText = (image.naturalWidth/image.naturalHeight) < .68 ? '9:16 Story Vertical' : '4:5 Feed Vertical';
      } catch {}
      state.uploadItems.push({file,name:prettyName(file.name),previewUrl,formatLabel:formatLabelText});
    }
    renderUploadStage();
  }

  async function uploadStaged() {
    if (!state.uploadItems.length) return toastSafe('Choose background images first.');
    const button = q('#bgUploadBtn');
    const status = q('#bgMediaStatus');
    const old = button?.textContent || 'Upload Backgrounds';
    if (button) { button.disabled=true; button.textContent='Uploading…'; }
    try {
      let uploaded = 0;
      for (let index=0; index<state.uploadItems.length; index++) {
        const item = state.uploadItems[index];
        const name = String(item.name || '').trim() || prettyName(item.file.name);
        if (status) status.textContent = `Optimizing and uploading ${index+1} of ${state.uploadItems.length}: ${name}`;
        const optimized = await optimizeImage(item.file);
        const pairId = slug(name);
        const id = `${slug(state.category)}--${pairId}--${optimized.format}--${crypto.randomUUID().slice(0,8)}`;
        const response = await fetch(`/api/comic-templates/${encodeURIComponent(id)}`,{
          method:'PUT',
          headers:{
            'content-type':'image/jpeg',
            'x-template-name':name,
            'x-template-category':state.category,
            'x-template-pair':pairId,
            'x-template-format':optimized.format,
            'x-bubble-x':'0.08','x-bubble-y':'0.055','x-bubble-width':'0.84','x-bubble-height':'0.27',
          },
          body:optimized.file,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Could not upload ${name}.`);
        uploaded++;
      }
      for (const item of state.uploadItems) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      state.uploadItems = [];
      const input = q('#bgPackageInput');
      if (input) input.value = '';
      renderUploadStage();
      await refreshPage(false);
      q('#comicReloadBtn')?.click();
      if (status) status.textContent = `${uploaded} background${uploaded === 1 ? '' : 's'} uploaded to “${state.category}”.`;
      toastSafe('Backgrounds uploaded.');
    } catch (error) {
      if (status) status.textContent = error.message || 'Upload stopped.';
      toastSafe(error.message || 'Could not upload backgrounds.');
    } finally {
      if (button) { button.disabled=false; button.textContent=old; }
    }
  }

  function renderShell() {
    const media = q('#mediaLibrary');
    if (!media) return;
    rendering = true;
    const title = q('#view-media .page-row h2');
    if (title) title.textContent = 'Background Library';
    media.innerHTML = `
      <div class="bg-media-shell">
        <div class="bg-media-toolbar">
          <div class="bg-media-toolbar-row">
            <div><label class="bg-media-label" for="bgCategoryPicker">Category</label><select id="bgCategoryPicker" class="bg-media-select">${categoryOptions(state.category)}</select></div>
            <button id="bgNewCategoryBtn" class="bg-media-btn" type="button">＋ New</button>
          </div>
          <div id="bgNewCategoryRow" class="bg-media-new-row hidden"><input id="bgNewCategoryInput" class="bg-media-input" maxlength="80" placeholder="New category name" /><button id="bgCreateCategoryBtn" class="bg-media-btn" type="button">Create</button></div>
          <label class="bg-media-upload-label" for="bgPackageInput">＋ Add Backgrounds</label>
          <input id="bgPackageInput" type="file" accept="image/*" multiple hidden />
          <div id="bgMediaStatus" class="bg-media-note">New uploads are automatically optimized for social media.</div>
          <div id="bgUploadStage" class="bg-upload-stage"></div>
          <button id="bgUploadBtn" class="bg-media-btn primary hidden" type="button" style="width:100%;margin-top:10px">Upload Backgrounds</button>
        </div>

        <div id="bgEditPanel" class="bg-edit-panel hidden">
          <div class="bg-edit-head"><strong>Edit Background</strong><button id="bgEditClose" class="bg-media-btn" type="button">Done</button></div>
          <div id="bgMapPreview" class="bg-map-preview"><img id="bgEditImage" alt="Background editor" /><div id="bgMapBox" class="bg-map-box"><span class="bg-map-handle"></span></div></div>
          <div class="bg-edit-fields">
            <div><label class="bg-media-label" for="bgEditName">Name</label><input id="bgEditName" class="bg-media-input" maxlength="120" /></div>
            <div><label class="bg-media-label" for="bgEditCategory">Category</label><select id="bgEditCategory" class="bg-media-select"></select></div>
            <div class="bg-media-note"><b id="bgEditFormat"></b> · Drag the gold box to position the speech bubble. Drag the gold dot to resize it.</div>
          </div>
          <div class="bg-edit-actions">
            <button id="bgEditSave" class="bg-media-btn primary bg-edit-save" type="button">Save Name + Bubble</button>
            <button id="bgEditDelete" class="bg-media-btn danger" type="button">Delete</button>
            <button id="bgEditCancel" class="bg-media-btn" type="button">Close</button>
          </div>
        </div>

        <div id="bgMediaGrid" class="bg-media-grid"></div>
      </div>`;

    q('#bgCategoryPicker')?.addEventListener('change',event => { state.category = event.target.value; closeEditor(); renderGrid(); });
    q('#bgNewCategoryBtn')?.addEventListener('click',() => q('#bgNewCategoryRow')?.classList.toggle('hidden'));
    q('#bgCreateCategoryBtn')?.addEventListener('click',createCategory);
    q('#bgPackageInput')?.addEventListener('change',event => stageFiles(event.target.files || []));
    q('#bgUploadBtn')?.addEventListener('click',uploadStaged);
    q('#bgEditSave')?.addEventListener('click',saveEditor);
    q('#bgEditDelete')?.addEventListener('click',deleteEditor);
    q('#bgEditClose')?.addEventListener('click',closeEditor);
    q('#bgEditCancel')?.addEventListener('click',closeEditor);
    wireMapBox();
    renderUploadStage();
    renderGrid();
    rendering = false;
  }

  async function refreshPage(showLoading=true) {
    if (showLoading) {
      const media = q('#mediaLibrary');
      if (media) media.innerHTML = '<div class="bg-media-empty">Loading backgrounds…</div>';
    }
    try {
      await loadTemplates();
      renderShell();
    } catch (error) {
      const media = q('#mediaLibrary');
      if (media) media.innerHTML = `<div class="bg-media-empty">${esc(error.message || 'Could not load backgrounds.')}</div>`;
    }
  }

  function wireMediaNavigation() {
    const nav = q('.nav-item[data-view="media"]');
    nav?.addEventListener('click',() => requestAnimationFrame(() => refreshPage(false)));
    const view = q('#view-media');
    if (view) {
      const observer = new MutationObserver(() => {
        if (rendering || !view.classList.contains('active')) return;
        const shell = q('.bg-media-shell',view);
        if (!shell) requestAnimationFrame(() => refreshPage(false));
      });
      observer.observe(view,{childList:true,subtree:true});
    }
  }

  function boot() {
    injectStyles();
    clearLegacyTestMediaOnce();
    observeSettingsManager();
    wireMediaNavigation();
    if (q('#view-media')?.classList.contains('active')) refreshPage(true);
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Background Media Library';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
