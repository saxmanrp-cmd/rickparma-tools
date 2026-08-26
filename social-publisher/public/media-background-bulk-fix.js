// Fix the bulk background mover so destination categories are always loaded and visible.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const normalize = (value='') => String(value || '').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const esc = (value='') => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let categories = [];

  async function loadCategories() {
    const response = await fetch('/api/comic-templates',{cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load categories.');
    categories = Array.isArray(data.categories) ? data.categories : [];
    return categories;
  }

  function destinationOptions(current='',preserve='') {
    const destinations = categories.filter(category => normalize(category) !== normalize(current));
    return [
      '<option value="">Choose where to move them…</option>',
      ...destinations.map(category => `<option value="${esc(category)}"${category === preserve ? ' selected' : ''}>${esc(category)}</option>`),
    ].join('');
  }

  async function populateDestinationPicker() {
    const picker = q('#bgBulkCategory');
    if (!picker) return;
    const currentCategory = q('#bgCategoryPicker')?.value || '';
    const previous = picker.value || '';
    try {
      await loadCategories();
      picker.innerHTML = destinationOptions(currentCategory,previous);
      picker.disabled = categories.filter(category => normalize(category) !== normalize(currentCategory)).length === 0;
      const move = q('#bgBulkMoveBtn');
      if (move) move.textContent = 'Move Selected';
      let label = q('#bgBulkDestinationLabel');
      if (!label) {
        label = document.createElement('label');
        label.id = 'bgBulkDestinationLabel';
        label.className = 'bg-media-label';
        label.htmlFor = 'bgBulkCategory';
        label.textContent = 'Move selected to';
        picker.parentElement?.parentElement?.insertBefore(label,picker.parentElement || picker);
      }
    } catch (error) {
      picker.innerHTML = '<option value="">Could not load categories</option>';
      picker.disabled = true;
    }
  }

  function wireMoveButton() {
    const button = q('#bgBulkMoveBtn');
    const picker = q('#bgBulkCategory');
    if (!button || !picker || button.dataset.destinationFixed) return;
    button.dataset.destinationFixed = '1';
    button.textContent = 'Move Selected';
    button.addEventListener('click',event => {
      if (picker.value) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      picker.focus();
      try { picker.showPicker?.(); } catch {}
    },true);
  }

  function wireSelectButton() {
    const button = q('#bgBulkSelectBtn');
    if (!button || button.dataset.destinationFixed) return;
    button.dataset.destinationFixed = '1';
    button.addEventListener('click',() => setTimeout(() => {
      if (!q('#bgBulkBar')?.classList.contains('hidden')) populateDestinationPicker();
    },0));
  }

  function wireCategoryPicker() {
    const picker = q('#bgCategoryPicker');
    if (!picker || picker.dataset.bulkDestinationFixed) return;
    picker.dataset.bulkDestinationFixed = '1';
    picker.addEventListener('change',() => {
      if (!q('#bgBulkBar')?.classList.contains('hidden')) populateDestinationPicker();
    });
  }

  function refresh() {
    wireSelectButton();
    wireMoveButton();
    wireCategoryPicker();
    if (!q('#bgBulkBar')?.classList.contains('hidden')) populateDestinationPicker();
  }

  function boot() {
    const view = q('#view-media');
    if (!view) return;
    const observer = new MutationObserver(() => requestAnimationFrame(refresh));
    observer.observe(view,{childList:true,subtree:true});
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
