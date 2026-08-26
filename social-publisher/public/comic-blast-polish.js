// Small Comic Blast UX polish: start on a populated category and hide UUID-style filenames.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  let templates = [];

  function looksMachineNamed(value='') {
    const compact = String(value).replace(/[^A-Fa-f0-9]/g,'');
    return compact.length >= 20 && /^[A-Fa-f0-9]+$/.test(compact);
  }

  function displayName(template,index=0) {
    const name = String(template?.name || '').trim();
    if (!name || looksMachineNamed(name)) return `Scene ${index+1}`;
    return name;
  }

  function currentList(category,format) {
    return templates.filter(template =>
      String(template.category || 'Rick Parma Comics') === category &&
      (template.format === format || template.format === 'unknown')
    );
  }

  function relabelCreateScenes() {
    const category = q('#comicCategoryPicker')?.value || '';
    const format = q('#comicFormatPicker')?.value || 'feed';
    const select = q('#comicScenePicker');
    if (!select) return;
    const list = currentList(category,format);
    const indexById = new Map(list.map((template,index) => [template.id,{template,index}]));
    for (const option of [...select.options]) {
      const match = indexById.get(option.value);
      if (match) option.textContent = displayName(match.template,match.index);
    }
  }

  function relabelLibrary() {
    const category = q('#comicManagerCategory')?.value || '';
    const list = templates.filter(template => String(template.category || 'Rick Parma Comics') === category);
    const indexById = new Map(list.map((template,index) => [template.id,{template,index}]));
    for (const button of qa('[data-map-template]')) {
      const match = indexById.get(button.dataset.mapTemplate);
      if (!match) continue;
      const item = button.closest('.comic-library-item');
      const strong = q('strong',item);
      if (strong) strong.textContent = displayName(match.template,match.index);
    }
  }

  function chooseInitialPopulatedCategory() {
    const categorySelect = q('#comicCategoryPicker');
    const format = q('#comicFormatPicker')?.value || 'feed';
    if (!categorySelect || !templates.length) return;
    const current = categorySelect.value;
    if (currentList(current,format).length) return;
    const first = templates.find(template => template.format === format || template.format === 'unknown') || templates[0];
    const next = String(first?.category || '');
    if (!next || next === current || ![...categorySelect.options].some(option => option.value === next)) return;
    categorySelect.value = next;
    categorySelect.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function refreshLabelsSoon() {
    requestAnimationFrame(() => {
      relabelCreateScenes();
      relabelLibrary();
    });
  }

  function loadMediaBackgroundLibraryFix() {
    if (document.querySelector('script[data-media-background-library-fix]')) return;
    const fix = document.createElement('script');
    fix.src = '/media-background-library-fix.js';
    fix.dataset.mediaBackgroundLibraryFix = '1';
    document.body.appendChild(fix);
  }

  function loadMediaBackgroundBulkTools() {
    if (document.querySelector('script[data-media-background-bulk-tools]')) return;
    const script = document.createElement('script');
    script.src = '/media-background-bulk-tools.js';
    script.dataset.mediaBackgroundBulkTools = '1';
    document.body.appendChild(script);
  }

  function loadMediaBackgroundLibrary() {
    const existing = document.querySelector('script[data-media-background-library]');
    if (existing) {
      if (document.querySelector('.bg-media-shell')) {
        loadMediaBackgroundLibraryFix();
        loadMediaBackgroundBulkTools();
      } else {
        existing.addEventListener('load',() => {
          loadMediaBackgroundLibraryFix();
          loadMediaBackgroundBulkTools();
        },{once:true});
      }
      return;
    }
    const script = document.createElement('script');
    script.src = '/media-background-library.js';
    script.dataset.mediaBackgroundLibrary = '1';
    script.addEventListener('load',() => {
      loadMediaBackgroundLibraryFix();
      loadMediaBackgroundBulkTools();
    },{once:true});
    document.body.appendChild(script);
  }

  function loadMovieBackgroundAutoNames() {
    if (document.querySelector('script[data-movie-background-auto-names]')) return;
    const script = document.createElement('script');
    script.src = '/movie-background-auto-names.js';
    script.dataset.movieBackgroundAutoNames = '1';
    document.body.appendChild(script);
  }

  function loadRickParmaBackgroundAutoNames() {
    if (document.querySelector('script[data-rick-parma-background-auto-names]')) return;
    const script = document.createElement('script');
    script.src = '/rick-parma-background-auto-names.js';
    script.dataset.rickParmaBackgroundAutoNames = '1';
    document.body.appendChild(script);
  }

  function loadAutoBubbleMap() {
    if (document.querySelector('script[data-auto-bubble-map]')) return;
    const script = document.createElement('script');
    script.src = '/auto-bubble-map.js';
    script.dataset.autoBubbleMap = '1';
    document.body.appendChild(script);
  }

  async function boot() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (response.ok) templates = Array.isArray(data.templates) ? data.templates : [];
    } catch {}

    setTimeout(() => {
      chooseInitialPopulatedCategory();
      refreshLabelsSoon();
    },120);

    q('#comicCategoryPicker')?.addEventListener('change',refreshLabelsSoon);
    q('#comicFormatPicker')?.addEventListener('change',refreshLabelsSoon);
    q('#comicManagerCategory')?.addEventListener('change',refreshLabelsSoon);
    q('#comicBlastStudio')?.addEventListener('toggle',refreshLabelsSoon);
    loadAutoBubbleMap();
    loadMediaBackgroundLibrary();
    loadMovieBackgroundAutoNames();
    loadRickParmaBackgroundAutoNames();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();