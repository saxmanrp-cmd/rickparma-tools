// The Media tab is now owned by the Background Library.
// Clear old prototype media and stop the old renderer WITHOUT removing the shared mount container.
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

  function disableLegacyRenderer() {
    try {
      if (typeof window.renderMediaLibrary === 'function') {
        window.renderMediaLibrary = () => {};
      }
    } catch {}
  }

  function hideLegacyTiles() {
    const media = document.querySelector('#mediaLibrary');
    if (!media || media.querySelector('.bg-media-shell')) return;
    media.querySelectorAll(':scope > .media-tile').forEach(node => node.remove());
    if (!media.children.length) {
      media.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div><strong>Loading backgrounds…</strong></div></div>';
    }
  }

  function installGuard() {
    const media = document.querySelector('#mediaLibrary');
    if (!media || media.dataset.legacyMediaGuard === '1') return;
    media.dataset.legacyMediaGuard = '1';
    const observer = new MutationObserver(() => hideLegacyTiles());
    observer.observe(media, { childList: true });
  }

  function boot() {
    clearPrototypeMedia();
    disableLegacyRenderer();
    hideLegacyTiles();
    installGuard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
