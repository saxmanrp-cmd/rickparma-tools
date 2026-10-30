(() => {
  'use strict';

  function senderFor() {
    return { email: 'contact@parmaentertainmentgroup.com', label: 'Parma Entertainment Group' };
  }

  function injectSettings() {
    const settingsView = document.querySelector('[data-view="settings"]');
    if (!settingsView || settingsView.querySelector('[data-sender-policy]')) return;

    const card = document.createElement('div');
    card.className = 'settings-card';
    card.dataset.senderPolicy = 'true';
    card.innerHTML = `
      <h3>Campaign Senders</h3>
      <p>All future booking emails are sent by Parma Entertainment Group from contact@parmaentertainmentgroup.com. For prospects previously contacted from the legacy mailbox, the first post-switch email starts a new thread and explains the updated website and email. Earlier CRM and email history remains available.</p>
      <div style="display:grid;gap:10px;margin:8px 0 16px">
        <div class="detail-box"><span>New outreach and logistics</span><strong>Parma Entertainment Group &lt;contact@parmaentertainmentgroup.com&gt;</strong></div>
      </div>
    `;

    const firstCard = settingsView.querySelector('.settings-card');
    if (firstCard) firstCard.after(card); else settingsView.appendChild(card);

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
    loadModule('./submission-channel.js', 'data-submission-channel-loader');
    loadModule('./simplewebauthn-browser.js', 'data-simplewebauthn-browser-loader');
    loadModule('./cloud-sync.js?v=autosync1', 'data-cloud-sync-loader');
    loadModule('./live-send.js', 'data-live-send-loader');
    loadModule('./smart-drafts.js', 'data-smart-drafts-loader');
    loadModule('./current-venue-booker.js', 'data-current-venue-booker-loader');
    loadModule('./dedupe-guard.js', 'data-dedupe-guard-loader');
    loadModule('./reply-center.js', 'data-reply-center-loader');
    loadModule('./research-guard.js', 'data-research-guard-loader');
  }

  window.BookingSenderPolicy = { senderFor };

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
