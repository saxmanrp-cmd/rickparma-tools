// Keep the app locked to vertical page scrolling on iPhone/Safari, allow native carousel swipes, and disable page zoom.
(() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute('content','width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  }

  if (!document.querySelector('#verticalScrollLockStyles')) {
    const style = document.createElement('style');
    style.id = 'verticalScrollLockStyles';
    style.textContent = `
      html,body{
        width:100%;
        max-width:100%;
        overflow-x:hidden!important;
        overscroll-behavior-x:none!important;
        touch-action:manipulation!important;
      }
      body{
        position:relative;
      }
      .app-shell,.main,.view{
        width:100%;
        max-width:100%;
        min-width:0;
        overflow-x:hidden!important;
        touch-action:manipulation!important;
      }
      .composer,.card,.page-row,.media-library,#mediaLibrary{
        max-width:100%;
        min-width:0;
      }
      #previewSheet .destination-preview-track{
        touch-action:pan-x!important;
        overscroll-behavior-x:contain!important;
      }
      button,a,label,input,textarea,select{
        touch-action:manipulation!important;
      }
      input,textarea,select{
        font-size:16px!important;
      }
      img,video,canvas{
        max-width:100%;
      }
    `;
    document.head.appendChild(style);
  }

  if (window.__socialPublisherZoomLockInstalled) return;
  window.__socialPublisherZoomLockInstalled = true;

  const stopZoom = event => event.preventDefault();
  for (const type of ['gesturestart','gesturechange','gestureend']) {
    document.addEventListener(type,stopZoom,{passive:false});
  }

  document.addEventListener('touchmove',event => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  },{passive:false});
})();
