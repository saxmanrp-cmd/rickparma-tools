// Text Blast is now handled inside Comic Blast Studio.
(() => {
  function loadShowHelper() {
    if (document.querySelector('script[data-recovery-show-helper]')) return;
    const helper = document.createElement('script');
    helper.src = '/recovery-show-helper.js';
    helper.dataset.recoveryShowHelper = '1';
    document.body.appendChild(helper);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadShowHelper, {once:true});
  else loadShowHelper();
})();
