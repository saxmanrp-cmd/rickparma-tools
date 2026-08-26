// Stage 15: simplify the Create page, compact media picking, and reorder caption/help tools.
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

      body.recovery-easy #stage15MediaCard{padding:14px!important;margin-bottom:12px!important}
      body.recovery-easy .stage15-section-title{font-size:17px;font-weight:900;color:#f2f5f9;margin-bottom:9px}
      body.recovery-easy #stage15MediaSource{
        width:100%;min-height:50px;border-radius:13px;border:1px solid rgba(255,255,255,.13);
        background:#0a1018;color:#fff;padding:0 12px;font-size:16px;font-weight:750
      }
      body.recovery-easy #dropZone.stage15-compact-media{
        min-height:0!important;height:auto!important;margin-top:10px!important;padding:0!important;
        border:1px solid rgba(255,255,255,.10)!important;border-radius:13px!important;
        background:#090e15!important;overflow:hidden!important
      }
      body.recovery-easy #dropZone.stage15-compact-media.stage15-empty-media{display:none!important}
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview{min-height:0!important;max-height:160px!important;overflow:hidden!important}
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview img,
      body.recovery-easy #dropZone.stage15-compact-media #mediaPreview video{
        width:100%!important;max-height:160px!important;object-fit:contain!important;display:block!important;background:#06090d!important
      }
      body.recovery-easy #stage15MediaCard #mediaActions{margin-top:8px!important;justify-content:flex-end!important}

      body.recovery-easy #stage15HelperGroup{margin:0 0 12px;padding:12px;border-radius:16px;border:1px solid rgba(145,116,255,.22);background:#0d121a}
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

  function refreshMediaPreview() {
    const drop = q('#dropZone');
    if (!drop) return;
    drop.classList.add('stage15-compact-media');
    drop.classList.toggle('stage15-empty-media', !mediaIsSelected());
  }

  function buildMediaCard(composer) {
    let card = q('#stage15MediaCard');
    const drop = q('#dropZone');
    if (!drop) return null;

    if (!card) {
      card = document.createElement('div');
      card.id = 'stage15MediaCard';
      card.className = 'card compact-card';
      card.innerHTML = `
        <div class="stage15-section-title">Choose Media</div>
        <select id="stage15MediaSource" aria-label="Choose media source">
          <option value="">Choose where to get it…</option>
          <option value="library">Use media already in the app</option>
          <option value="phone">Choose photo or video from my phone</option>
        </select>`;
      composer.insertBefore(card, drop);

      q('#stage15MediaSource',card)?.addEventListener('change', event => {
        const choice = event.target.value;
        event.target.value = '';
        if (choice === 'phone') {
          q('#mediaInput')?.click();
          return;
        }
        if (choice === 'library') {
          q('.nav-item[data-view="media"]')?.click();
        }
      });
    }

    if (drop.parentElement !== card) card.appendChild(drop);
    const actions = q('#mediaActions');
    if (actions && actions.parentElement !== card) card.appendChild(actions);
    refreshMediaPreview();
    return card;
  }

  function renameAndTrim() {
    const comic = q('#comicBlastStudio');
    const summary = comic?.querySelector(':scope > summary');
    if (summary && summary.textContent.trim() !== '🖼 Pick a Background') summary.textContent = '🖼 Pick a Background';

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
    const mediaCard = buildMediaCard(composer);
    const captionCard = q('#caption')?.closest('.card');
    const maxReach = q('#maxReachCard');
    const showHelper = q('#recoveryShowHelper');

    if (comic && composer.firstElementChild !== comic) composer.insertBefore(comic, composer.firstElementChild);
    if (mediaCard && comic && comic.nextElementSibling !== mediaCard) comic.after(mediaCard);
    else if (mediaCard && !comic && composer.firstElementChild !== mediaCard) composer.insertBefore(mediaCard, composer.firstElementChild);

    if (captionCard && mediaCard && mediaCard.nextElementSibling !== captionCard) mediaCard.after(captionCard);

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
    const composer = q('#view-create .composer');
    if (composer) new MutationObserver(schedule).observe(composer,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    q('#mediaInput')?.addEventListener('change',() => setTimeout(schedule,40));
    q('#removeMediaBtn')?.addEventListener('click',() => setTimeout(schedule,40));
    q('.nav-item[data-view="create"]')?.addEventListener('click',() => setTimeout(schedule,80));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
