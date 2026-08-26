// The Media tab is now owned by the Background Library.
// Remove the old prototype Media gallery so it cannot flash back in during refresh/sync.
(() => {
  const STORAGE_KEY = 'socialPublisherV3';

  function clearPrototypeMedia() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.media) || !data.media.length) return;
      data.media = [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  function removeLegacyMediaDom() {
    const view = document.querySelector('#view-media');
    if (!view) return;
    view.querySelector(':scope > .page-row')?.remove();
    view.querySelector(':scope > #mediaLibrary')?.remove();
  }

  function disableLegacyRenderer() {
    try {
      if (typeof window.renderMediaLibrary === 'function') {
        window.renderMediaLibrary = () => {};
      }
    } catch {}
  }

  function installGuard() {
    const view = document.querySelector('#view-media');
    if (!view || view.dataset.legacyMediaGuard === '1') return;
    view.dataset.legacyMediaGuard = '1';
    const observer = new MutationObserver(() => removeLegacyMediaDom());
    observer.observe(view, { childList: true });
  }

  function boot() {
    clearPrototypeMedia();
    disableLegacyRenderer();
    removeLegacyMediaDom();
    installGuard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
