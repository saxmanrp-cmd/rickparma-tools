// Media background bulk tools: multi-select category moves + one-time cleanup of recent conversation uploads.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  const DEFAULT_CATEGORY = 'Rick Parma Comics';
  const CONVERSATION_CATEGORY = 'Conversation Scenes';
  const CLEANUP_KEY = 'socialPublisherConversationCleanupV1';
  const selected = new Set();
  let selectionMode = false;
  let templates = [];
  let categories = [];

  const esc = (value='') => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = (value='') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'scene';
  const normalize = (value='') => String(value || '').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[_-]+/g,' ').replace(/\s+/g,' ');

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function injectStyles() {
    if (q('#bgBulkToolsStyles')) return;
    const style = document.createElement('style');
    style.id = 'bgBulkToolsStyles';
    style.textContent = `
      body.recovery-easy .bg-bulk-top{display:flex;gap:8px;margin-top:10px}
      body.recovery-easy .bg-bulk-top button{flex:1}
      body.recovery-easy .bg-bulk-bar{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;padding:10px;border-radius:12px;background:#0a1018;border:1px solid rgba(145,116,255,.28)}
      body.recovery-easy .bg-bulk-bar.hidden{display:none!important}
      body.recovery-easy .bg-bulk-count{font-size:13px;font-weight:850;color:#d8d0ff}
      body.recovery-easy .bg-bulk-row{display:grid;grid-template-columns:1fr auto;gap:8px}
      body.recovery-easy .bg-media-shell.bulk-selecting .bg-media-card{outline:2px solid transparent;outline-offset:-2px}
      body.recovery-easy .bg-media-shell.bulk-selecting .bg-media-card::before{content:'○';position:absolute;top:8px;right:8px;z-index:3;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(4,8,14,.86);border:2px solid rgba(255,255,255,.7);color:#fff;font-size:19px;font-weight:900;box-shadow:0 2px 8px rgba(0,0,0,.4)}
      body.recovery-easy .bg-media-shell.bulk-selecting .bg-media-card.bulk-selected{outline-color:#8c6cff}
      body.recovery-easy .bg-media-shell.bulk-selecting .bg-media-card.bulk-selected::before{content:'✓';background:#7b5cff;border-color:#bcaeff}
    `;
    document.head.appendChild(style);
  }

  async function loadData() {
    const response = await fetch('/api/comic-templates',{cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load backgrounds.');
    templates = Array.isArray(data.templates) ? data.templates : [];
    categories = Array.isArray(data.categories) ? data.categories : [];
    return data;
  }

  async function ensureCategory(name) {
    if (categories.some(category => normalize(category) === normalize(name))) return name;
    const response = await fetch('/api/comic-templates/categories',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Could not create ${name}.`);
    categories = Array.isArray(data.categories) ? data.categories : [...categories,name];
    return name;
  }

  async function patchTemplate(template,{name=template.name,category=template.category,pairId=template.pairId}={}) {
    const response = await fetch(`/api/comic-templates/${encodeURIComponent(template.id)}`,{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        name,
        category,
        pairId:pairId || slug(name),
        format:template.format,
        bubble:template.bubble,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Could not update ${template.name || template.id}.`);
    return data.template;
  }

  function categoryOptions(selectedValue='') {
    return categories.map(category => `<option value="${esc(category)}"${category === selectedValue ? ' selected' : ''}>${esc(category)}</option>`).join('');
  }

  function syncSelectedCards() {
    qa('#bgMediaGrid .bg-media-card').forEach(card => card.classList.toggle('bulk-selected',selected.has(card.dataset.bgEdit)));
    const count = q('#bgBulkCount');
    if (count) count.textContent = `${selected.size} selected`;
    const move = q('#bgBulkMoveBtn');
    if (move) move.disabled = !selected.size;
  }

  function setSelectionMode(on) {
    selectionMode = Boolean(on);
    if (!selectionMode) selected.clear();
    q('.bg-media-shell')?.classList.toggle('bulk-selecting',selectionMode);
    q('#bgBulkBar')?.classList.toggle('hidden',!selectionMode);
    const button = q('#bgBulkSelectBtn');
    if (button) button.textContent = selectionMode ? 'Done Selecting' : 'Select Multiple';
    syncSelectedCards();
  }

  function injectBulkControls() {
    const toolbar = q('.bg-media-toolbar');
    if (!toolbar || q('#bgBulkSelectBtn')) return false;
    const top = document.createElement('div');
    top.className = 'bg-bulk-top';
    top.innerHTML = `<button id="bgBulkSelectBtn" class="bg-media-btn" type="button">Select Multiple</button>`;
    const uploadLabel = q('.bg-media-upload-label',toolbar);
    if (uploadLabel) uploadLabel.before(top); else toolbar.appendChild(top);

    const bar = document.createElement('div');
    bar.id = 'bgBulkBar';
    bar.className = 'bg-bulk-bar hidden';
    bar.innerHTML = `
      <div id="bgBulkCount" class="bg-bulk-count">0 selected</div>
      <div class="bg-bulk-row">
        <select id="bgBulkCategory" class="bg-media-select">${categoryOptions(q('#bgCategoryPicker')?.value || '')}</select>
        <button id="bgBulkMoveBtn" class="bg-media-btn primary" type="button" disabled>Move</button>
      </div>`;
    top.after(bar);

    q('#bgBulkSelectBtn')?.addEventListener('click',() => setSelectionMode(!selectionMode));
    q('#bgBulkMoveBtn')?.addEventListener('click',bulkMoveSelected);
    return true;
  }

  async function bulkMoveSelected() {
    if (!selected.size) return;
    const destination = q('#bgBulkCategory')?.value || '';
    if (!destination) return toastSafe('Choose a destination category.');
    const button = q('#bgBulkMoveBtn');
    const old = button?.textContent || 'Move';
    if (button) { button.disabled = true; button.textContent = 'Moving…'; }
    try {
      await loadData();
      await ensureCategory(destination);
      const targets = templates.filter(template => selected.has(template.id));
      for (const template of targets) await patchTemplate(template,{category:destination});
      toastSafe(`${targets.length} background${targets.length === 1 ? '' : 's'} moved to ${destination}.`);
      setSelectionMode(false);
      q('#comicReloadBtn')?.click();
      q('.nav-item[data-view="media"]')?.click();
    } catch (error) {
      toastSafe(error.message || 'Could not move the selected backgrounds.');
    } finally {
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  function wireGridCapture() {
    const grid = q('#bgMediaGrid');
    if (!grid || grid.dataset.bulkWired) return;
    grid.dataset.bulkWired = '1';
    grid.addEventListener('click',event => {
      if (!selectionMode) return;
      const card = event.target.closest?.('.bg-media-card[data-bg-edit]');
      if (!card) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = card.dataset.bgEdit;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      syncSelectedCards();
    },true);
  }

  function refreshBulkUi() {
    injectBulkControls();
    wireGridCapture();
    if (selectionMode) {
      q('.bg-media-shell')?.classList.add('bulk-selecting');
      const picker = q('#bgBulkCategory');
      if (picker) picker.innerHTML = categoryOptions(picker.value || q('#bgCategoryPicker')?.value || '');
      syncSelectedCards();
    }
  }

  const canonical = [
    'Neon Nightlife','Backstage Pass','Casino Lounge','Retro Action Vibe','Noir Detective',
    'Beach Party Vibes','Sci-Fi City','Comic Newsroom','Grand Stage Entrance','Upscale Lounge',
  ];
  const canonicalRules = [
    {keys:['neon','nightlife'],name:'Neon Nightlife'},
    {keys:['backstage'],name:'Backstage Pass'},
    {keys:['casino'],name:'Casino Lounge'},
    {keys:['retro','action'],name:'Retro Action Vibe'},
    {keys:['noir','detective'],name:'Noir Detective'},
    {keys:['beach','party'],name:'Beach Party Vibes'},
    {keys:['sci fi','scifi','cyberpunk'],name:'Sci-Fi City'},
    {keys:['newsroom','breaking news','rp news'],name:'Comic Newsroom'},
    {keys:['grand stage','stage entrance'],name:'Grand Stage Entrance'},
    {keys:['upscale lounge'],name:'Upscale Lounge'},
  ];

  function canonicalName(template) {
    const current = normalize(template?.name);
    const exact = canonical.find(name => normalize(name) === current);
    if (exact) return exact;
    const haystack = normalize([template?.name,template?.pairId,template?.id].filter(Boolean).join(' '));
    for (const rule of canonicalRules) if (rule.keys.some(key => haystack.includes(key))) return rule.name;
    return '';
  }

  function isComicsCategory(value='') {
    const n = normalize(value);
    return n === normalize(DEFAULT_CATEGORY) || n === 'comics';
  }

  function groupRecentConversationBatch(items) {
    const dated = items.filter(item => item.uploadedAt && Number.isFinite(Date.parse(item.uploadedAt)));
    if (!dated.length) return [];
    const latest = Math.max(...dated.map(item => Date.parse(item.uploadedAt)));
    const windowStart = latest - (4 * 60 * 60 * 1000);
    const candidates = dated.filter(item => Date.parse(item.uploadedAt) >= windowStart && !canonicalName(item));
    if (candidates.length < 3) return [];
    return candidates;
  }

  async function cleanupCurrentComics() {
    try {
      if (localStorage.getItem(CLEANUP_KEY)) return;
      await loadData();
      const comics = templates.filter(template => isComicsCategory(template.category));
      if (!comics.length) { localStorage.setItem(CLEANUP_KEY,'1'); return; }

      const recent = groupRecentConversationBatch(comics);
      const moved = new Set();
      if (recent.length) {
        await ensureCategory(CONVERSATION_CATEGORY);
        const groups = new Map();
        for (const item of recent) {
          const key = normalize(item.pairId || item.name || item.id) || item.id;
          if (!groups.has(key)) groups.set(key,[]);
          groups.get(key).push(item);
        }
        const orderedGroups = [...groups.values()].sort((a,b) => Date.parse(a[0]?.uploadedAt || 0) - Date.parse(b[0]?.uploadedAt || 0));
        for (let index=0; index<orderedGroups.length; index++) {
          const name = `Conversation Scene ${String(index+1).padStart(2,'0')}`;
          for (const item of orderedGroups[index]) {
            await patchTemplate(item,{name,category:CONVERSATION_CATEGORY,pairId:slug(name)});
            moved.add(item.id);
          }
        }
      }

      const remaining = comics.filter(item => !moved.has(item.id));
      const changes = new Map();
      for (const item of remaining) {
        const name = canonicalName(item);
        if (name) changes.set(item.id,name);
      }

      const unresolved = remaining.filter(item => !changes.has(item.id));
      const story = unresolved.filter(item => item.format === 'story');
      const feed = unresolved.filter(item => item.format === 'feed');
      const assignTen = list => {
        if (list.length !== 10) return;
        list.slice().sort((a,b) => normalize(a.name).localeCompare(normalize(b.name))).forEach((item,index) => changes.set(item.id,canonical[index]));
      };
      assignTen(story);
      assignTen(feed);
      if (unresolved.length === 10 && !story.length && !feed.length) assignTen(unresolved);

      let generic = 1;
      for (const item of remaining) {
        if (!changes.has(item.id)) changes.set(item.id,`Rick Parma Comic ${String(generic++).padStart(2,'0')}`);
      }

      for (const item of remaining) {
        const name = changes.get(item.id);
        if (!name) continue;
        if (normalize(item.name) === normalize(name) && normalize(item.category) === normalize(DEFAULT_CATEGORY)) continue;
        await patchTemplate(item,{name,category:DEFAULT_CATEGORY,pairId:slug(name)});
      }

      localStorage.setItem(CLEANUP_KEY,'1');
      q('#comicReloadBtn')?.click();
      if (q('#view-media')?.classList.contains('active')) setTimeout(() => q('.nav-item[data-view="media"]')?.click(),120);
      if (recent.length) toastSafe(`Moved ${recent.length} recent conversation backgrounds into “${CONVERSATION_CATEGORY}” and cleaned up the Comics names.`);
      else toastSafe('Cleaned up the Comics background names.');
    } catch (error) {
      console.warn('Conversation/background cleanup skipped:',error);
    }
  }

  function observeMedia() {
    const view = q('#view-media');
    if (!view) return;
    const observer = new MutationObserver(() => requestAnimationFrame(refreshBulkUi));
    observer.observe(view,{childList:true,subtree:true});
    refreshBulkUi();
  }

  function boot() {
    injectStyles();
    observeMedia();
    setTimeout(cleanupCurrentComics,900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
