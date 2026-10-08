(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const RELATIONSHIPS = ['Cold', 'Familiar', 'Know Them', 'Worked Together', 'Current Booker'];

  const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const today = () => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function contactByEntity(name) {
    const data = window.BOOKING_DATA;
    if (!data?.contacts?.length || !name) return null;
    const target = norm(name);
    return data.contacts.find(c => norm(c.Entity) === target)
      || data.contacts.find(c => target.includes(norm(c.Entity)) || norm(c.Entity).includes(target))
      || null;
  }

  function currentDetailContact() {
    const title = document.querySelector('#detailTitle')?.textContent?.trim();
    return contactByEntity(title);
  }

  function typeFor(c) {
    if (c?.Lane === 'Agency / Promoter') return 'agent';
    if (c?.Lane === 'Strategic Buyer') return 'buyer';
    return 'room';
  }

  function campaignLabel(type) {
    return type === 'agent' ? 'Agency / Promoter' : type === 'buyer' ? 'Buyer Relationship' : 'Room Campaign';
  }

  function getMergedContact(c) {
    const state = readState();
    return { ...c, ...(state.overrides?.[c['Contact ID']] || {}) };
  }

  function campaignBlocked(c) {
    const merged = getMergedContact(c);
    if (merged['Automation Safe?'] === 'NO') return 'This contact is marked Do Not Pitch.';
    if (merged['Current Venue']) return 'Already performing here.';
    if (['Booked', 'Pass', 'Do not contact'].includes(merged.Status)) return `Status is ${merged.Status}.`;
    const state = readState();
    const pref = state.contactPrefs?.[c['Contact ID']];
    if (pref === 'SKIP') return 'This room is skipped.';
    if (pref === 'PERFORMING') return 'Already performing here.';
    return '';
  }

  function startCampaign(c) {
    const blocked = campaignBlocked(c);
    if (blocked) return toast(blocked);
    const state = readState();
    state.campaigns ||= {};
    const existing = state.campaigns[c['Contact ID']];
    if (existing?.active && !existing?.paused) return toast('Campaign is already active');
    state.campaigns[c['Contact ID']] = {
      active: true,
      paused: false,
      type: typeFor(c),
      startedOn: today(),
      step: existing?.step || 0,
      completed: existing?.completed || [],
      lastAction: existing?.lastAction || null,
      lastActionDate: existing?.lastActionDate || null
    };
    writeState(state);
    toast('Campaign started');
    refreshDetail();
  }

  function togglePause(c) {
    const state = readState();
    const campaign = state.campaigns?.[c['Contact ID']];
    if (!campaign) return;
    if (campaign.active === false) campaign.active = true;
    campaign.paused = !campaign.paused;
    writeState(state);
    toast(campaign.paused ? 'Campaign paused' : 'Campaign resumed');
    refreshDetail();
  }

  function restartCampaign(c) {
    const state = readState();
    state.campaigns ||= {};
    state.campaigns[c['Contact ID']] = {
      active: true,
      paused: false,
      type: typeFor(c),
      startedOn: today(),
      step: 0,
      completed: state.campaigns[c['Contact ID']]?.completed || [],
      lastAction: null,
      lastActionDate: null
    };
    state.overrides ||= {};
    const old = state.overrides[c['Contact ID']] || {};
    state.overrides[c['Contact ID']] = { ...old, 'Next Follow-up': null };
    writeState(state);
    toast('Campaign restarted');
    refreshDetail();
  }

  function saveRelationship(c, relationship) {
    const state = readState();
    state.relationships ||= {};
    state.relationships[c['Contact ID']] = relationship;
    writeState(state);
    toast('Relationship saved');
    refreshDetail();
  }

  function saveTextOk(c, enabled) {
    const state = readState();
    state.textOk ||= {};
    state.textOk[c['Contact ID']] = !!enabled;
    writeState(state);
    toast(enabled ? 'Texting marked OK' : 'Texting disabled');
    refreshDetail();
  }

  function historyMarkup(c) {
    const state = readState();
    const campaign = state.campaigns?.[c['Contact ID']];
    const entries = [...(campaign?.completed || [])].reverse();
    if (!entries.length) return '<div class="campaign-history-empty">No campaign activity yet.</div>';
    return entries.map(item => `
      <div class="campaign-history-row">
        <span>${escapeHtml(item.date || '')}</span>
        <strong>${escapeHtml(item.action || 'Outreach')}</strong>
      </div>`).join('');
  }

  function detailSignature(c, state, campaign, relationship, textOk, blocked, status) {
    return JSON.stringify({
      id: c['Contact ID'],
      relationship,
      textOk,
      blocked,
      status,
      active: !!campaign?.active,
      paused: !!campaign?.paused,
      step: campaign?.step ?? null,
      completed: campaign?.completed?.length || 0,
      mergedStatus: state.overrides?.[c['Contact ID']]?.Status || c.Status || ''
    });
  }

  function decorateDetail() {
    const modal = document.querySelector('#detailModal.open');
    const host = document.querySelector('#detailContent');
    if (!modal || !host) return;
    const c = currentDetailContact();
    if (!c) return;

    const state = readState();
    const campaign = state.campaigns?.[c['Contact ID']];
    const relationship = state.relationships?.[c['Contact ID']] || 'Cold';
    const textOk = !!state.textOk?.[c['Contact ID']];
    const blocked = campaignBlocked(c);
    const status = campaign
      ? campaign.paused ? 'Paused'
      : campaign.active ? 'Active'
      : 'Stopped'
      : 'Not started';
    const signature = detailSignature(c, state, campaign, relationship, textOk, blocked, status);
    const existing = host.querySelector('[data-campaign-crm-controls]');
    if (existing?.dataset.contactId === c['Contact ID'] && existing.dataset.signature === signature) return;
    existing?.remove();

    const buttonLabel = !campaign ? 'Start Campaign' : campaign.active && !campaign.paused ? 'Pause Campaign' : campaign.paused ? 'Resume Campaign' : 'Restart Campaign';
    const section = document.createElement('div');
    section.className = 'detail-section campaign-detail-section';
    section.dataset.campaignCrmControls = 'true';
    section.dataset.contactId = c['Contact ID'];
    section.dataset.signature = signature;
    section.innerHTML = `
      <h3>Campaign & Relationship</h3>
      <div class="campaign-detail-grid">
        <label>Relationship
          <select data-detail-relationship>${RELATIONSHIPS.map(r => `<option ${r === relationship ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select>
        </label>
        <label class="campaign-detail-check"><input type="checkbox" data-detail-textok ${textOk ? 'checked' : ''}><span>Text OK</span></label>
      </div>
      <div class="campaign-detail-status">
        <div><span>Campaign</span><strong>${escapeHtml(campaignLabel(typeFor(c)))}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(status)}</strong></div>
      </div>
      ${blocked ? `<div class="campaign-detail-blocked">${escapeHtml(blocked)}</div>` : ''}
      <div class="campaign-detail-actions">
        <button class="${campaign?.active && !campaign?.paused ? 'secondary' : 'primary'}" data-detail-campaign-action ${blocked && !campaign ? 'disabled' : ''}>${escapeHtml(buttonLabel)}</button>
        <button class="secondary" data-open-campaigns>Open Campaigns</button>
      </div>
      <div class="campaign-history-wrap"><strong>History</strong>${historyMarkup(c)}</div>`;

    const actions = host.querySelector('.detail-actions');
    if (actions) actions.before(section); else host.appendChild(section);

    section.querySelector('[data-detail-relationship]')?.addEventListener('change', e => saveRelationship(c, e.target.value));
    section.querySelector('[data-detail-textok]')?.addEventListener('change', e => saveTextOk(c, e.target.checked));
    section.querySelector('[data-detail-campaign-action]')?.addEventListener('click', () => {
      const latest = readState().campaigns?.[c['Contact ID']];
      if (!latest) startCampaign(c);
      else if (latest.active && !latest.paused) togglePause(c);
      else if (latest.paused) togglePause(c);
      else restartCampaign(c);
    });
    section.querySelector('[data-open-campaigns]')?.addEventListener('click', () => {
      document.querySelector('[data-close-modal="detailModal"]')?.click();
      document.querySelector('[data-nav="campaigns"]')?.click();
    });
  }

  function refreshDetail() {
    setTimeout(decorateDetail, 20);
  }

  function decorateCampaignCards() {
    document.querySelectorAll('[data-view="campaigns"] .campaign-card').forEach(card => {
      const id = card.dataset.campaignId;
      if (!id) return;
      const c = window.BOOKING_DATA?.contacts?.find(x => x['Contact ID'] === id);
      if (!c) return;
      const campaign = readState().campaigns?.[id];
      if (!campaign) return;
      const actions = card.querySelector('.campaign-actions');
      if (!actions) return;
      let btn = card.querySelector('[data-addon-pause]');
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'secondary';
        btn.dataset.addonPause = id;
        btn.addEventListener('click', () => togglePause(c));
        actions.appendChild(btn);
      }
      const paused = !!campaign.paused;
      if (btn.textContent !== (paused ? 'Resume' : 'Pause')) btn.textContent = paused ? 'Resume' : 'Pause';
      card.classList.toggle('campaign-paused', paused);
      card.querySelectorAll('[data-action-id],[data-done-id]').forEach(el => { el.disabled = paused; });
    });
  }

  function escapeHtml(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function injectStyles() {
    if (document.querySelector('#campaign-crm-controls-styles')) return;
    const style = document.createElement('style');
    style.id = 'campaign-crm-controls-styles';
    style.textContent = `
      .campaign-detail-grid{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.campaign-detail-grid label{display:grid;gap:6px;color:var(--muted);font-size:12px}.campaign-detail-grid select{width:100%;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--text);padding:11px}.campaign-detail-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:7px!important;padding:0 4px 11px}.campaign-detail-check input{width:19px;height:19px}.campaign-detail-status{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.campaign-detail-status>div{padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--surface)}.campaign-detail-status span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.campaign-detail-status strong{font-size:13px}.campaign-detail-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.campaign-detail-actions button{min-height:45px}.campaign-detail-blocked{margin-top:10px;padding:9px 11px;border:1px solid rgba(240,122,131,.3);background:rgba(240,122,131,.08);color:#ff9ea5;border-radius:11px;font-size:12px}.campaign-history-wrap{margin-top:16px}.campaign-history-wrap>strong{display:block;margin-bottom:8px}.campaign-history-row{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px}.campaign-history-row span{color:var(--muted)}.campaign-history-empty{color:var(--muted);font-size:12px;padding:7px 0}.campaign-card.campaign-paused{opacity:.68}.campaign-actions{grid-template-columns:repeat(4,1fr)!important}@media(max-width:520px){.campaign-detail-grid,.campaign-detail-status,.campaign-detail-actions{grid-template-columns:1fr}.campaign-actions{grid-template-columns:1fr 1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1700);
  }

  injectStyles();
  const observer = new MutationObserver(() => {
    decorateDetail();
    decorateCampaignCards();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', () => {
    decorateDetail();
    decorateCampaignCards();
  });
  setTimeout(() => {
    decorateDetail();
    decorateCampaignCards();
  }, 0);
})();
