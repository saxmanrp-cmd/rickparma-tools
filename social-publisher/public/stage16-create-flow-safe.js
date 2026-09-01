// Stage 16: restore the clean Create flow without touching Comic Blast internals.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);

  function injectStyles() {
    if (q('#stage16CreateFlowStyles')) return;
    const style = document.createElement('style');
    style.id = 'stage16CreateFlowStyles';
    style.textContent = `
      body.recovery-easy #easyCreateIntro,
      body.recovery-easy #easyMediaStep,
      body.recovery-easy #easyUploadHelp,
      body.recovery-easy #uploadPrompt,
      body.recovery-easy #comicBlastStudio .comic-studio-copy{display:none!important}

      body.recovery-easy #stage16MediaCard{padding:13px!important;margin:0 0 12px!important}
      body.recovery-easy .stage16-title{font-size:17px;font-weight:900;color:#f2f5f9;margin-bottom:8px}
      body.recovery-easy #stage16MediaSource{width:100%;min-height:50px;border-radius:13px;border:1px solid rgba(255,255,255,.13);background:#0a1018;color:#fff;padding:0 12px;font-size:16px;font-weight:800}
      body.recovery-easy #dropZone.stage16-compact-media{min-height:0!important;height:auto!important;margin:9px 0 0!important;padding:0!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:13px!important;background:#090e15!important;overflow:hidden!important}
      body.recovery-easy #dropZone.stage16-compact-media.stage16-empty-media{display:none!important}
      body.recovery-easy #dropZone.stage16-compact-media #mediaPreview{min-height:0!important;max-height:160px!important;overflow:hidden!important}
      body.recovery-easy #dropZone.stage16-compact-media #mediaPreview img,
      body.recovery-easy #dropZone.stage16-compact-media #mediaPreview video{width:100%!important;max-height:160px!important;object-fit:contain!important;display:block!important;background:#06090d!important}
      body.recovery-easy #stage16MediaCard #mediaActions{margin-top:7px!important;justify-content:flex-end!important}

      body.recovery-easy #stage15HelperGroup{margin:0 0 12px;padding:12px;border-radius:16px;border:1px solid rgba(145,116,255,.22);background:#0d121a}
      body.recovery-easy #stage15HelperGroup .stage15-section-title{font-size:17px;font-weight:900;color:#f2f5f9;margin-bottom:8px}
      body.recovery-easy #stage15HelperGroup .stage16-helper-actions{display:grid;gap:8px}
      body.recovery-easy #stage15HelperGroup .stage16-helper-actions .button{width:100%!important;min-height:50px!important;margin:0!important}
      body.recovery-easy #maxReachCard,
      body.recovery-easy #recoveryShowHelper{display:none!important}

      body.recovery-easy #comicBlastStudio>summary{padding:14px 16px!important;font-size:18px!important}
      body.recovery-easy #caption{min-height:120px!important}
      body.recovery-easy #captionStage16Card{margin-bottom:12px!important}
    `;
    document.head.appendChild(style);
  }

  function mediaSelected() {
    const preview = q('#mediaPreview');
    return Boolean(preview && !preview.classList.contains('hidden') && preview.children.length);
  }

  function refreshMediaCard() {
    const drop = q('#dropZone');
    if (!drop) return;
    drop.classList.add('stage16-compact-media');
    drop.classList.toggle('stage16-empty-media', !mediaSelected());
  }

  function buildMediaCard(composer, comic) {
    const drop = q('#dropZone');
    if (!drop) return null;
    let card = q('#stage16MediaCard');
    if (!card) {
      card = document.createElement('div');
      card.id = 'stage16MediaCard';
      card.className = 'card compact-card';
      card.innerHTML = `
        <div class="stage16-title">1 · Choose Media</div>
        <select id="stage16MediaSource" aria-label="Choose media source">
          <option value="">Choose where to get it…</option>
          <option value="saved">Use a saved background</option>
          <option value="phone">Photo or video from my phone</option>
        </select>`;
      q('#stage16MediaSource',card)?.addEventListener('change',event => {
        const value = event.target.value;
        event.target.value = '';
        if (value === 'phone') {
          q('#mediaInput')?.click();
          return;
        }
        if (value === 'saved' && comic) {
          comic.open = true;
          comic.scrollIntoView({behavior:'smooth',block:'start'});
        }
      });
    }
    if (drop.parentElement !== card) card.appendChild(drop);
    const actions = q('#mediaActions');
    if (actions && actions.parentElement !== card) card.appendChild(actions);
    refreshMediaCard();
    return card;
  }

  function buildHelperGroup() {
    let group = q('#stage15HelperGroup');
    if (!group) {
      group = document.createElement('div');
      group.id = 'stage15HelperGroup';
      group.innerHTML = '<div class="stage15-section-title">Make It Easy</div><div class="stage16-helper-actions"></div>';
    }
    const actions = q('.stage16-helper-actions',group);
    const apply = q('#applyMaxReachBtn');
    const helper = q('#showHelperBtn');
    if (apply && actions && apply.parentElement !== actions) actions.appendChild(apply);
    if (helper && actions && helper.parentElement !== actions) actions.appendChild(helper);
    return group;
  }

  function applyLayout() {
    const composer = q('#view-create .composer');
    const comic = q('#comicBlastStudio');
    const caption = q('#caption');
    if (!composer || !comic || !caption) return false;

    injectStyles();

    const summary = comic.querySelector(':scope > summary');
    if (summary) summary.textContent = '🖼 Pick a Background';

    const mediaCard = buildMediaCard(composer,comic);
    const captionCard = caption.closest('.card');
    if (captionCard) captionCard.id = 'captionStage16Card';
    const helperGroup = buildHelperGroup();

    if (composer.firstElementChild !== comic) composer.insertBefore(comic,composer.firstElementChild);
    if (mediaCard && comic.nextElementSibling !== mediaCard) comic.after(mediaCard);
    if (captionCard && mediaCard && mediaCard.nextElementSibling !== captionCard) mediaCard.after(captionCard);
    if (helperGroup && captionCard && captionCard.nextElementSibling !== helperGroup) captionCard.after(helperGroup);

    const oldStage15Card = q('#stage15MediaCard');
    if (oldStage15Card) oldStage15Card.remove();
    q('#stage15UploadMediaBtn')?.remove();

    refreshMediaCard();
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Clean Create Flow';
    return true;
  }

  function boot() {
    let tries = 0;
    const run = () => {
      tries += 1;
      if (applyLayout() || tries > 50) return;
      setTimeout(run,100);
    };
    run();

    q('#mediaInput')?.addEventListener('change',() => setTimeout(refreshMediaCard,50));
    q('#removeMediaBtn')?.addEventListener('click',() => setTimeout(refreshMediaCard,50));
    q('.nav-item[data-view="create"]')?.addEventListener('click',() => setTimeout(applyLayout,100));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
