// Selection-mode performance helpers for iPhone/Safari.
(() => {
  function optimizeImages(root=document) {
    root.querySelectorAll?.('#bgMediaGrid img').forEach(img => {
      img.loading = 'lazy';
      img.decoding = 'async';
      try { img.fetchPriority = 'low'; } catch {}
    });
  }

  function onRendered() {
    optimizeImages();
  }

  window.addEventListener('backgroundlibraryrendered', onRendered);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',onRendered,{once:true});
  else onRendered();
})();
