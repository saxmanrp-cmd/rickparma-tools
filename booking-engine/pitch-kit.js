(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const DEFAULTS = {
    website: 'https://rickparma.com/',
    epk: '',
    soloPromo: 'https://www.youtube.com/watch?v=A7bKax1LS_g',
    compilation: 'https://www.youtube.com/watch?v=ePFoNTC85XY',
    fullBandPromo: 'https://www.youtube.com/watch?v=6WmPyq6eoRk'
  };

  const LABELS = {
    website: 'Website',
    epk: 'EPK',
    soloPromo: 'Short Promo',
    compilation: 'Compilation',
    fullBandPromo: 'Full Band Promo'
  };

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function kit() {
    const state = readState();
    return { ...DEFAULTS, ...(state.pitchKit || {}) };
  }

  function saveKit(next) {
    const state = readState();
    state.pitchKit = { ...kit(), ...next };
    writeState(state);
  }

  function typeFor(contact) {
    if (contact?.Lane === 'Agency / Promoter') return 'agent';
    if (contact?.Lane === 'Strategic Buyer') return 'buyer';
    return 'room';
  }

  function selectedAssets(contact) {
    const k = kit();
    const type = typeFor(contact);
    const ordered = type === 'agent'
      ? ['epk', 'fullBandPromo', 'soloPromo', 'website']
      : type === 'buyer'
        ? ['epk', 'soloPromo', 'compilation', 'website']
        : ['epk', 'soloPromo', 'website'];
    const seen = new Set();
    return ordered
      .map(key => ({ key, label: LABELS[key], url: k[key] }))
      .filter(item => item.url && !seen.has(item.url) && seen.add(item.url))
      .slice(0, 3);
  }

  function textBlock(contact) {
    return selectedAssets(contact).map(a => `${a.label}: ${a.url}`).join('\n');
  }

  function injectSettings() {
    const settings = document.querySelector('[data-view="settings"]');
    if (!settings || settings.querySelector('[data-pitch-kit]')) return;
    const k = kit();
    const card = document.createElement('div');
    card.className = 'settings-card';
    card.dataset.pitchKit = 'true';
    card.innerHTML = `
      <h3>Pitch Kit</h3>
      <p>The app will choose the best media for each campaign type. Your existing RickParma.com promo videos are preloaded.</p>
      <label>Main website<input id="kitWebsite" type="url" value="${escapeHtml(k.website)}"></label>
      <label>General EPK <span style="font-weight:500">(optional)</span><input id="kitEpk" type="url" value="${escapeHtml(k.epk)}" placeholder="Add later if you create a dedicated EPK"></label>
      <label>Solo / Short Promo<input id="kitSolo" type="url" value="${escapeHtml(k.soloPromo)}"></label>
      <label>Compilation<input id="kitCompilation" type="url" value="${escapeHtml(k.compilation)}"></label>
      <label>Full Band Promo<input id="kitBand" type="url" value="${escapeHtml(k.fullBandPromo)}"></label>
      <div class="pitch-kit-rule">
        <strong>Room pitch</strong><span>Short Promo → Website</span>
        <strong>Buyer pitch</strong><span>Short Promo → Compilation → Website</span>
        <strong>Agency pitch</strong><span>Full Band → Short Promo → Website</span>
      </div>
      <button class="primary" id="savePitchKit">Save Pitch Kit</button>`;

    const senderCard = settings.querySelector('[data-sender-policy]');
    if (senderCard) senderCard.after(card);
    else settings.appendChild(card);

    card.querySelector('#savePitchKit')?.addEventListener('click', () => {
      saveKit({
        website: card.querySelector('#kitWebsite')?.value.trim() || DEFAULTS.website,
        epk: card.querySelector('#kitEpk')?.value.trim() || '',
        soloPromo: card.querySelector('#kitSolo')?.value.trim() || DEFAULTS.soloPromo,
        compilation: card.querySelector('#kitCompilation')?.value.trim() || DEFAULTS.compilation,
        fullBandPromo: card.querySelector('#kitBand')?.value.trim() || DEFAULTS.fullBandPromo
      });
      toast('Pitch kit saved');
      decorateCampaigns(true);
    });
  }

  function contactById(id) {
    return window.BOOKING_DATA?.contacts?.find(c => c['Contact ID'] === id) || null;
  }

  function decorateCampaigns(force = false) {
    document.querySelectorAll('[data-view="campaigns"] [data-campaign-id]').forEach(card => {
      const id = card.dataset.campaignId;
      const c = contactById(id);
      if (!c) return;
      if (force) card.querySelector('[data-materials-hint]')?.remove();
      if (card.querySelector('[data-materials-hint]')) return;
      const assets = selectedAssets(c);
      if (!assets.length) return;
      const hint = document.createElement('div');
      hint.className = 'materials-hint';
      hint.dataset.materialsHint = 'true';
      hint.innerHTML = `<span>Suggested media:</span> ${assets.map(a => `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.label)}</a>`).join(' · ')}`;
      const controls = card.querySelector('.campaign-controls');
      if (controls) controls.before(hint); else card.appendChild(hint);
    });
  }

  function decoratePreview() {
    document.querySelectorAll('.campaign-preview').forEach(preview => {
      if (preview.querySelector('[data-preview-materials]')) return;
      const title = preview.querySelector('h2')?.textContent?.trim();
      if (!title) return;
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const target = norm(title);
      const c = window.BOOKING_DATA?.contacts?.find(x => norm(x.Entity) === target)
        || window.BOOKING_DATA?.contacts?.find(x => target.includes(norm(x.Entity)) || norm(x.Entity).includes(target));
      if (!c) return;
      const assets = selectedAssets(c);
      if (!assets.length) return;
      const box = document.createElement('div');
      box.className = 'preview-materials';
      box.dataset.previewMaterials = 'true';
      box.innerHTML = `<strong>Suggested materials</strong>${assets.map(a => `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.label)} ↗</a>`).join('')}`;
      const copy = preview.querySelector('.campaign-copy');
      if (copy) copy.before(box); else preview.appendChild(box);
    });
  }

  function escapeHtml(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1700);
  }

  function injectStyles() {
    if (document.querySelector('#pitch-kit-styles')) return;
    const style = document.createElement('style');
    style.id = 'pitch-kit-styles';
    style.textContent = `
      .pitch-kit-rule{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;padding:13px;margin:2px 0 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2);font-size:12px}.pitch-kit-rule span{color:var(--muted)}.materials-hint{margin-top:12px;padding:9px 11px;border-radius:11px;background:rgba(120,167,255,.07);border:1px solid rgba(120,167,255,.18);font-size:11px;color:var(--muted)}.materials-hint span{font-weight:800;color:#c9d9f7}.materials-hint a{color:var(--accent);text-decoration:none}.preview-materials{display:grid;gap:7px;padding:12px;margin:12px 0;border:1px solid var(--line);border-radius:13px;background:var(--surface)}.preview-materials strong{font-size:12px}.preview-materials a{color:var(--accent);font-size:12px;text-decoration:none}`;
    document.head.appendChild(style);
  }

  window.BookingPitchKit = { kit, selectedAssets, textBlock };

  injectStyles();
  const observer = new MutationObserver(() => {
    injectSettings();
    decorateCampaigns();
    decoratePreview();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => {
    injectSettings();
    decorateCampaigns();
    decoratePreview();
  });
  setTimeout(() => {
    injectSettings();
    decorateCampaigns();
    decoratePreview();
  }, 0);
})();
