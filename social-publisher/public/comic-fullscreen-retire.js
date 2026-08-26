// Retire the old full-screen comic editor now that speech bubbles are mapped in the inline editor.
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

  injectRetiredStyles();
  window.retireComicFullscreenEditor = retireComicFullscreenEditor;
  retireComicFullscreenEditor();
})();
