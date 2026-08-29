// Prevent the legacy single-bubble save handler from overwriting multi-text mappings.
(() => {
  if (window.__mediaMultiTextSaveFixInstalled) return;
  window.__mediaMultiTextSaveFixInstalled = true;

  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const slug = (value='') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';
  const toastSafe = message => { if (typeof window.toast === 'function') window.toast(message); };

  function percent(value='0%') {
    const n = Number.parseFloat(String(value));
    return Number.isFinite(n) ? Math.max(0,Math.min(1,n/100)) : 0;
  }

  function number(value,fallback=0) {
    const n=Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function mappedAreas() {
    return qa('#bgMapPreview .bg-multi-map-box').map(box => ({
      x:percent(box.style.left),
      y:percent(box.style.top),
      width:percent(box.style.width),
      height:percent(box.style.height),
      shape:box.dataset.shape === 'circle' ? 'circle' : 'box',
      fillColor:box.dataset.fillColor || '#FFFFFF',
      fillOpacity:number(box.dataset.fillOpacity,0),
      borderColor:box.dataset.borderColor || '#FFFFFF',
      borderOpacity:number(box.dataset.borderOpacity,1),
      borderWidth:number(box.dataset.borderWidth,0),
      cornerRadius:number(box.dataset.cornerRadius,12),
    })).filter(area => area.width > .08 && area.height > .06).slice(0,12);
  }

  async function currentTemplate() {
    const src = q('#bgEditImage')?.getAttribute('src') || '';
    if (!src) return null;
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      const templates = Array.isArray(data.templates) ? data.templates : [];
      const absolute = new URL(src,location.origin).href;
      return templates.find(item => {
        try { return item.url === src || new URL(item.url,location.origin).href === absolute; }
        catch { return item.url === src; }
      }) || null;
    } catch { return null; }
  }

  document.addEventListener('click', async event => {
    const save = event.target.closest?.('#bgEditSave');
    if (!save) return;
    const areas = mappedAreas();
    if (areas.length <= 1) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    save.disabled = true;
    const old = save.textContent;
    save.textContent = 'Saving…';

    try {
      const template = await currentTemplate();
      if (!template) throw new Error('Could not identify this background.');
      const name = String(q('#bgEditName')?.value || '').trim();
      const category = q('#bgEditCategory')?.value || template.category || 'Rick Parma Comics';
      if (!name) throw new Error('Give this background a name first.');

      const response = await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{
        method:'PATCH',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({name,category,pairId:slug(name),textAreas:areas}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save these text mappings.');

      toastSafe(`${areas.length} text mappings saved.`);
      q('#bgEditPanel')?.classList.add('hidden');
      q('#comicReloadBtn')?.click();
      setTimeout(() => location.reload(),180);
    } catch (error) {
      toastSafe(error.message || 'Could not save these text mappings.');
      save.disabled = false;
      save.textContent = old;
    }
  },true);
})();
