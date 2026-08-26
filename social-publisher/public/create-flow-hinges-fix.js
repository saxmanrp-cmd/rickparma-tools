// Small Create-page fixes: keep comic generation in place, surface People & Reach,
// and refresh Text Blast before exposing the caption picker.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const PROFILE_KEY = 'socialPublisherPeopleReachV1';
  const TEXT_BLAST_TOKEN_KEY = 'socialPublisherTextBlastToken';
  let comicScrollLockUntil = 0;
  let makeAnchor = null;

  function toastSafe(message) {
    if (typeof window.toast === 'function') window.toast(message);
  }

  function loadProfile() {
    try {
      return {
        market:'', ages:'', interests:'', avoid:'', people:[],
        ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'),
      };
    } catch {
      return {market:'',ages:'',interests:'',avoid:'',people:[]};
    }
  }

  function hasProfile(profile) {
    return Boolean(profile.market || profile.ages || profile.interests || (Array.isArray(profile.people) && profile.people.length));
  }

  function currentInstagramType() {
    return q('input[name="igType"]:checked')?.value || 'post';
  }

  function installScrollGuard() {
    if (document.documentElement.dataset.createHingeScrollGuard === '1') return;
    document.documentElement.dataset.createHingeScrollGuard = '1';

    const nativeScrollTo = window.scrollTo.bind(window);
    try {
      window.scrollTo = (...args) => {
        if (Date.now() < comicScrollLockUntil) {
          let top = null;
          if (typeof args[0] === 'object' && args[0]) top = Number(args[0].top);
          else if (args.length > 1) top = Number(args[1]);
          if (top === 0) return;
        }
        return nativeScrollTo(...args);
      };
    } catch {}

    const nativeScrollIntoView = Element.prototype.scrollIntoView;
    try {
      Element.prototype.scrollIntoView = function(...args) {
        if (Date.now() < comicScrollLockUntil && (this.id === 'dropZone' || this.closest?.('#dropZone'))) return;
        return nativeScrollIntoView.apply(this,args);
      };
    } catch {}

    const oldNavigate = window.navigate;
    if (typeof oldNavigate === 'function' && !oldNavigate.__createHingeGuard) {
      const wrapped = function(view, options) {
        if (Date.now() < comicScrollLockUntil && view === 'create' && q('#view-create')?.classList.contains('active')) return;
        return oldNavigate.call(this,view,options);
      };
      wrapped.__createHingeGuard = true;
      try { window.navigate = wrapped; } catch {}
    }

    const stabilize = () => {
      if (!makeAnchor || Date.now() >= comicScrollLockUntil) return;
      const {element,top} = makeAnchor;
      if (!element?.isConnected) return;
      const currentTop = element.getBoundingClientRect().top;
      const delta = currentTop - top;
      if (Math.abs(delta) > 1) nativeScrollTo({top:window.scrollY + delta,left:0,behavior:'auto'});
    };

    window.addEventListener('click',event => {
      const make = event.target.closest?.('#comicMakeBtn,#comicFullscreenMake');
      if (!make) return;
      comicScrollLockUntil = Date.now() + 2400;
      makeAnchor = {element:q('#comicMakeBtn') || make,top:(q('#comicMakeBtn') || make).getBoundingClientRect().top};
      [0,25,60,120,240,480,800,1200,1800,2300].forEach(delay => setTimeout(stabilize,delay));
    },true);
  }

  function installTextBlastPullGuard() {
    if (document.documentElement.dataset.createHingeTextBlastGuard === '1') return;
    document.documentElement.dataset.createHingeTextBlastGuard = '1';

    window.addEventListener('click',event => {
      const button = event.target.closest?.('#comicCaptionPullBtn');
      if (!button) return;
      const block = q('#comicCaptionBlast');
      const picker = q('#comicCaptionBlastPicker');
      if (!block || !picker) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      let connected = false;
      try { connected = Boolean(localStorage.getItem(TEXT_BLAST_TOKEN_KEY)); } catch {}
      if (!connected) {
        block.classList.remove('is-open');
        toastSafe('Connect Text Blast in Settings first.');
        return;
      }

      if (block.classList.contains('is-open')) {
        block.classList.remove('is-open');
        button.textContent = '💬 Pull From Text Blast';
        return;
      }

      // Do both actions from the one button: refresh the server history first,
      // while exposing the picker immediately so the latest list appears here.
      q('#comicCaptionBlastRefresh')?.click();
      block.classList.add('is-open');
      button.textContent = '💬 Pull From Text Blast';
      try { picker.focus({preventScroll:true}); } catch {}
    },true);
  }

  function audienceSummary(profile) {
    const bits = [];
    if (profile.market) bits.push(profile.market);
    if (profile.ages) bits.push(profile.ages);
    if (profile.interests) bits.push(profile.interests);
    return bits.slice(0,3).join(' · ');
  }

  function ensureAudiencePanel() {
    const helper = q('#stage15HelperGroup');
    if (!helper) return false;
    const profile = loadProfile();
    let panel = q('#peopleReachCreatePanel');

    if (!hasProfile(profile)) {
      panel?.remove();
      return true;
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'peopleReachCreatePanel';
      panel.className = 'people-reach-create-panel';
      const title = q('.stage15-section-title',helper);
      if (title?.nextSibling) helper.insertBefore(panel,title.nextSibling);
      else helper.prepend(panel);
    }

    const people = Array.isArray(profile.people) ? profile.people : [];
    const igType = currentInstagramType();
    const signature = JSON.stringify({market:profile.market,ages:profile.ages,interests:profile.interests,people:people.map(p=>[p.name,p.handle,p.action]),igType});
    if (panel.dataset.signature !== signature) {
      panel.dataset.signature = signature;
      const chips = people.slice(0,5).map(person => `<span class="people-reach-create-chip">@${String(person.handle || '').replace(/^@/,'')}</span>`).join('');
      const storyNote = igType === 'story' && people.length
        ? '<div class="people-reach-create-note">Instagram Story is selected. Your audience still guides Help Me, but profile tags and collaborators can only be applied when you choose Post or Reel.</div>'
        : '<div class="people-reach-create-note">Your saved audience is active and is used by Help Me automatically.</div>';
      panel.innerHTML = `
        <div class="people-reach-create-head"><strong>🎯 Audience & People</strong><span>ACTIVE</span></div>
        <div class="people-reach-create-summary">${audienceSummary(profile) || 'Audience profile saved'}</div>
        ${chips ? `<div class="people-reach-create-chips">${chips}</div>` : ''}
        ${storyNote}`;
    }

    const suggestions = q('#smartPeopleSuggestions');
    if (suggestions && suggestions.parentElement !== panel) panel.appendChild(suggestions);

    const more = q('#easyMoreOptions');
    if (people.length && igType !== 'story' && more) more.open = true;
    return true;
  }

  function injectStyles() {
    if (q('#createFlowHingesStyles')) return;
    const style = document.createElement('style');
    style.id = 'createFlowHingesStyles';
    style.textContent = `
      body.recovery-easy #peopleReachCreatePanel{margin:7px 0 10px;padding:11px;border-radius:13px;background:#0a1018;border:1px solid rgba(145,116,255,.24)}
      body.recovery-easy .people-reach-create-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      body.recovery-easy .people-reach-create-head strong{font-size:15px;color:#f2efff}
      body.recovery-easy .people-reach-create-head span{font-size:10px;font-weight:900;letter-spacing:.06em;color:#a997ff}
      body.recovery-easy .people-reach-create-summary{margin-top:5px;color:#c4ccda;font-size:13px;line-height:1.4}
      body.recovery-easy .people-reach-create-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      body.recovery-easy .people-reach-create-chip{padding:5px 8px;border-radius:999px;background:#171d2a;color:#e9e5ff;font-size:12px;font-weight:800}
      body.recovery-easy .people-reach-create-note{margin-top:8px;color:#94a1b3;font-size:12px;line-height:1.4}
      body.recovery-easy #peopleReachCreatePanel #smartPeopleSuggestions{margin-top:9px}
    `;
    document.head.appendChild(style);
  }

  function scheduleAudienceRefresh() {
    requestAnimationFrame(ensureAudiencePanel);
    setTimeout(ensureAudiencePanel,80);
    setTimeout(ensureAudiencePanel,350);
  }

  function boot() {
    injectStyles();
    installScrollGuard();
    installTextBlastPullGuard();
    scheduleAudienceRefresh();

    document.addEventListener('change',event => {
      if (event.target?.matches?.('input[name="igType"],.platform-chip[data-platform="instagram"] input')) scheduleAudienceRefresh();
    },true);
    document.addEventListener('click',event => {
      if (event.target.closest?.('#prSaveAudience,#prAddPerson,[data-pr-remove],#applyMaxReachBtn,#showHelperBtn')) scheduleAudienceRefresh();
    },true);

    const create = q('#view-create');
    if (create) new MutationObserver(scheduleAudienceRefresh).observe(create,{childList:true,subtree:true});
    [120,400,900,1600].forEach(delay => setTimeout(scheduleAudienceRefresh,delay));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
