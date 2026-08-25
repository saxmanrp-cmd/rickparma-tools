// Recovery Stage 5: restore one simple flyer-first Smart Plan without loading the old feature chain.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function injectStyles() {
    if (q('#recoveryShowHelperStyles')) return;
    const style = document.createElement('style');
    style.id = 'recoveryShowHelperStyles';
    style.textContent = `
      body.recovery-easy .show-helper{margin:0 0 14px;padding:16px;border-radius:18px;border:1px solid rgba(145,116,255,.28);background:linear-gradient(145deg,#151224,#101724 60%,#10131a)}
      body.recovery-easy .show-helper-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
      body.recovery-easy .show-helper-icon{width:44px;height:44px;display:grid;place-items:center;flex:0 0 44px;border-radius:14px;background:linear-gradient(135deg,#6b5be7,#b56dff);font-size:22px}
      body.recovery-easy .show-helper-head strong{display:block;font-size:19px;line-height:1.2;color:#f4f5f8}
      body.recovery-easy .show-helper-head span{display:block;margin-top:4px;color:#aeb8c7;font-size:15px;line-height:1.4}
      body.recovery-easy .show-helper-result{margin-top:10px;padding:12px 13px;border-radius:13px;background:#0a1018;color:#dce2eb;font-size:15px;line-height:1.45}
      body.recovery-easy .show-helper-result strong{color:#fff}
      body.recovery-easy #showHelperBtn{min-height:54px!important;font-size:17px!important}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if (q('#recoveryShowHelper')) return;
    const reach = q('#maxReachCard');
    if (!reach) return;
    injectStyles();
    const card = document.createElement('div');
    card.id = 'recoveryShowHelper';
    card.className = 'show-helper';
    card.innerHTML = `
      <div class="show-helper-head">
        <div class="show-helper-icon">✨</div>
        <div><strong>Make This Easy</strong><span>I’ll use the best post setup, suggested time, and a caption starter if you haven’t written one yet.</span></div>
      </div>
      <button id="showHelperBtn" class="button primary full" type="button" disabled>Help Me Post This Flyer</button>
      <div id="showHelperResult" class="show-helper-result hidden"></div>`;
    reach.after(card);
    q('#showHelperBtn')?.addEventListener('click', applyPlan);
    refresh();
  }

  function selectedNetworks() {
    const parts = [];
    const ig = q('.platform-chip[data-platform="instagram"] input');
    if (ig?.checked && !ig.disabled) {
      const type = q('input[name="igType"]:checked')?.value || 'post';
      parts.push(`Instagram ${type === 'story' ? 'Story' : type === 'reel' ? 'Reel' : 'Feed'}`);
    }
    const fb = q('.platform-chip[data-platform="facebook"] input');
    if (fb?.checked && !fb.disabled) {
      const type = q('input[name="fbType"]:checked')?.value || 'post';
      parts.push(type === 'reel' ? 'Facebook Reel' : 'Facebook');
    }
    return parts.join(' + ');
  }

  function refresh() {
    const source = q('#applyMaxReachBtn');
    const button = q('#showHelperBtn');
    if (!source || !button) return;
    button.disabled = source.disabled;
  }

  function applyPlan() {
    const source = q('#applyMaxReachBtn');
    const button = q('#showHelperBtn');
    if (!source || source.disabled || !button) return toastSafe('Choose your flyer, photo, or video first.');

    const caption = q('#caption');
    const hadCaption = Boolean(caption?.value.trim());
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Setting it up…';

    try {
      source.click();
      q('#useReachTimeBtn')?.click();
      if (!hadCaption) q('#useReachCaptionBtn')?.click();

      const result = q('#showHelperResult');
      const networks = selectedNetworks() || 'your recommended networks';
      const time = String(q('#reachTimeTitle')?.textContent || '').trim();
      if (result) {
        result.innerHTML = `<strong>Ready.</strong> ${networks}${time ? ` · ${time}` : ''}${hadCaption ? ' · kept your caption' : ' · added a caption starter'}.`;
        result.classList.remove('hidden');
      }
      toastSafe('Your flyer post setup is ready.');
    } finally {
      setTimeout(() => {
        button.textContent = old;
        refresh();
      }, 250);
    }
  }

  function loadComicEnhancer() {
    if (document.querySelector('script[data-comic-blast-enhancer]')) return;
    const enhancer = document.createElement('script');
    enhancer.src = '/comic-blast-enhancer.js';
    enhancer.dataset.comicBlastEnhancer = '1';
    document.body.appendChild(enhancer);
  }

  function loadComicStudio() {
    const existing = document.querySelector('script[data-comic-blast-studio]');
    if (existing) {
      if (document.querySelector('#comicBlastStudio')) loadComicEnhancer();
      else existing.addEventListener('load',loadComicEnhancer,{once:true});
      return;
    }
    const script = document.createElement('script');
    script.src = '/comic-blast-studio.js';
    script.dataset.comicBlastStudio = '1';
    script.addEventListener('load',loadComicEnhancer,{once:true});
    document.body.appendChild(script);
  }

  function boot() {
    injectUi();
    const source = q('#applyMaxReachBtn');
    if (source) new MutationObserver(refresh).observe(source, {attributes:true, attributeFilter:['disabled']});
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Recovery Stage 5';
    loadComicStudio();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
