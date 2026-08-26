// Comic Blast Stage 13: keep bubble text when making a post and simplify sizing controls.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);

  function injectStyles() {
    if (q('#comicStage13Styles')) return;
    const style = document.createElement('style');
    style.id = 'comicStage13Styles';
    style.textContent = `
      body.recovery-easy #comicFontRange,
      body.recovery-easy #comicFullscreenRange{display:none!important}
      body.recovery-easy .comic-font-row{grid-template-columns:1fr 1fr!important}
      body.recovery-easy .comic-font-row button{width:100%!important}
      body.recovery-easy .comic-fullscreen-font{grid-template-columns:1fr 1fr!important}
      body.recovery-easy .comic-fullscreen-font button{width:100%!important}
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

    // The exact-render layer checks the hidden fullscreen editor first. Keep all
    // three text surfaces identical before its document-level click handler runs.
    area.value = value;
    if (inline && inline.innerText !== value) inline.innerText = value;
    if (full && full.innerText !== value) full.innerText = value;
  }

  function boot() {
    injectStyles();
    // Window capture runs before the existing document capture handler.
    window.addEventListener('click',preserveBubbleTextBeforeMake,true);
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Comic Editor Polish';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
