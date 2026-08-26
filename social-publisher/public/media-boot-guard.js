// Media boot guard: keep the obsolete post-media gallery from rendering while the Background Library boots.
(() => {
  const STORAGE_KEY = 'socialPublisherV3';

  function clearLocalPrototypeMedia() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && Array.isArray(data.media) && data.media.length) {
        data.media = [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch {}
  }

  function addEarlyStyle() {
    if (document.querySelector('#mediaBootGuardStyle')) return;
    const style = document.createElement('style');
    style.id = 'mediaBootGuardStyle';
    style.textContent = '#view-media .media-tile{display:none!important}';
    document.head.appendChild(style);
  }

  function lockLegacyRenderer() {
    try {
      if (typeof window.renderMediaLibrary === 'function') {
        window.renderMediaLibrary = function renderBackgroundLibraryPlaceholder() {
          const el = document.querySelector('#mediaLibrary');
          if (!el || el.querySelector('.bg-media-shell')) return;
          el.classList.remove('media-library');
          el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div><strong>Loading backgrounds…</strong></div></div>';
        };
      }
      const el = document.querySelector('#mediaLibrary');
      if (el && !el.querySelector('.bg-media-shell')) {
        el.classList.remove('media-library');
        el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div><strong>Loading backgrounds…</strong></div></div>';
      }
    } catch {}
  }

  clearLocalPrototypeMedia();
  addEarlyStyle();
  window.__lockLegacyMedia = lockLegacyRenderer;
  lockLegacyRenderer();
})();
