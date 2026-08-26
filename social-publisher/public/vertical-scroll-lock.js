// Keep the app from drifting/rubber-banding sideways on iPhone while preserving vertical scroll and pinch zoom.
(() => {
  if (document.querySelector('#verticalScrollLockStyles')) return;
  const style = document.createElement('style');
  style.id = 'verticalScrollLockStyles';
  style.textContent = `
    html,body{
      width:100%;
      max-width:100%;
      overflow-x:hidden!important;
      overscroll-behavior-x:none!important;
    }
    body{
      position:relative;
      touch-action:pan-y pinch-zoom;
    }
    .app-shell,.main,.view{
      width:100%;
      max-width:100%;
      min-width:0;
      overflow-x:hidden!important;
    }
    .composer,.card,.page-row,.media-library,#mediaLibrary{
      max-width:100%;
      min-width:0;
    }
    img,video,canvas{
      max-width:100%;
    }
  `;
  document.head.appendChild(style);
})();
