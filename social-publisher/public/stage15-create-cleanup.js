// Stage 16: keep Comic Blast visible, separate media picking, and preserve the cleaner Create order.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);

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

      body.recovery-easy #comicBlastStudio{margin-bottom:10px!important}
      body.recovery-easy #comicBlastStudio>summary{padding:14px 16px!important;font-size:18px!important}

      body.recovery-easy #stage15MediaChooser{margin:0 0 12px;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:#0d121a;overflow:hidden}
      body.recovery-easy #stage15MediaChooser>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;font-size:16px;font-weight:900;color:#f2f5f9}
      body.recovery-easy #stage15MediaChooser>summary::-webkit-details-marker{display:none}
      body.recovery-easy #stage15MediaChooser>summary::after{content:'＋';font-size:20px;color:#9d8cff}
      body.recovery-easy #stage15MediaChooser[open]>summary::after{content:'−'}
      body.recovery-easy .stage15-media-inner{padding:0 12px 12px}
      body.recovery-easy .stage15-media-source-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      body.recovery-easy .stage15-media-source-grid .button{min-height:48px!important;margin:0!important;font-size:15px!important}

      body.recovery-easy #dropZone.stage15-compact-media{
        min-height:0!important;height:auto!important;margin:10px 0 0!important;padding:0!important;
        border:1px solid rgba(255,255,255,.10)!important;border-radius:13px!important;
        background:#090e15!important;overflow:hidden!important
      }
      body.recovery-easy #dropZone.stage15-compact-media.stage15-empty-media{display:none!important}
      body.recovery-easy.stage15-comic-generated-media #dropZone.stage15-compact-media,
      body.recovery-easy.stage15-comic-generated-media #mediaPreview,
      body.recovery-easy.stage15-comic-generated-media #mediaActions{display:none!important}
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview{min-height:0!important;max-height:180px!important;overflow:hidden!important}
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview img,
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview video{
        width:100%!important;max-height:180px!important;object-fit:contain!important;display:block!important;background:#06090d!important
      }
      body.recovery-easy #stage15MediaChooser #mediaActions{margin:8px 0 0!important;justify-content:flex-end!important}

      body.recovery-easy #stage15HelperGroup{margin:0 0 12px;padding:12px;border-radius:16px;border:1px solid rgba(145,116,255,.22);background:#0d121a}
      body.recovery-easy .stage15-section-title{font-size:17px;font-weight:900;color:#f2f5f9;margin-bottom:9px}
      body.recovery-easy #stage15HelperGroup .stage15-section-title{margin-bottom:8px}
      body.recovery-easy #stage15HelperGroup #maxReachCard,
      body.recovery-easy #stage15HelperGroup #recoveryShowHelper{margin:7px 0 0!important;padding:0!important;border:0!important;background:transparent!important}
      body.recovery-easy #stage15HelperGroup #maxReachCard>:not(#applyMaxReachBtn),
      body.recovery-easy #stage15HelperGroup #recoveryShowHelper>:not(#showHelperBtn){display:none!important}
      body.recovery-easy #stage15HelperGroup #applyMaxReachBtn,
      body.recovery-easy #stage15HelperGroup #showHelperBtn{width:100%!important;min-height:50px!important;margin:0!important}

      body.recovery-easy #caption{min-height:120px!important}
      body.recovery-easy #captionStage15Card{margin-bottom:12px!important}
      @media(max-width:430px){body.recovery-easy .stage15-media-source-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function mediaIsSelected() {
    const preview = q('#mediaPreview');
    return Boolean(preview && !preview.classList.contains('hidden') && preview.children.length);
  }

  function suppressGeneratedPreview(value) {
    document.body.classList.toggle('stage15-comic-generated-media', Boolean(value));
  }

  function refreshMediaPreview() {
    const drop = q('#dropZone');
    if (!drop) return;
    drop.classList.add('stage15-compact-media');
    drop.classList.toggle('stage15-empty-media', !mediaIsSelected());
  }

  function buildCompactMediaChooser() {
    const composer = q('#view-create .composer');
    const comic = q('#comicBlastStudio');
    const drop = q('#dropZone');
    if (!composer || !comic || !drop) return null;

    q('#stage15UploadMediaBtn',comic)?.remove();

    let chooser = q('#stage15MediaChooser');
    if (!chooser) {
      chooser = document.createElement('details');
      chooser.id = 'stage15MediaChooser';
      chooser.innerHTML = `
        <summary>Choose Photo or Video</summary>
        <div class="stage15-media-inner">
          <div class="stage15-media-source-grid">
            <button id="stage15UseAppLibraryBtn" class="button secondary" type="button">App Library</button>
            <button id="stage15UploadMediaBtn" class="button secondary" type="button">My Phone</button>
          </div>
        </div>`;
      comic.after(chooser);

      q('#stage15UseAppLibraryBtn',chooser)?.addEventListener('click',() => {
        suppressGeneratedPreview(false);
        if (typeof navigate === 'function') navigate('media');
        else q('.nav-item[data-view="media"]')?.click();
      });
      q('#stage15UploadMediaBtn',chooser)?.addEventListener('click',() => {
        suppressGeneratedPreview(false);
        q('#mediaInput')?.click();
      });
    }

    const inner = q('.stage15-media-inner',chooser);
    if (inner && drop.parentElement !== inner) inner.appendChild(drop);

    const actions = q('#mediaActions');
    if (inner && actions && actions.parentElement !== inner) inner.appendChild(actions);

    const oldCard = q('#stage15MediaCard');
    if (oldCard) oldCard.remove();

    refreshMediaPreview();
    return chooser;
  }

  function installComicMakeGuard() {
    if (document.documentElement.dataset.stage15ComicMakeGuard === '1') return;
    document.documentElement.dataset.stage15ComicMakeGuard = '1';

    document.addEventListener('click', event => {
      const button = event.target.closest?.('#comicMakeBtn');
      if (!button) return;

      const savedY = window.scrollY;
      const drop = q('#dropZone');
      let originalScrollIntoView = null;

      suppressGeneratedPreview(true);

      if (drop && typeof drop.scrollIntoView === 'function') {
        originalScrollIntoView = drop.scrollIntoView;
        try { drop.scrollIntoView = () => {}; } catch {}
      }

      let checks = 0;
      const finish = () => {
        checks += 1;
        const stillMaking = button.disabled || /making graphic/i.test(button.textContent || '');
        if (stillMaking && checks < 240) {
          setTimeout(finish, 50);
          return;
        }

        if (drop && originalScrollIntoView) {
          try { drop.scrollIntoView = originalScrollIntoView; } catch {}
        }

        requestAnimationFrame(() => {
          window.scrollTo({ top:savedY, left:0, behavior:'auto' });
        });
      };

      setTimeout(finish, 50);
    }, { capture:true });
  }

  function renameAndTrim() {
    const comic = q('#comicBlastStudio');
    const summary = comic?.querySelector(':scope > summary');
    if (summary) summary.textContent = '🖼 Pick a Background';

    if (comic && comic.dataset.stage16InitialOpen !== '1') {
      comic.dataset.stage16InitialOpen = '1';
      comic.open = true;
    }

    const captionCard = q('#caption')?.closest('.card');
    if (captionCard) {
      captionCard.id = 'captionStage15Card';
      const label = captionCard.querySelector('.caption-topline label');
      if (label) label.textContent = 'Caption';
    }

    const apply = q('#applyMaxReachBtn');
    if (apply) apply.textContent = 'Use My Suggestions';
    const helper = q('#showHelperBtn');
    if (helper) helper.textContent = 'Help Me Post This';
  }

  function reorderCreate() {
    const composer = q('#view-create .composer');
    if (!composer) return;

    const comic = q('#comicBlastStudio');
    const chooser = buildCompactMediaChooser();
    const captionCard = q('#caption')?.closest('.card');
    const maxReach = q('#maxReachCard');
    const showHelper = q('#recoveryShowHelper');

    if (comic && composer.firstElementChild !== comic) composer.insertBefore(comic, composer.firstElementChild);
    if (chooser && comic && comic.nextElementSibling !== chooser) comic.after(chooser);
    if (captionCard && chooser && chooser.nextElementSibling !== captionCard) chooser.after(captionCard);

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
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Restored Create Flow';
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  };

  function boot() {
    apply();
    installComicMakeGuard();
    const composer = q('#view-create .composer');
    if (composer) new MutationObserver(schedule).observe(composer,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    q('#mediaInput')?.addEventListener('change',() => {
      suppressGeneratedPreview(false);
      const chooser = q('#stage15MediaChooser');
      if (chooser) chooser.open = true;
      setTimeout(schedule,40);
    });
    q('#removeMediaBtn')?.addEventListener('click',() => {
      suppressGeneratedPreview(false);
      setTimeout(schedule,40);
    });
    q('.nav-item[data-view="create"]')?.addEventListener('click',() => setTimeout(schedule,80));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
