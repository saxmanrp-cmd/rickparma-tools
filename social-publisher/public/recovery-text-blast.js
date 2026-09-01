// Text Blast is handled inside the comic/background workflow and the main caption field.
// Stage 16 restores the cleaned Create-page layout without moving any Comic Blast internals.
(() => {
  function loadSafeCreateFlow() {
    if (document.querySelector('script[data-stage16-create-flow]')) return;
    const cleanup = document.createElement('script');
    cleanup.src = '/stage16-create-flow-safe.js?v=20260901-safe-create';
    cleanup.dataset.stage16CreateFlow = '1';
    document.body.appendChild(cleanup);
  }

  function loadStage13Polish() {
    const existing = document.querySelector('script[data-comic-stage13-fix]');
    if (existing) {
      loadSafeCreateFlow();
      return;
    }
    const polish = document.createElement('script');
    polish.src = '/comic-blast-stage13-fix.js';
    polish.dataset.comicStage13Fix = '1';
    polish.addEventListener('load',loadSafeCreateFlow,{once:true});
    document.body.appendChild(polish);
  }

  function loadWysiwyg() {
    const existing = document.querySelector('script[data-comic-blast-wysiwyg]');
    if (existing) {
      loadStage13Polish();
      return;
    }
    const exact = document.createElement('script');
    exact.src = '/comic-blast-wysiwyg.js';
    exact.dataset.comicBlastWysiwyg = '1';
    exact.addEventListener('load',loadStage13Polish,{once:true});
    document.body.appendChild(exact);
  }

  function loadComicTextStyle() {
    const existing = document.querySelector('script[data-comic-text-style]');
    if (existing) {
      loadWysiwyg();
      return;
    }
    const style = document.createElement('script');
    style.src = '/comic-text-style.js';
    style.dataset.comicTextStyle = '1';
    style.addEventListener('load',loadWysiwyg,{once:true});
    document.body.appendChild(style);
  }

  function loadShowHelper() {
    const existing = document.querySelector('script[data-recovery-show-helper]');
    if (existing) {
      loadComicTextStyle();
      return;
    }
    const helper = document.createElement('script');
    helper.src = '/recovery-show-helper.js';
    helper.dataset.recoveryShowHelper = '1';
    helper.addEventListener('load',loadComicTextStyle,{once:true});
    document.body.appendChild(helper);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadShowHelper, {once:true});
  else loadShowHelper();
})();
