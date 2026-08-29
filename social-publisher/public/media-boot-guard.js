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

  function loadRecoveryFeature(src, marker) {
    if (document.querySelector(`script[data-recovery-feature="${marker}"]`)) return;
    const script = document.createElement('script');
    script.src = `${src}?v=20260828-all-sizes-stability`;
    script.async = false;
    script.dataset.recoveryFeature = marker;
    document.body.appendChild(script);
  }

  function blockLegacySmartPlanAutoload() {
    if (document.querySelector('script[data-smart-plan]')) return;
    const marker = document.createElement('script');
    marker.type = 'application/json';
    marker.dataset.smartPlan = 'recovery-disabled';
    marker.textContent = '{}';
    document.body.appendChild(marker);
  }

  clearLocalPrototypeMedia();
  addEarlyStyle();
  window.__lockLegacyMedia = lockLegacyRenderer;
  lockLegacyRenderer();

  // Re-enable Face ID/passkeys without re-enabling the older disabled feature chain.
  // Password login remains the fallback at all times.
  blockLegacySmartPlanAutoload();
  loadRecoveryFeature('/app-icons.js','app-icons');
  loadRecoveryFeature('/passkeys.js','passkeys');
  loadRecoveryFeature('/comic-multi-text.js','comic-multi-text');
  loadRecoveryFeature('/media-multi-text-mapping.js','media-multi-text-mapping');
  loadRecoveryFeature('/all-sizes-scene-stability.js','all-sizes-scene-stability');
})();
