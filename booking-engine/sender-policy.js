(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const DEFAULT_POLICY = {
    personalEmail: 'saxman@rickparma.com',
    bookingEmail: 'booking@rickparma.com',
    coldSender: 'personal',
    relationshipSender: 'personal',
    logisticsSender: 'booking'
  };

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function policy() {
    const state = readState();
    return { ...DEFAULT_POLICY, ...(state.senderPolicy || {}) };
  }

  function savePolicy(next) {
    const state = readState();
    state.senderPolicy = { ...policy(), ...next };
    writeState(state);
  }

  function senderFor(contact, mode = 'campaign') {
    const p = policy();
    const relationship = readState().relationships?.[contact?.['Contact ID']] || 'Cold';
    const isKnown = ['Familiar', 'Know Them', 'Worked Together', 'Current Booker'].includes(relationship);

    if (mode === 'logistics') return { email: p.bookingEmail, label: 'Rick Parma Booking' };
    if (isKnown && p.relationshipSender === 'booking') return { email: p.bookingEmail, label: 'Rick Parma Booking' };
    if (!isKnown && p.coldSender === 'booking') return { email: p.bookingEmail, label: 'Rick Parma Booking' };
    return { email: p.personalEmail, label: 'Rick Parma' };
  }

  function injectSettings() {
    const settingsView = document.querySelector('[data-view="settings"]');
    if (!settingsView || settingsView.querySelector('[data-sender-policy]')) return;

    const p = policy();
    const card = document.createElement('div');
    card.className = 'settings-card';
    card.dataset.senderPolicy = 'true';
    card.innerHTML = `
      <h3>Campaign Senders</h3>
      <p>Personal outreach stays personal. Booking logistics can come from your new assistant alias.</p>
      <label>Rick / personal sender
        <input id="senderPersonal" type="email" value="${p.personalEmail}" />
      </label>
      <label>Booking assistant sender
        <input id="senderBooking" type="email" value="${p.bookingEmail}" />
      </label>
      <div style="display:grid;gap:10px;margin:8px 0 16px">
        <div class="detail-box"><span>Cold introductions</span><strong>Rick Parma &lt;${p.personalEmail}&gt;</strong></div>
        <div class="detail-box"><span>Buyer / agent relationships</span><strong>Rick Parma &lt;${p.personalEmail}&gt;</strong></div>
        <div class="detail-box"><span>Scheduling / logistics</span><strong>Rick Parma Booking &lt;${p.bookingEmail}&gt;</strong></div>
      </div>
      <button class="primary" id="saveSenderPolicy">Save Sender Setup</button>
    `;

    const firstCard = settingsView.querySelector('.settings-card');
    if (firstCard) firstCard.after(card); else settingsView.appendChild(card);

    card.querySelector('#saveSenderPolicy')?.addEventListener('click', () => {
      savePolicy({
        personalEmail: card.querySelector('#senderPersonal')?.value.trim() || DEFAULT_POLICY.personalEmail,
        bookingEmail: card.querySelector('#senderBooking')?.value.trim() || DEFAULT_POLICY.bookingEmail
      });
      showToast('Sender setup saved');
    });
  }

  function contactByEntity(entityName) {
    const data = window.BOOKING_DATA;
    if (!data?.contacts) return null;
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const target = norm(entityName);
    return data.contacts.find(c => norm(c.Entity) === target) || data.contacts.find(c => target.includes(norm(c.Entity)) || norm(c.Entity).includes(target)) || null;
  }

  function decorateCampaignCards() {
    const campaignView = document.querySelector('[data-view="campaigns"]');
    if (!campaignView) return;

    campaignView.querySelectorAll('.campaign-task, .lead-card, [data-campaign-id], [data-contact-id]').forEach(card => {
      if (card.querySelector('[data-sender-hint]')) return;
      const id = card.dataset.campaignId || card.dataset.contactId;
      let contact = null;
      if (id) contact = window.BOOKING_DATA?.contacts?.find(c => c['Contact ID'] === id) || null;
      if (!contact) {
        const heading = card.querySelector('strong, h3, h4')?.textContent;
        if (heading) contact = contactByEntity(heading);
      }
      if (!contact) return;

      const sender = senderFor(contact, 'campaign');
      const hint = document.createElement('div');
      hint.dataset.senderHint = 'true';
      hint.className = 'sender-hint';
      hint.textContent = `From: ${sender.label} <${sender.email}>`;
      hint.style.cssText = 'margin-top:8px;color:var(--muted);font-size:11px;font-weight:700;';
      card.appendChild(hint);
    });
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function loadModule(src, marker) {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute(marker, 'true');
    document.body.appendChild(script);
  }

  function loadExtensions() {
    loadModule('./campaign-crm-controls.js', 'data-campaign-crm-controls-loader');
    loadModule('./pitch-kit.js', 'data-pitch-kit-loader');
  }

  window.BookingSenderPolicy = { policy, senderFor };

  const observer = new MutationObserver(() => {
    injectSettings();
    decorateCampaignCards();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => {
    injectSettings();
    decorateCampaignCards();
    loadExtensions();
  });
  setTimeout(() => {
    injectSettings();
    decorateCampaignCards();
    loadExtensions();
  }, 0);
})();
