// Comic Blast Stage 14: preserve bubble text, keep Fit to Bubble only, and expose Text Blast captions.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);

  function injectStyles() {
    if (q('#comicStage14Styles')) return;
    const style = document.createElement('style');
    style.id = 'comicStage14Styles';
    style.textContent = `
      body.recovery-easy #comicFontRange,
      body.recovery-easy #comicFontDown,
      body.recovery-easy #comicFontUp,
      body.recovery-easy #comicFullscreenRange,
      body.recovery-easy #comicFullscreenDown,
      body.recovery-easy #comicFullscreenUp,
      body.recovery-easy .comic-font-row,
      body.recovery-easy .comic-fullscreen-font{display:none!important}

      body.recovery-easy #comicCaptionBlast>strong{display:none!important}
      body.recovery-easy #comicCaptionBlast:not(.is-open)>:not(#comicCaptionPullBtn){display:none!important}
      body.recovery-easy #comicCaptionPullBtn{
        width:100%;min-height:52px;border:0;border-radius:13px;
        background:linear-gradient(135deg,#6554e8,#9168ff);color:#fff;
        font-size:16px;font-weight:900;padding:0 14px;text-align:center
      }
      body.recovery-easy #comicCaptionBlast.is-open #comicCaptionPullBtn{margin-bottom:10px;background:#151d29;border:1px solid rgba(255,255,255,.13)}
    `;
    document.head.appendChild(style);
  }

  function preserveBubbleTextBeforeMake(event) {
    const button = event.target.closest?.('#comicMakeBtn,#comicFullscreenMake');
    if (!button) return;

    const overlay = q('#comicFullscreenEditor');
    const area = q('#comicMessage');
    const inline = q('#comicBubbleText');
    const full = q('#comicFullscreenText');
    if (!area) return;

    const fullscreenOpen = Boolean(overlay && !overlay.classList.contains('hidden'));
    const value = fullscreenOpen
      ? String(full?.innerText || '').slice(0,2200)
      : String(inline?.innerText || area.value || '').slice(0,2200);

    if (!value.trim()) return;

    area.value = value;
    if (inline && inline.innerText !== value) inline.innerText = value;
    if (full && full.innerText !== value) full.innerText = value;
  }

  function simplifySizingCopy() {
    const main = q('#comicFitStatus');
    const full = q('#comicFullscreenStatus');
    for (const status of [main,full]) {
      if (!status) continue;
      if (/A−|A\-|pinch/i.test(status.textContent || '')) {
        status.textContent = 'Use Fit to Bubble for the best text size.';
      }
    }
  }

  function enhanceCaptionBlast() {
    const block = q('#comicCaptionBlast');
    if (!block || q('#comicCaptionPullBtn',block)) return Boolean(block);

    const button = document.createElement('button');
    button.id = 'comicCaptionPullBtn';
    button.type = 'button';
    button.textContent = '💬 Pull From Text Blast';
    block.insertBefore(button,block.firstChild);

    const setOpen = open => {
      block.classList.toggle('is-open',open);
      button.textContent = open ? '✕ Close Text Blast' : '💬 Pull From Text Blast';
    };

    setOpen(false);
    button.addEventListener('click',() => setOpen(!block.classList.contains('is-open')));

    const picker = q('#comicCaptionBlastPicker',block);
    picker?.addEventListener('change',() => {
      if (picker.value !== '') setTimeout(() => setOpen(false),120);
    });
    return true;
  }

  function finishSetup() {
    simplifySizingCopy();
    if (enhanceCaptionBlast()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      simplifySizingCopy();
      if (enhanceCaptionBlast() || tries > 30) clearInterval(timer);
    },120);
  }

  function boot() {
    injectStyles();
    window.addEventListener('click',preserveBubbleTextBeforeMake,true);
    finishSetup();
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Comic Editor Simplified';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
