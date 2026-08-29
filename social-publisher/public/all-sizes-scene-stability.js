// Keeps the Create > Comic Blast "All Sizes" scene list authoritative and fresh.
(() => {
  if (window.__allSizesSceneStabilityInstalled) return;
  window.__allSizesSceneStabilityInstalled = true;

  const q = (selector, root=document) => root.querySelector(selector);
  let requestSeq = 0;
  let wired = false;

  function allMode() {
    return q('#comicFormatAllPicker')?.value === 'all';
  }

  async function refreshAllScenes({keepCurrent=true}={}) {
    const scene = q('#comicScenePicker');
    const category = q('#comicCategoryPicker')?.value || '';
    if (!scene || !category || !allMode()) return;

    const seq = ++requestSeq;
    let templates = [];
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      templates = Array.isArray(data.templates) ? data.templates : [];
    } catch {
      return;
    }
    if (seq !== requestSeq || !allMode()) return;

    const items = templates.filter(template =>
      (template.category || 'Rick Parma Comics') === category &&
      ['story','feed','unknown'].includes(template.format || 'unknown')
    );
    const prior = keepCurrent ? scene.value : '';

    scene.replaceChildren();
    if (!items.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No backgrounds in this category';
      scene.appendChild(option);
      scene.disabled = true;
      scene.dispatchEvent(new Event('change',{bubbles:true}));
      return;
    }

    scene.disabled = false;
    for (const template of items) {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name || template.id;
      scene.appendChild(option);
    }
    scene.value = prior && items.some(item => item.id === prior) ? prior : items[0].id;
    scene.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function scheduleRefresh(keepCurrent=true) {
    // The original studio also reacts to category/format changes. Re-apply after
    // those synchronous handlers have finished without observing/rebuilding the DOM continuously.
    for (const delay of [0,60,180]) {
      setTimeout(() => refreshAllScenes({keepCurrent}),delay);
    }
  }

  function install() {
    const format = q('#comicFormatAllPicker');
    const category = q('#comicCategoryPicker');
    const random = q('#comicRandomBtn');
    if (!format || !category || !random) return false;
    if (wired) return true;
    wired = true;

    format.addEventListener('change',() => {
      if (allMode()) scheduleRefresh(true);
    });
    category.addEventListener('change',() => {
      if (allMode()) scheduleRefresh(false);
    });

    // In All Sizes mode randomize from the actual combined list instead of the
    // studio's hidden single-format filter.
    random.addEventListener('click',event => {
      if (!allMode()) return;
      const scene = q('#comicScenePicker');
      if (!scene || scene.disabled || scene.options.length < 1) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const options = [...scene.options].filter(option => option.value);
      if (!options.length) return;
      const current = scene.value;
      const choices = options.length > 1 ? options.filter(option => option.value !== current) : options;
      scene.value = choices[Math.floor(Math.random()*choices.length)].value;
      scene.dispatchEvent(new Event('change',{bubbles:true}));
    },true);

    document.addEventListener('visibilitychange',() => {
      if (!document.hidden && allMode()) scheduleRefresh(true);
    });
    window.addEventListener('focus',() => {
      if (allMode()) scheduleRefresh(true);
    });
    scheduleRefresh(true);
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (install() || tries > 40) clearInterval(timer);
  },150);
  if (document.readyState !== 'loading') install();
  else document.addEventListener('DOMContentLoaded',install,{once:true});
})();
