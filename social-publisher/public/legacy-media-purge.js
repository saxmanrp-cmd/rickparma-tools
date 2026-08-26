// Compatibility shim for older recovery loaders.
// The new Media boot guard owns legacy-media suppression; do not watch or mutate the Background Library DOM.
(() => {
  const STORAGE_KEY = 'socialPublisherV3';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && Array.isArray(data.media) && data.media.length) {
        data.media = [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    }
  } catch {}
  try { window.__lockLegacyMedia?.(); } catch {}
})();
