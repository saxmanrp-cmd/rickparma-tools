// Safe Create cleanup: keep Comic/background controls intact while simplifying the page.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let libraryLoaded = false;
  let libraryBusy = false;

  function toastSafe(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else if (typeof toast === 'function') toast(message);
  }

  function injectStyles() {
    if (q('#stage15CreateCleanupStyles')) return;
    const style = document.createElement('style');
    style.id = 'stage15CreateCleanupStyles';
    style.textContent = `
      body.recovery-easy #easyCreateIntro,
      body.recovery-easy #easyMediaStep,
      body.recovery-easy #easyUploadHelp,
      body.recovery-easy #uploadPrompt,
      body.recovery-easy #comicBlastStudio .comic-studio-copy{display:none!important}

      body.recovery-easy #comicBlastStudio{margin:0 0 12px!important}
      body.recovery-easy #comicBlastStudio>summary{padding:14px 16px!important;font-size:18px!important}

      body.recovery-easy #stage15MediaPicker{margin:0 0 12px;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:#0d121a;overflow:hidden}
      body.recovery-easy #stage15MediaPicker>summary{list-style:none;cursor:pointer;padding:14px 16px;font-size:17px;font-weight:900;color:#f2f5f9}
      body.recovery-easy #stage15MediaPicker>summary::-webkit-details-marker{display:none}
      body.recovery-easy #stage15MediaPicker>summary::after{content:'＋';float:right;color:#9d8cff}
      body.recovery-easy #stage15MediaPicker[open]>summary::after{content:'−'}
      body.recovery-easy .stage15-media-inner{padding:0 12px 12px}
      body.recovery-easy .stage15-media-source-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      body.recovery-easy .stage15-media-source-row button{min-height:48px!important;font-size:14px!important}
      body.recovery-easy #stage15LibraryStatus{margin:9px 1px 0;color:#96a2b3;font-size:12px;line-height:1.4}
      body.recovery-easy #stage15LibraryGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
      body.recovery-easy #stage15LibraryGrid.hidden{display:none!important}
      body.recovery-easy .stage15-library-tile{position:relative;aspect-ratio:4/5;padding:0;border:1px solid rgba(255,255,255,.10);border-radius:11px;overflow:hidden;background:#070b11}
      body.recovery-easy .stage15-library-tile img,body.recovery-easy .stage15-library-tile video{width:100%;height:100%;display:block;object-fit:cover;background:#070b11}
      body.recovery-easy .stage15-library-tile span{position:absolute;left:5px;right:5px;bottom:5px;padding:5px;border-radius:8px;background:rgba(5,8,13,.82);color:#fff;font-size:11px;font-weight:900;text-align:center}

      body.recovery-easy #stage15MediaPicker #dropZone{min-height:0!important;height:auto!important;margin:10px 0 0!important;padding:0!important;border:0!important;border-radius:12px!important;background:#070b11!important;overflow:hidden!important}
      body.recovery-easy #stage15MediaPicker #dropZone.stage15-empty-media{display:none!important}
      body.recovery-easy #stage15MediaPicker #mediaPreview{min-height:0!important;max-height:150px!important;overflow:hidden!important}
      body.recovery-easy #stage15MediaPicker #mediaPreview img,
      body.recovery-easy #stage15MediaPicker #mediaPreview video{width:100%!important;max-height:150px!important;object-fit:contain!important;display:block!important;background:#06090d!important}
      body.recovery-easy #stage15MediaPicker #mediaActions{margin:7px 0 0!important;justify-content:flex-end!important}

      body.recovery-easy #captionStage15Card{margin:0 0 12px!important}
      body.recovery-easy #captionStage15Card #caption{min-height:120px!important}

      body.recovery-easy #stage15HelperGroup{margin:0 0 12px;padding:12px;border-radius:16px;border:1px solid rgba(145,116,255,.22);background:#0d121a}
      body.recovery-easy .stage15-section-title{font-size:17px;font-weight:900;color:#f2f5f9;margin-bottom:8px}
      body.recovery-easy #stage15HelperGroup #maxReachCard,
      body.recovery-easy #stage15HelperGroup #recoveryShowHelper{margin:7px 0 0!important;padding:0!important;border:0!important;background:transparent!important}
      body.recovery-easy #stage15HelperGroup #maxReachCard>:not(#applyMaxReachBtn),
      body.recovery-easy #stage15HelperGroup #recoveryShowHelper>:not(#showHelperBtn):not(#showHelperResult){display:none!important}
      body.recovery-easy #stage15HelperGroup #applyMaxReachBtn,
      body.recovery-easy #stage15HelperGroup #showHelperBtn{width:100%!important;min-height:50px!important;margin:0!important}
      body.recovery-easy #stage15HelperGroup #showHelperResult{margin-top:8px!important}

      @media(max-width:430px){
        body.recovery-easy .stage15-media-source-row{grid-template-columns:1fr}
        body.recovery-easy #stage15LibraryGrid{grid-template-columns:repeat(2,1fr)}
      }
    `;
    document.head.appendChild(style);
  }

  function mediaIsSelected() {
    const preview = q('#mediaPreview');
    return Boolean(preview && !preview.classList.contains('hidden') && preview.children.length);
  }

  function refreshMediaPreview() {
    const drop = q('#dropZone');
    if (!drop) return;
    drop.classList.toggle('stage15-empty-media', !mediaIsSelected());
  }

  function ensureMediaPicker() {
    const composer = q('#view-create .composer');
    const comic = q('#comicBlastStudio');
    const drop = q('#dropZone');
    if (!composer || !comic || !drop) return null;

    let picker = q('#stage15MediaPicker');
    if (!picker) {
      picker = document.createElement('details');
      picker.id = 'stage15MediaPicker';
      picker.innerHTML = `
        <summary>📷 Choose Photo or Video</summary>
        <div class="stage15-media-inner">
          <div class="stage15-media-source-row">
            <button id="stage15UseLibraryBtn" class="button secondary" type="button">Use Uploaded Media</button>
            <button id="stage15UsePhoneBtn" class="button secondary" type="button">From My Phone</button>
          </div>
          <div id="stage15LibraryStatus"></div>
          <div id="stage15LibraryGrid" class="hidden"></div>
        </div>`;
    }

    if (picker.parentElement !== composer) comic.after(picker);
    const inner = q('.stage15-media-inner', picker);
    if (drop.parentElement !== inner) inner.appendChild(drop);
    const actions = q('#mediaActions');
    if (actions && actions.parentElement !== inner) inner.appendChild(actions);

    q('#stage15UsePhoneBtn')?.addEventListener('click', choosePhone, {once:true});
    q('#stage15UseLibraryBtn')?.addEventListener('click', toggleLibrary, {once:true});
    q('#stage15LibraryGrid')?.addEventListener('click', chooseLibraryItem, {once:true});
    refreshMediaPreview();
    return picker;
  }

  function choosePhone() {
    const picker = q('#stage15MediaPicker');
    if (picker) picker.open = true;
    q('#mediaInput')?.click();
  }

  async function toggleLibrary() {
    const grid = q('#stage15LibraryGrid');
    if (!grid) return;
    if (!grid.classList.contains('hidden')) {
      grid.classList.add('hidden');
      return;
    }
    grid.classList.remove('hidden');
    if (!libraryLoaded) await loadLibrary();
  }

  async function loadLibrary() {
    if (libraryBusy) return;
    libraryBusy = true;
    const grid = q('#stage15LibraryGrid');
    const status = q('#stage15LibraryStatus');
    if (status) status.textContent = 'Loading uploaded media…';
    try {
      const response = await fetch('/api/posts', {headers:{accept:'application/json'},cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load uploaded media.');
      const posts = Array.isArray(data.posts) ? data.posts : [];
      const unique = [];
      const seen = new Set();
      for (const post of posts) {
        const key = String(post.media_key || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push({key,type:String(post.media_type || 'image/jpeg')});
        if (unique.length >= 18) break;
      }
      if (!unique.length) {
        if (grid) grid.innerHTML = '';
        if (status) status.textContent = 'No previously uploaded post media yet.';
        libraryLoaded = true;
        return;
      }
      if (grid) grid.innerHTML = unique.map((item,index) => {
        const url = `/media/${encodeURIComponent(item.key)}`;
        const visual = item.type.startsWith('video/')
          ? `<video src="${esc(url)}" muted playsinline preload="metadata"></video>`
          : `<img src="${esc(url)}" alt="Uploaded media ${index+1}" loading="lazy" />`;
        return `<button class="stage15-library-tile" type="button" data-stage15-media-key="${esc(item.key)}" data-stage15-media-type="${esc(item.type)}">${visual}<span>Use</span></button>`;
      }).join('');
      if (status) status.textContent = 'Tap a thumbnail to use it in this post.';
      libraryLoaded = true;
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not load uploaded media.';
    } finally {
      libraryBusy = false;
    }
  }

  async function chooseLibraryItem(event) {
    const tile = event.target.closest?.('[data-stage15-media-key]');
    if (!tile) return;
    const key = tile.dataset.stage15MediaKey || '';
    const type = tile.dataset.stage15MediaType || 'image/jpeg';
    if (!key) return;
    const status = q('#stage15LibraryStatus');
    tile.disabled = true;
    if (status) status.textContent = 'Adding media…';
    try {
      const response = await fetch(`/media/${encodeURIComponent(key)}`);
      if (!response.ok) throw new Error('Could not load that media.');
      const blob = await response.blob();
      const name = key.split('/').pop() || `media-${Date.now()}`;
      const file = new File([blob], name, {type:blob.type || type,lastModified:Date.now()});
      if (typeof handleMedia !== 'function') throw new Error('Media picker is not ready yet.');
      await handleMedia(file);
      const picker = q('#stage15MediaPicker');
      if (picker) picker.open = true;
      q('#stage15LibraryGrid')?.classList.add('hidden');
      if (status) status.textContent = 'Media added.';
      setTimeout(refreshMediaPreview,60);
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not add that media.';
      toastSafe(error.message || 'Could not add that media.');
    } finally {
      tile.disabled = false;
    }
  }

  function renameAndTrim() {
    const comic = q('#comicBlastStudio');
    const summary = comic?.querySelector(':scope > summary');
    if (summary) summary.textContent = '🖼 Pick a Background';

    const captionCard = q('#caption')?.closest('.card');
    if (captionCard) {
      captionCard.id = 'captionStage15Card';
      const label = q('.caption-topline label', captionCard);
      if (label) label.textContent = 'Caption';
    }
    const apply = q('#applyMaxReachBtn');
    if (apply) apply.textContent = 'Use My Suggestions';
    const helper = q('#showHelperBtn');
    if (helper) helper.textContent = 'Help Me Post This';
  }

  function reorderCreate() {
    const composer = q('#view-create .composer');
    const comic = q('#comicBlastStudio');
    if (!composer || !comic) return;
    const mediaPicker = ensureMediaPicker();
    const captionCard = q('#caption')?.closest('.card');
    const maxReach = q('#maxReachCard');
    const showHelper = q('#recoveryShowHelper');

    if (composer.firstElementChild !== comic) composer.insertBefore(comic, composer.firstElementChild);
    if (mediaPicker && comic.nextElementSibling !== mediaPicker) comic.after(mediaPicker);
    if (captionCard && mediaPicker && mediaPicker.nextElementSibling !== captionCard) mediaPicker.after(captionCard);

    let tools = q('#stage15HelperGroup');
    if ((maxReach || showHelper) && !tools) {
      tools = document.createElement('div');
      tools.id = 'stage15HelperGroup';
      tools.innerHTML = '<div class="stage15-section-title">Make It Easy</div>';
    }
    if (tools) {
      if (maxReach && maxReach.parentElement !== tools) tools.appendChild(maxReach);
      if (showHelper && showHelper.parentElement !== tools) tools.appendChild(showHelper);
      if (captionCard && captionCard.nextElementSibling !== tools) captionCard.after(tools);
    }
    refreshMediaPreview();
  }

  function apply() {
    injectStyles();
    renameAndTrim();
    reorderCreate();
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Clean Create Flow';
  }

  function boot() {
    apply();
    q('#mediaInput')?.addEventListener('change',() => {
      const picker = q('#stage15MediaPicker');
      if (picker) picker.open = true;
      setTimeout(refreshMediaPreview,50);
    });
    q('#removeMediaBtn')?.addEventListener('click',() => setTimeout(refreshMediaPreview,50));
    q('.nav-item[data-view="create"]')?.addEventListener('click',() => setTimeout(apply,80));
    [120,350,800,1500].forEach(delay => setTimeout(apply,delay));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
