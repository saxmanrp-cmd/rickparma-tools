// Create-flow cleanup: remove redundant generated preview, add All Sizes default, and simplify Text Blast caption controls.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const TOKEN_KEY = 'socialPublisherTextBlastToken';
  let templateCache = [];
  let formatMode = 'all';
  let restoringScroll = false;

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function hasTextBlastToken() {
    try { return Boolean(localStorage.getItem(TOKEN_KEY)); } catch { return false; }
  }

  function injectStyles() {
    if (q('#createFlowControlsV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'createFlowControlsV2Styles';
    style.textContent = `
      body.recovery-easy #comicFormatPicker{display:none!important}
      body.recovery-easy #comicFormatAllPicker{width:100%;min-height:50px;padding:0 12px;border:1px solid rgba(255,255,255,.13);background:#0a1018;color:#fff;border-radius:13px;font-size:16px;box-sizing:border-box}

      body.recovery-easy #comicCaptionBlastConnect,
      body.recovery-easy #comicCaptionBlastStatus,
      body.recovery-easy #comicCaptionBlastReady>div{display:none!important}
      body.recovery-easy #comicCaptionBlast:not(.is-open) #comicCaptionBlastReady{display:none!important}
      body.recovery-easy #comicCaptionBlast.is-open #comicCaptionBlastReady{display:block!important}
      body.recovery-easy #comicCaptionBlast.is-open #comicCaptionBlastPicker{display:block!important;width:100%!important}
      body.recovery-easy #comicCaptionBlast.is-open #comicCaptionPullBtn{margin-bottom:8px!important}

      body.recovery-easy.create-clean-generated #dropZone.stage15-compact-media,
      body.recovery-easy.create-clean-generated #dropZone,
      body.recovery-easy.create-clean-generated #mediaPreview,
      body.recovery-easy.create-clean-generated #mediaActions{display:none!important}

      body.recovery-easy #textBlastSettingsCard .create-flow-settings-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      body.recovery-easy #textBlastSettingsCard .create-flow-settings-actions .full-row{grid-column:1/-1}
      body.recovery-easy #textBlastSettingsCard input{width:100%;min-height:46px;border-radius:11px;border:1px solid rgba(255,255,255,.13);background:#080e16;color:#fff;padding:0 11px;font-size:16px;box-sizing:border-box;margin-top:10px}
      body.recovery-easy #textBlastSettingsCard .create-flow-settings-status{display:block;margin-top:5px;color:#9da8b8;font-size:13px;line-height:1.35}
      @media(max-width:430px){body.recovery-easy #textBlastSettingsCard .create-flow-settings-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function loadTemplates() {
    try {
      const response = await fetch('/api/comic-templates',{cache:'no-store'});
      const data = await response.json().catch(() => ({}));
      if (response.ok) templateCache = Array.isArray(data.templates) ? data.templates : [];
    } catch {}
    return templateCache;
  }

  async function populateAllScenes(keepCurrent=true) {
    const scene = q('#comicScenePicker');
    const category = q('#comicCategoryPicker')?.value || '';
    if (!scene || !category || formatMode !== 'all') return;
    if (!templateCache.length) await loadTemplates();

    const items = templateCache.filter(template =>
      (template.category || 'Rick Parma Comics') === category &&
      ['story','feed','unknown'].includes(template.format || 'unknown')
    );

    const prior = keepCurrent ? scene.value : '';
    scene.replaceChildren();

    if (!items.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No backgrounds in this category';
      scene.appendChild(option);
      scene.disabled = true;
      return;
    }

    scene.disabled = false;
    for (const template of items) {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name || template.id;
      scene.appendChild(option);
    }

    if (prior && items.some(template => template.id === prior)) scene.value = prior;
    else scene.value = items[0].id;

    scene.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function installAllSizesPicker() {
    const original = q('#comicFormatPicker');
    if (!original || q('#comicFormatAllPicker')) return Boolean(q('#comicFormatAllPicker'));

    const proxy = document.createElement('select');
    proxy.id = 'comicFormatAllPicker';
    proxy.className = original.className || 'comic-select';
    proxy.innerHTML = `
      <option value="all">All Sizes</option>
      <option value="story">9:16 Story · Vertical</option>
      <option value="feed">4:5 Feed · Vertical</option>`;
    proxy.value = 'all';
    original.after(proxy);

    proxy.addEventListener('change',async () => {
      formatMode = proxy.value;
      if (formatMode === 'all') {
        await populateAllScenes(true);
        return;
      }
      original.value = formatMode;
      original.dispatchEvent(new Event('change',{bubbles:true}));
    });

    q('#comicCategoryPicker')?.addEventListener('change',() => {
      if (formatMode === 'all') setTimeout(() => populateAllScenes(false),20);
    });

    q('#comicScenePicker')?.addEventListener('change',() => {
      if (formatMode === 'all') proxy.value = 'all';
    });

    formatMode = 'all';
    setTimeout(() => populateAllScenes(true),30);
    return true;
  }

  function openTextBlastPicker() {
    const block = q('#comicCaptionBlast');
    const picker = q('#comicCaptionBlastPicker');
    const button = q('#comicCaptionPullBtn');
    if (!block || !picker || !button) return;

    if (!hasTextBlastToken()) {
      block.classList.remove('is-open');
      button.textContent = '💬 Pull From Text Blast';
      toastSafe('Connect Text Blast in Settings first.');
      return;
    }

    block.classList.add('is-open');
    button.textContent = '💬 Pull From Text Blast';
    requestAnimationFrame(() => {
      try {
        if (typeof picker.showPicker === 'function') picker.showPicker();
        else picker.focus({preventScroll:true});
      } catch {
        try { picker.focus({preventScroll:true}); } catch {}
      }
    });
  }

  function installTextBlastCaptionBehavior() {
    const button = q('#comicCaptionPullBtn');
    const picker = q('#comicCaptionBlastPicker');
    if (!button || !picker || button.dataset.createFlowV2 === '1') return Boolean(button && picker);
    button.dataset.createFlowV2 = '1';
    button.textContent = '💬 Pull From Text Blast';

    document.addEventListener('click',event => {
      const target = event.target.closest?.('#comicCaptionPullBtn');
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openTextBlastPicker();
    },true);

    picker.addEventListener('change',() => {
      q('#comicCaptionBlast')?.classList.remove('is-open');
      button.textContent = '💬 Pull From Text Blast';
    });
    return true;
  }

  function syncSettingsCard() {
    const card = q('#textBlastSettingsCard');
    if (!card) return;
    const connected = hasTextBlastToken();
    const input = q('#textBlastSettingsPassword',card);
    const connect = q('#textBlastSettingsConnect',card);
    const refresh = q('#textBlastSettingsRefresh',card);
    const disconnect = q('#textBlastSettingsDisconnect',card);
    const status = q('#textBlastSettingsStatus',card);
    if (input) input.classList.toggle('hidden',connected);
    if (connect) connect.classList.toggle('hidden',connected);
    if (refresh) refresh.classList.toggle('hidden',!connected);
    if (disconnect) disconnect.classList.toggle('hidden',!connected);
    if (status) status.textContent = connected ? 'Connected. Recent Text Blasts are available from the Caption section.' : 'Connect once here, then the Caption button will open your recent Text Blasts.';
  }

  function installTextBlastSettings() {
    const settings = q('#view-settings');
    if (!settings) return false;
    let card = q('#textBlastSettingsCard');
    if (!card) {
      card = document.createElement('div');
      card.id = 'textBlastSettingsCard';
      card.className = 'card account-card';
      card.innerHTML = `
        <div class="account-heading"><div class="meta-mark">💬</div><div><strong>Text Blast</strong><span id="textBlastSettingsStatus" class="create-flow-settings-status"></span></div></div>
        <input id="textBlastSettingsPassword" type="password" autocomplete="current-password" placeholder="Text Blast admin password" />
        <div class="create-flow-settings-actions">
          <button id="textBlastSettingsConnect" class="button primary full full-row" type="button">Connect Text Blast</button>
          <button id="textBlastSettingsRefresh" class="button secondary full" type="button">Refresh</button>
          <button id="textBlastSettingsDisconnect" class="button secondary full" type="button">Disconnect</button>
        </div>`;
      const installCard = q('#installCard',settings);
      if (installCard) settings.insertBefore(card,installCard);
      else settings.appendChild(card);

      q('#textBlastSettingsConnect',card)?.addEventListener('click',() => {
        const input = q('#textBlastSettingsPassword',card);
        const password = String(input?.value || '').trim();
        if (!password) return toastSafe('Enter your Text Blast admin password.');
        const hiddenInput = q('#comicCaptionBlastPassword');
        const hiddenConnect = q('#comicCaptionBlastConnectBtn');
        if (!hiddenInput || !hiddenConnect) return toastSafe('Text Blast controls are still loading. Try again in a moment.');
        hiddenInput.value = password;
        hiddenConnect.click();
        if (input) input.value = '';
        setTimeout(syncSettingsCard,350);
        setTimeout(syncSettingsCard,900);
      });

      q('#textBlastSettingsRefresh',card)?.addEventListener('click',() => {
        const hidden = q('#comicCaptionBlastRefresh');
        if (hidden) hidden.click();
        else toastSafe('Text Blast controls are still loading.');
      });

      q('#textBlastSettingsDisconnect',card)?.addEventListener('click',() => {
        const hidden = q('#comicCaptionBlastDisconnect');
        if (hidden) hidden.click();
        else {
          try { localStorage.removeItem(TOKEN_KEY); } catch {}
        }
        q('#comicCaptionBlast')?.classList.remove('is-open');
        setTimeout(syncSettingsCard,30);
      });
    }
    syncSettingsCard();
    return true;
  }

  function restoreScrollPosition(y) {
    if (restoringScroll) return;
    restoringScroll = true;
    const delays = [0,60,140,280,520,900,1300];
    for (const delay of delays) {
      setTimeout(() => {
        window.scrollTo({top:y,left:0,behavior:'auto'});
        if (delay === delays[delays.length-1]) restoringScroll = false;
      },delay);
    }
  }

  function installGeneratedPreviewGuard() {
    if (document.documentElement.dataset.createFlowGeneratedGuard === '1') return;
    document.documentElement.dataset.createFlowGeneratedGuard = '1';

    document.addEventListener('click',event => {
      const make = event.target.closest?.('#comicMakeBtn');
      if (make) {
        const bubbleText = String(q('#comicBubbleText')?.innerText || q('#comicMessage')?.value || '').trim();
        const sceneId = q('#comicScenePicker')?.value || '';
        if (!bubbleText || !sceneId) return;
        const y = window.scrollY;
        document.body.classList.add('create-clean-generated');
        restoreScrollPosition(y);
        return;
      }

      if (event.target.closest?.('#stage15UploadMediaBtn,#removeMediaBtn,#changeMediaBtn')) {
        document.body.classList.remove('create-clean-generated');
      }
    },true);

    q('#mediaInput')?.addEventListener('change',() => document.body.classList.remove('create-clean-generated'));
  }

  function apply() {
    injectStyles();
    installGeneratedPreviewGuard();
    installAllSizesPicker();
    installTextBlastCaptionBehavior();
    installTextBlastSettings();
  }

  function boot() {
    apply();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      apply();
      if (tries > 40 || (q('#comicFormatAllPicker') && q('#comicCaptionPullBtn') && q('#textBlastSettingsCard'))) clearInterval(timer);
    },150);

    const create = q('#view-create');
    if (create) new MutationObserver(() => apply()).observe(create,{childList:true,subtree:true});
    q('.nav-item[data-view="settings"]')?.addEventListener('click',() => setTimeout(syncSettingsCard,50));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
