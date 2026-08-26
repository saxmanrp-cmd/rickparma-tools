// Stable bulk background selection for iPhone/Safari.
// Deliberately avoids MutationObserver loops and full-grid rescans on every tap.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const selected = new Set();
  let selectionMode = false;
  let templates = [];
  let categories = [];
  let lastToolbar = null;
  let lastGrid = null;

  const esc = (value='') => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = (value='') => String(value || '').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const slug = (value='') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function injectStyles() {
    if (q('#bgBulkStableStyles')) return;
    const style = document.createElement('style');
    style.id = 'bgBulkStableStyles';
    style.textContent = `
      body.recovery-easy .bg-bulk-top{display:flex;gap:8px;margin-top:10px}
      body.recovery-easy .bg-bulk-top button{flex:1}
      body.recovery-easy .bg-bulk-bar{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;padding:10px;border-radius:12px;background:#0a1018;border:1px solid rgba(145,116,255,.28)}
      body.recovery-easy .bg-bulk-bar.hidden{display:none!important}
      body.recovery-easy .bg-bulk-count{font-size:13px;font-weight:850;color:#d8d0ff}
      body.recovery-easy .bg-bulk-row{display:grid;grid-template-columns:1fr auto;gap:8px}
      body.recovery-easy .bg-media-shell.bulk-selecting .bg-media-card{outline:2px solid transparent;outline-offset:-2px;-webkit-tap-highlight-color:transparent}
      body.recovery-easy .bg-media-shell.bulk-selecting .bg-media-card::before{content:'○';position:absolute;top:8px;right:8px;z-index:3;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(4,8,14,.86);border:2px solid rgba(255,255,255,.7);color:#fff;font-size:19px;font-weight:900;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none}
      body.recovery-easy .bg-media-shell.bulk-selecting .bg-media-card.bulk-selected{outline-color:#8c6cff}
      body.recovery-easy .bg-media-shell.bulk-selecting .bg-media-card.bulk-selected::before{content:'✓';background:#7b5cff;border-color:#bcaeff}
      body.recovery-easy #bgMediaGrid .bg-media-card{contain:layout paint style}
    `;
    document.head.appendChild(style);
  }

  async function loadData() {
    const response = await fetch('/api/comic-templates',{cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load backgrounds.');
    templates = Array.isArray(data.templates) ? data.templates : [];
    categories = Array.isArray(data.categories) ? data.categories : [];
  }

  function destinationOptions(current='') {
    const destinations = categories.filter(category => normalize(category) !== normalize(current));
    return [
      '<option value="">Choose where to move them…</option>',
      ...destinations.map(category => `<option value="${esc(category)}">${esc(category)}</option>`),
    ].join('');
  }

  function updateCount() {
    const count = q('#bgBulkCount');
    const next = `${selected.size} selected`;
    if (count && count.textContent !== next) count.textContent = next;
    const move = q('#bgBulkMoveBtn');
    if (move) move.disabled = !selected.size;
  }

  function applySelectedStateOnce() {
    const grid = q('#bgMediaGrid');
    if (!grid) return;
    grid.querySelectorAll('.bg-media-card[data-bg-edit]').forEach(card => {
      card.classList.toggle('bulk-selected',selected.has(card.dataset.bgEdit));
    });
    updateCount();
  }

  async function populateDestinationPicker() {
    const picker = q('#bgBulkCategory');
    if (!picker) return;
    picker.disabled = true;
    picker.innerHTML = '<option value="">Loading categories…</option>';
    try {
      await loadData();
      if (!q('#bgBulkCategory')) return;
      const current = q('#bgCategoryPicker')?.value || '';
      picker.innerHTML = destinationOptions(current);
      picker.disabled = categories.filter(category => normalize(category) !== normalize(current)).length === 0;
    } catch (error) {
      if (picker) picker.innerHTML = '<option value="">Could not load categories</option>';
      toastSafe(error.message || 'Could not load categories.');
    }
  }

  function setSelectionMode(on) {
    selectionMode = Boolean(on);
    if (!selectionMode) selected.clear();
    q('.bg-media-shell')?.classList.toggle('bulk-selecting',selectionMode);
    q('#bgBulkBar')?.classList.toggle('hidden',!selectionMode);
    const button = q('#bgBulkSelectBtn');
    if (button) button.textContent = selectionMode ? 'Done Selecting' : 'Select Multiple';
    applySelectedStateOnce();
    if (selectionMode) void populateDestinationPicker();
  }

  async function patchTemplate(template,category) {
    const response = await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name:template.name,
        category,
        pairId:template.pairId || slug(template.name),
        format:template.format,
        bubble:template.bubble,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Could not update ${template.name || template.id}.`);
  }

  async function bulkMoveSelected() {
    if (!selected.size) return;
    const destination = q('#bgBulkCategory')?.value || '';
    if (!destination) {
      const picker = q('#bgBulkCategory');
      picker?.focus();
      try { picker?.showPicker?.(); } catch {}
      return;
    }
    const button = q('#bgBulkMoveBtn');
    const old = button?.textContent || 'Move Selected';
    if (button) { button.disabled = true; button.textContent = 'Moving…'; }
    try {
      await loadData();
      const targets = templates.filter(template => selected.has(template.id));
      const concurrency = 4;
      for (let i=0; i<targets.length; i+=concurrency) {
        await Promise.all(targets.slice(i,i+concurrency).map(template => patchTemplate(template,destination)));
      }
      toastSafe(`${targets.length} background${targets.length === 1 ? '' : 's'} moved to ${destination}.`);
      setSelectionMode(false);
      q('#comicReloadBtn')?.click();
      setTimeout(() => q('.nav-item[data-view="media"]')?.click(),50);
    } catch (error) {
      toastSafe(error.message || 'Could not move the selected backgrounds.');
    } finally {
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  function wireGrid(grid) {
    if (!grid || grid === lastGrid) return;
    lastGrid = grid;
    grid.addEventListener('click',event => {
      if (!selectionMode) return;
      const card = event.target.closest?.('.bg-media-card[data-bg-edit]');
      if (!card || !grid.contains(card)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = card.dataset.bgEdit;
      const active = !selected.has(id);
      if (active) selected.add(id); else selected.delete(id);
      card.classList.toggle('bulk-selected',active);
      updateCount();
    },true);
  }

  function optimizeThumbnails(grid) {
    grid?.querySelectorAll('img').forEach(img => {
      img.loading = 'lazy';
      img.decoding = 'async';
      try { img.fetchPriority = 'low'; } catch {}
    });
  }

  function ensureControls() {
    const toolbar = q('.bg-media-toolbar');
    const grid = q('#bgMediaGrid');
    if (!toolbar || !grid) return;

    optimizeThumbnails(grid);
    wireGrid(grid);

    if (toolbar !== lastToolbar || !q('#bgBulkSelectBtn',toolbar)) {
      lastToolbar = toolbar;
      const top = document.createElement('div');
      top.className = 'bg-bulk-top';
      top.innerHTML = '<button id="bgBulkSelectBtn" class="bg-media-btn" type="button">Select Multiple</button>';
      const uploadLabel = q('.bg-media-upload-label',toolbar);
      if (uploadLabel) uploadLabel.before(top); else toolbar.appendChild(top);

      const bar = document.createElement('div');
      bar.id = 'bgBulkBar';
      bar.className = `bg-bulk-bar${selectionMode ? '' : ' hidden'}`;
      bar.innerHTML = `
        <div id="bgBulkCount" class="bg-bulk-count">${selected.size} selected</div>
        <label class="bg-media-label" for="bgBulkCategory">Move selected to</label>
        <div class="bg-bulk-row">
          <select id="bgBulkCategory" class="bg-media-select"><option value="">Choose where to move them…</option></select>
          <button id="bgBulkMoveBtn" class="bg-media-btn primary" type="button" ${selected.size ? '' : 'disabled'}>Move Selected</button>
        </div>`;
      top.after(bar);

      q('#bgBulkSelectBtn',toolbar)?.addEventListener('click',() => setSelectionMode(!selectionMode));
      q('#bgBulkMoveBtn',toolbar)?.addEventListener('click',bulkMoveSelected);
      q('#bgCategoryPicker',toolbar)?.addEventListener('change',() => {
        if (selectionMode) {
          selected.clear();
          applySelectedStateOnce();
          void populateDestinationPicker();
        }
      });

      q('.bg-media-shell')?.classList.toggle('bulk-selecting',selectionMode);
      if (selectionMode) {
        applySelectedStateOnce();
        void populateDestinationPicker();
      }
    }
  }

  function boot() {
    injectStyles();
    // A low-frequency existence check is intentional: unlike the previous observers,
    // it cannot feed back on its own DOM updates and overwhelm Mobile Safari.
    ensureControls();
    window.addEventListener('focus',ensureControls);
    q('.nav-item[data-view="media"]')?.addEventListener('click',() => {
      setTimeout(ensureControls,150);
      setTimeout(ensureControls,600);
    });
    setInterval(() => {
      if (q('#view-media')?.classList.contains('active')) ensureControls();
    },1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
