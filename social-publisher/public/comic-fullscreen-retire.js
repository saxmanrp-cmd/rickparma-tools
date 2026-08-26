// Retire the old full-screen comic editor and load Create-flow preview upgrades.
(() => {
  const STYLE_ID = 'comicFullscreenRetiredStyles';

  function injectRetiredStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #comicFullscreenOpenBtn,
      #comicFullscreenEditor,
      .comic-fullscreen-open,
      .comic-fullscreen-editor{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function retireComicFullscreenEditor() {
    const overlay = document.querySelector('#comicFullscreenEditor');
    if (overlay && !overlay.classList.contains('hidden')) document.body.style.overflow = '';
    document.querySelector('#comicFullscreenOpenBtn')?.remove();
    overlay?.remove();
  }

  function loadCreateFlowControls() {
    if (document.querySelector('script[data-create-flow-controls-v2]')) return;
    const script = document.createElement('script');
    script.src = '/create-flow-controls-v2.js';
    script.dataset.createFlowControlsV2 = '1';
    document.body.appendChild(script);
  }

  function loadDestinationPreviewPolish() {
    if (document.querySelector('script[data-destination-preview-polish]')) {
      loadCreateFlowControls();
      return;
    }
    const script = document.createElement('script');
    script.src = '/destination-preview-polish.js';
    script.dataset.destinationPreviewPolish = '1';
    script.addEventListener('load',loadCreateFlowControls,{once:true});
    document.body.appendChild(script);
  }

  function loadDestinationPreviewCarousel() {
    if (document.querySelector('script[data-destination-preview-carousel]')) {
      loadDestinationPreviewPolish();
      return;
    }
    const script = document.createElement('script');
    script.src = '/destination-preview-carousel.js';
    script.dataset.destinationPreviewCarousel = '1';
    script.addEventListener('load',loadDestinationPreviewPolish,{once:true});
    document.body.appendChild(script);
  }

  injectRetiredStyles();
  window.retireComicFullscreenEditor = retireComicFullscreenEditor;
  retireComicFullscreenEditor();
  loadDestinationPreviewCarousel();
})();
