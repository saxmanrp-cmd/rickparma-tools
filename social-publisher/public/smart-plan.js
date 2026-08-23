// v0.7.5 Smart Plan composes Max Reach and Performance Learning into one action.
(() => {
  const q = selector => document.querySelector(selector);

  function injectStyles() {
    if (q('#smartPlanStyles')) return;
    const style = document.createElement('style');
    style.id = 'smartPlanStyles';
    style.textContent = `
      .smart-plan-block{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}
      .smart-plan-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .smart-plan-head strong{font-size:13px}.smart-plan-head span{display:block;margin-top:3px;color:var(--muted);font-size:10px;line-height:1.4}
      .smart-plan-badge{flex:0 0 auto;border:1px solid #4d4271;background:#241f39;color:#cfc4ff;border-radius:999px;padding:4px 7px;font-size:8px;font-weight:900;letter-spacing:.05em;white-space:nowrap}
      .smart-plan-button{background:linear-gradient(135deg,#6557dc,#9b7aff)!important;box-shadow:0 10px 26px rgba(124,92,255,.22)}
      .smart-plan-result{border-radius:11px;background:#0c1017;padding:9px 10px;color:#adb6c5;font-size:10px;line-height:1.45}
      .smart-plan-result strong{color:#f1efff}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    injectStyles();
    const applyButton = q('#applyMaxReachBtn');
    if (!applyButton || q('#smartPlanBlock')) return;
    const block = document.createElement('div');
    block.id = 'smartPlanBlock';
    block.className = 'smart-plan-block';
    block.innerHTML = `
      <div class="smart-plan-head">
        <div><strong>Smart Plan</strong><span>One tap applies the strongest network mix, timing recommendation and a caption starter. Existing caption text is never overwritten.</span></div>
        <b id="smartPlanBadge" class="smart-plan-badge">AUTOPILOT</b>
      </div>
      <button id="smartPlanBtn" class="button primary full smart-plan-button" type="button" disabled>Build My Smart Plan</button>
      <div id="smartPlanResult" class="smart-plan-result hidden"></div>
    `;
    applyButton.parentNode.insertBefore(block, applyButton);
    q('#smartPlanBtn')?.addEventListener('click', applySmartPlan);
    refreshSmartPlanState();
  }

  function isPersonalized() {
    return String(q('#reachPersonalizedSummary')?.textContent || '').trim().startsWith('PERSONALIZED');
  }

  function refreshSmartPlanState() {
    const source = q('#applyMaxReachBtn');
    const button = q('#smartPlanBtn');
    if (!source || !button) return;
    button.disabled = source.disabled;
    const personalized = isPersonalized();
    button.textContent = personalized ? 'Build My Personalized Plan' : 'Build My Smart Plan';
    const badge = q('#smartPlanBadge');
    if (badge) badge.textContent = personalized ? 'PERSONALIZED' : 'AUTOPILOT';
  }

  function platformSummary() {
    const parts = [];
    const ig = q('.platform-chip[data-platform="instagram"] input');
    if (ig?.checked && !ig.disabled) {
      const type = q('input[name="igType"]:checked')?.value || 'post';
      parts.push(`Instagram ${type[0].toUpperCase()}${type.slice(1)}`);
    }
    const fb = q('.platform-chip[data-platform="facebook"] input');
    if (fb?.checked && !fb.disabled) {
      const type = q('input[name="fbType"]:checked')?.value || 'post';
      parts.push(type === 'reel' ? 'Facebook Reel' : 'Facebook');
    }
    for (const platform of ['threads','tiktok']) {
      const input = q(`.platform-chip[data-platform="${platform}"] input`);
      if (input?.checked && !input.disabled) parts.push(platform === 'threads' ? 'Threads' : 'TikTok');
    }
    return parts.join(' + ');
  }

  function applySmartPlan() {
    const source = q('#applyMaxReachBtn');
    const button = q('#smartPlanBtn');
    if (!source || source.disabled || !button) return toast('Add a photo or video first.');

    const hadCaption = Boolean(q('#caption')?.value.trim());
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Building plan…';

    try {
      source.click();
      q('#useReachTimeBtn')?.click();
      if (!hadCaption) q('#useReachCaptionBtn')?.click();

      const networks = platformSummary() || 'Recommended networks';
      const time = String(q('#reachTimeTitle')?.textContent || '').trim();
      const result = q('#smartPlanResult');
      if (result) {
        const captionNote = hadCaption ? 'your caption kept' : 'caption starter added';
        result.innerHTML = `<strong>Plan applied.</strong> ${networks}${time ? ` · ${time}` : ''} · ${captionNote}.`;
        result.classList.remove('hidden');
      }
      toast(isPersonalized() ? 'Personalized Smart Plan applied.' : 'Smart Plan applied.');
    } finally {
      setTimeout(() => {
        button.textContent = oldText;
        refreshSmartPlanState();
      }, 250);
    }
  }

  function watchRecommendationState() {
    const source = q('#applyMaxReachBtn');
    const personalized = q('#reachPersonalizedSummary');
    if (source) new MutationObserver(refreshSmartPlanState).observe(source, { attributes:true, attributeFilter:['disabled'] });
    if (personalized) new MutationObserver(refreshSmartPlanState).observe(personalized, { childList:true, subtree:true, characterData:true });
  }

  function loadScript(src, dataKey, afterLoad) {
    const selector = `script[data-${dataKey}]`;
    const existing = document.querySelector(selector);
    if (existing) {
      if (afterLoad) setTimeout(afterLoad,0);
      return existing;
    }
    const script = document.createElement('script');
    script.src = src;
    script.dataset[dataKey.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = 'true';
    if (afterLoad) script.addEventListener('load', afterLoad, { once:true });
    document.body.appendChild(script);
    return script;
  }

  function stampVersion() {
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.5';
  }

  injectUi();
  watchRecommendationState();
  setInterval(refreshSmartPlanState, 1500);
  stampVersion();

  loadScript('/content-coach.js','content-coach');
  loadScript('/weekly-planner.js','weekly-planner');
  loadScript('/gig-campaign.js','gig-campaign', () => {
    loadScript('/calendar-sync.js','calendar-sync', () => {
      loadScript('/easy-mode.js','easy-mode', stampVersion);
    });
  });
})();
