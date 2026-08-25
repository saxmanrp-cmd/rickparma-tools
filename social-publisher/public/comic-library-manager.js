// Background Library manager: thumbnail staging, custom names, edit, move, map, and delete.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  const MAX_WIDTH = 1080;
  const MAX_HEIGHT = 1920;
  const JPEG_QUALITY = 0.86;
  const DEFAULT_CATEGORY = 'Rick Parma Comics';
  let uploadItems = [];
  let savedTemplates = [];

  const esc = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = (value='') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';

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
      .replace(/\b\w/g, char => char.toUpperCase()) || 'Background';
  }

  function injectStyles() {
    if (q('#comicLibraryManagerStyles')) return;
    const style = document.createElement('style');
    style.id = 'comicLibraryManagerStyles';
    style.textContent = `
      body.recovery-easy #comicLibraryList{display:none!important}
      body.recovery-easy .comic-upload-queue{display:grid;gap:10px;margin-top:12px}
      body.recovery-easy .comic-upload-card{display:grid;grid-template-columns:78px 1fr;gap:11px;align-items:center;padding:10px;border-radius:14px;background:#0b1119;border:1px solid rgba(255,255,255,.08)}
      body.recovery-easy .comic-upload-card img{width:78px;height:94px;object-fit:cover;border-radius:10px;background:#111}
      body.recovery-easy .comic-upload-card input{width:100%;min-height:46px;border-radius:11px;border:1px solid rgba(255,255,255,.13);background:#080e16;color:#fff;padding:0 11px;font-size:15px;box-sizing:border-box}
      body.recovery-easy .comic-upload-meta{font-size:12px;color:#93a0b2;margin-top:5px}
      body.recovery-easy .comic-upload-remove{margin-top:7px;min-height:36px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:#151d29;color:#fff;padding:0 10px;font-weight:800}
      body.recovery-easy .comic-saved-v2{display:grid;gap:10px;margin-top:12px}
      body.recovery-easy .comic-saved-card{padding:10px;border-radius:14px;background:#0b1119;border:1px solid rgba(255,255,255,.08)}
      body.recovery-easy .comic-saved-top{display:grid;grid-template-columns:76px 1fr;gap:11px;align-items:start}
      body.recovery-easy .comic-saved-top img{width:76px;height:92px;object-fit:cover;border-radius:10px;background:#111}
      body.recovery-easy .comic-saved-card input,body.recovery-easy .comic-saved-card select{width:100%;min-height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.13);background:#080e16;color:#fff;padding:0 10px;font-size:15px;box-sizing:border-box}
      body.recovery-easy .comic-saved-format{font-size:12px;color:#94a1b2;margin:6px 0 8px}
      body.recovery-easy .comic-saved-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:9px}
      body.recovery-easy .comic-saved-actions button{min-height:42px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#151d29;color:#fff;padding:0 9px;font-size:13px;font-weight:850}
      body.recovery-easy .comic-saved-actions .danger{border-color:rgba(255,91,91,.3);color:#ffc1c1;background:#241116}
      body.recovery-easy #comicUploadPackageManagerBtn{margin-top:10px}
      @media(max-width:430px){body.recovery-easy .comic-saved-actions{grid-template-columns:1fr 1fr}body.recovery-easy .comic-upload-card{grid-template-columns:68px 1fr}body.recovery-easy .comic-upload-card img{width:68px;height:84px}}
    `;
    document.head.appendChild(style);
  }

  function currentCategory() {
    return q('#comicManagerCategory')?.value || DEFAULT_CATEGORY;
  }

  function categoryOptions(selected='') {
    const select = q('#comicManagerCategory');
    const values = select ? [...select.options].map(option => option.value) : [DEFAULT_CATEGORY];
    return values.map(value => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('');
  }

  function decodeImage(file) {
    const url = URL.createObjectURL(file);
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve({image,url,width:image.naturalWidth || image.width,height:image.naturalHeight || image.height});
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
      if (blob.size > 1400000) blob = await canvasBlob(canvas,0.80);
      return {
        file:new File([blob],`${slug(file.name.replace(/\.[^.]+$/,''))}.jpg`,{type:'image/jpeg',lastModified:Date.now()}),
        width,
        height,
        format:width/height < .68 ? 'story' : 'feed',
      };
    } finally {
      URL.revokeObjectURL(decoded.url);
    }
  }

  function clearUploadItems() {
    for (const item of uploadItems) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    uploadItems = [];
  }

  async function stageFiles(files) {
    clearUploadItems();
    uploadItems = [...files].filter(file => /^image\//.test(file.type)).map((file,index) => ({
      file,
      name:prettyName(file.name),
      previewUrl:URL.createObjectURL(file),
      format:'Detecting…',
      index,
    }));
    renderUploadQueue();
    await Promise.all(uploadItems.map(async item => {
      try {
        const image = new Image();
        await new Promise((resolve,reject) => { image.onload=resolve; image.onerror=reject; image.src=item.previewUrl; });
        item.format = (image.naturalWidth/image.naturalHeight) < .68 ? '9:16 Story Vertical' : '4:5 Feed Vertical';
      } catch { item.format = 'Image'; }
    }));
    renderUploadQueue();
  }

  function renderUploadQueue() {
    const queue = q('#comicUploadQueue');
    const status = q('#comicPackageStatus');
    const button = q('#comicUploadPackageManagerBtn');
    if (!queue) return;
    if (!uploadItems.length) {
      queue.innerHTML = '';
      if (status) status.textContent = 'Choose one or many backgrounds. You can preview and name each one before uploading.';
      if (button) button.disabled = true;
      return;
    }
    queue.innerHTML = uploadItems.map((item,index) => `
      <div class="comic-upload-card" data-upload-index="${index}">
        <img src="${esc(item.previewUrl)}" alt="Preview ${index+1}" />
        <div>
          <label class="comic-label" for="comicUploadName${index}">Background name</label>
          <input id="comicUploadName${index}" data-upload-name="${index}" value="${esc(item.name)}" maxlength="120" />
          <div class="comic-upload-meta">${esc(item.format)}</div>
          <button class="comic-upload-remove" type="button" data-upload-remove="${index}">Remove</button>
        </div>
      </div>`).join('');
    queue.querySelectorAll('[data-upload-name]').forEach(input => input.addEventListener('input',event => {
      const item = uploadItems[Number(event.target.dataset.uploadName)];
      if (item) item.name = event.target.value;
    }));
    queue.querySelectorAll('[data-upload-remove]').forEach(buttonEl => buttonEl.addEventListener('click',() => {
      const index = Number(buttonEl.dataset.uploadRemove);
      const [removed] = uploadItems.splice(index,1);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      uploadItems.forEach((item,nextIndex) => item.index = nextIndex);
      renderUploadQueue();
    }));
    if (status) status.textContent = `${uploadItems.length} background${uploadItems.length === 1 ? '' : 's'} ready. Rename anything you want before uploading.`;
    if (button) button.disabled = false;
  }

  async function uploadStaged(button) {
    if (!uploadItems.length) return toastSafe('Choose background images first.');
    const status = q('#comicPackageStatus');
    const category = currentCategory();
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Uploading…';
    let uploaded = 0;
    try {
      for (let index=0; index<uploadItems.length; index++) {
        const item = uploadItems[index];
        const name = String(item.name || '').trim() || prettyName(item.file.name);
        if (status) status.textContent = `Optimizing and uploading ${index+1} of ${uploadItems.length}: ${name}`;
        const optimized = await optimizeImage(item.file);
        const pairId = slug(name);
        const id = `${slug(category)}--${pairId}--${optimized.format}--${crypto.randomUUID().slice(0,8)}`;
        const response = await fetch(`/api/comic-templates/${encodeURIComponent(id)}`,{
          method:'PUT',
          headers:{
            'content-type':'image/jpeg',
            'x-template-name':name,
            'x-template-category':category,
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
      clearUploadItems();
      const input = q('#comicPackageInput');
      if (input) input.value = '';
      renderUploadQueue();
      if (status) status.textContent = `${uploaded} background${uploaded === 1 ? '' : 's'} uploaded to “${category}”.`;
      q('#comicReloadBtn')?.click();
      await refreshSaved();
      toastSafe('Background package uploaded.');
    } catch (error) {
      if (status) status.textContent = error.message || 'Upload stopped.';
      toastSafe(error.message || 'Could not upload backgrounds.');
    } finally {
      button.textContent = oldText;
      button.disabled = !uploadItems.length;
    }
  }

  function formatLabel(template) {
    return template.format === 'story' ? '9:16 Story Vertical' : template.format === 'feed' ? '4:5 Feed Vertical' : 'Format not assigned';
  }

  function renderSaved() {
    const host = q('#comicSavedLibraryV2');
    if (!host) return;
    const category = currentCategory();
    const items = savedTemplates.filter(template => (template.category || DEFAULT_CATEGORY) === category);
    if (!items.length) {
      host.innerHTML = '<div class="comic-manager-note">This category is empty.</div>';
      return;
    }
    host.innerHTML = items.map(template => `
      <div class="comic-saved-card" data-saved-template="${esc(template.id)}">
        <div class="comic-saved-top">
          <img src="${esc(template.url)}" alt="${esc(template.name || 'Background')}" />
          <div>
            <label class="comic-label">Name</label>
            <input data-edit-name value="${esc(template.name || template.id)}" maxlength="120" />
            <div class="comic-saved-format">${esc(formatLabel(template))}</div>
            <label class="comic-label">Category</label>
            <select data-edit-category>${categoryOptions(template.category || DEFAULT_CATEGORY)}</select>
          </div>
        </div>
        <div class="comic-saved-actions">
          <button type="button" data-save-template="${esc(template.id)}">Save Changes</button>
          <button type="button" data-map-template-v2="${esc(template.id)}">Map Bubble</button>
          <button type="button" class="danger" data-delete-template="${esc(template.id)}">Delete</button>
        </div>
      </div>`).join('');
  }

  async function refreshSaved() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load saved backgrounds.');
      savedTemplates = Array.isArray(data.templates) ? data.templates : [];
      renderSaved();
    } catch (error) {
      const host = q('#comicSavedLibraryV2');
      if (host) host.innerHTML = `<div class="comic-manager-note">${esc(error.message || 'Could not load saved backgrounds.')}</div>`;
    }
  }

  async function saveTemplate(id) {
    const card = q(`[data-saved-template="${CSS.escape(id)}"]`);
    if (!card) return;
    const name = String(q('[data-edit-name]',card)?.value || '').trim();
    const category = q('[data-edit-category]',card)?.value || currentCategory();
    if (!name) return toastSafe('Give this background a name first.');
    const button = q('[data-save-template]',card);
    if (button) { button.disabled=true; button.textContent='Saving…'; }
    try {
      const response = await fetch(`/api/comic-templates/${encodeURIComponent(id)}`,{
        method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name,category,pairId:slug(name)}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save changes.');
      q('#comicReloadBtn')?.click();
      await refreshSaved();
      toastSafe('Background updated.');
    } catch (error) {
      toastSafe(error.message || 'Could not save changes.');
    } finally {
      if (button) { button.disabled=false; button.textContent='Save Changes'; }
    }
  }

  function mapTemplate(id) {
    const legacy = qa('[data-map-template]').find(button => button.dataset.mapTemplate === id);
    if (legacy) legacy.click();
    else toastSafe('Reload backgrounds, then try Map Bubble again.');
  }

  async function deleteTemplate(id) {
    const template = savedTemplates.find(item => item.id === id);
    const name = template?.name || 'this background';
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/comic-templates/${encodeURIComponent(id)}`,{method:'DELETE'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete this background.');
      q('#comicReloadBtn')?.click();
      await refreshSaved();
      toastSafe('Background deleted.');
    } catch (error) {
      toastSafe(error.message || 'Could not delete this background.');
    }
  }

  function setupManager() {
    const manager = q('#comicBackgroundManager');
    const input = q('#comicPackageInput');
    const oldButton = q('#comicUploadPackageBtn');
    const status = q('#comicPackageStatus');
    if (!manager || !input || !oldButton || q('#comicSavedLibraryV2')) return false;

    injectStyles();

    const queue = document.createElement('div');
    queue.id = 'comicUploadQueue';
    queue.className = 'comic-upload-queue';
    status?.before(queue);

    const newButton = document.createElement('button');
    newButton.id = 'comicUploadPackageManagerBtn';
    newButton.className = oldButton.className;
    newButton.type = 'button';
    newButton.disabled = true;
    newButton.textContent = 'Upload Backgrounds';
    oldButton.replaceWith(newButton);

    const coreList = q('#comicLibraryList');
    const saved = document.createElement('div');
    saved.id = 'comicSavedLibraryV2';
    saved.className = 'comic-saved-v2';
    coreList?.after(saved);

    input.addEventListener('change',event => stageFiles(event.target.files || []));
    newButton.addEventListener('click',() => uploadStaged(newButton));
    q('#comicManagerCategory')?.addEventListener('change',() => { renderSaved(); if (uploadItems.length) renderUploadQueue(); });
    q('#comicReloadBtn')?.addEventListener('click',() => setTimeout(refreshSaved,180));

    saved.addEventListener('click',event => {
      const save = event.target.closest?.('[data-save-template]');
      if (save) return saveTemplate(save.dataset.saveTemplate);
      const map = event.target.closest?.('[data-map-template-v2]');
      if (map) return mapTemplate(map.dataset.mapTemplateV2);
      const del = event.target.closest?.('[data-delete-template]');
      if (del) return deleteTemplate(del.dataset.deleteTemplate);
    });

    renderUploadQueue();
    refreshSaved();
    return true;
  }

  function boot() {
    if (setupManager()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (setupManager() || attempts > 20) clearInterval(timer);
    },150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
