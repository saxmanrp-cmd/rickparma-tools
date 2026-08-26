// Text Blast is now handled inside Comic Blast Studio and the main caption field.
(() => {
  function loadWysiwyg() {
    if (document.querySelector('script[data-comic-blast-wysiwyg]')) return;
    const exact = document.createElement('script');
    exact.src = '/comic-blast-wysiwyg.js';
    exact.dataset.comicBlastWysiwyg = '1';
    document.body.appendChild(exact);
  }

  function loadShowHelper() {
    const existing = document.querySelector('script[data-recovery-show-helper]');
    if (existing) {
      loadWysiwyg();
      return;
    }
    const helper = document.createElement('script');
    helper.src = '/recovery-show-helper.js';
    helper.dataset.recoveryShowHelper = '1';
    helper.addEventListener('load',loadWysiwyg,{once:true});
    document.body.appendChild(helper);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadShowHelper, {once:true});
  else loadShowHelper();
})();
