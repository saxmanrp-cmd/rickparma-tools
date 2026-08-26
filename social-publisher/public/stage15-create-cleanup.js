// Stage 15: simplify the Create page, consolidate media picking, and reorder caption/help tools.
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

      body.recovery-easy #comicBlastStudio #stage15UploadMediaBtn{
        width:100%!important;min-height:50px!important;margin:0 0 10px!important;font-size:16px!important;font-weight:900!important
      }
      body.recovery-easy #dropZone.stage15-compact-media{
        min-height:0!important;height:auto!important;margin:0 0 10px!important;padding:0!important;
        border:1px solid rgba(255,255,255,.10)!important;border-radius:13px!important;
        background:#090e15!important;overflow:hidden!important
      }
      body.recovery-easy #dropZone.stage15-compact-media.stage15-empty-media{display:none!important}
      body.recovery-easy.stage15-comic-generated-media #comicBlastStudio #dropZone.stage15-compact-media,
      body.recovery-easy.stage15-comic-generated-media #comicBlastStudio #mediaActions{display:none!important}
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview{min-height:0!important;max-height:180px!important;overflow:hidden!important}
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview img,
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview video{
        width:100%!important;max-height:180px!important;object-fit:contain!important;display:block!important;background:#06090d!important
      }
      body.recovery-easy #comicBlastStudio #mediaActions{margin:0 0 10px!important;justify-content:flex-end!important}

      body.recovery-easy #stage15HelperGroup{margin:0 0 12px;padding:12px;border-radius:16px;border:1px solid rgba(145,116,255,.22);background:#0d121a}
      body.recovery-easy .stage15-section-title{font-size:17px;font-weight:900;color:#f2f5f9;margin-bottom:9px}
      body.recovery-easy #stage15HelperGroup .stage15-section-title{margin-bottom:8px}
      body.recovery-easy #stage15HelperGroup #maxReachCard,
      body.recovery-easy #stage15HelperGroup #recoveryShowHelper{margin:7px 0 0!important;padding:0!important;border:0!important;background:transparent!important}
      body.recovery-easy #stage15HelperGroup #maxReachCard>:not(#applyMaxReachBtn),
      body.recovery-easy #stage15HelperGroup #recoveryShowHelper>:not(#showHelperBtn){display:none!important}
      body.recovery-easy #stage15HelperGroup #applyMaxReachBtn,
      body.recovery-easy #stage15HelperGroup #showHelperBtn{width:100%!important;min-height:50px!important;margin:0!important}

      body.recovery-easy #comicBlastStudio>summary{padding:14px 16px!important;font-size:18px!important}
      body.recovery-easy #caption{min-height:120px!important}
      body.recovery-easy #captionStage15Card{margin-bottom:12px!important}
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

  function consolidateMediaIntoChooser() {
    const comic = q('#comicBlastStudio');
    const inner = q('.comic-studio-inner', comic);
    const drop = q('#dropZone');
    if (!comic || !inner || !drop) return null;

    let upload = q('#stage15UploadMediaBtn');
    if (!upload) {
      upload = document.createElement('button');
      upload.id = 'stage15UploadMediaBtn';
      upload.className = 'button secondary full';
      upload.type = 'button';
      upload.textContent = 'Upload a Photo or Video';
      upload.addEventListener('click', () => {
        suppressGeneratedPreview(false);
        comic.open = true;
        q('#mediaInput')?.click();
      });
    }

    if (upload.parentElement !== inner) inner.insertBefore(upload, inner.firstElementChild);
    if (drop.parentElement !== inner) upload.after(drop);

    const actions = q('#mediaActions');
    if (actions && actions.parentElement !== inner) drop.after(actions);

    const oldCard = q('#stage15MediaCard');
    if (oldCard) oldCard.remove();

    refreshMediaPreview();
    return comic;
  }

  function installComicMakeGuard() {
    if (document.documentElement.dataset.stage15ComicMakeGuard === '1') return;
    document.documentElement.dataset.stage15ComicMakeGuard = '1';

    document.addEventListener('click', event => {
      const button = event.target.closest?.('#comicMakeBtn');
      if (!button) return;

      const savedY = window.scrollY;
      const preview = q('#mediaPreview');
      const before = preview?.innerHTML || '';
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

        const after = q('#mediaPreview')?.innerHTML || '';
        if (after === before) suppressGeneratedPreview(false);

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
    if (summary && summary.textContent.trim() !== '🖼 Choose Media') summary.textContent = '🖼 Choose Media';

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

    const comic = consolidateMediaIntoChooser();
    const captionCard = q('#caption')?.closest('.card');
    const maxReach = q('#maxReachCard');
    const showHelper = q('#recoveryShowHelper');

    if (comic && composer.firstElementChild !== comic) composer.insertBefore(comic, composer.firstElementChild);
    if (captionCard && comic && comic.nextElementSibling !== captionCard) comic.after(captionCard);

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
      const comic = q('#comicBlastStudio');
      if (comic) comic.open = true;
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
