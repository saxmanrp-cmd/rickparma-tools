(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const SESSION_KEY = 'rick-booking-cloud-session';

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function sessionReady() { return !!sessionStorage.getItem(SESSION_KEY); }

  function contactById(id) {
    const base = window.BOOKING_DATA?.contacts?.find(c => c['Contact ID'] === id);
    if (!base) return null;
    return { ...base, ...(readState().overrides?.[id] || {}) };
  }

  function blocked(c) {
    if (!c) return 'Contact not found.';
    if (c['Automation Safe?'] === 'NO') return 'This contact is marked Do Not Pitch.';
    if (c['Current Venue']) return 'Already performing here.';
    if (['Pass', 'Do not contact', 'Booked'].includes(c.Status)) return `Contact status is ${c.Status}.`;
    const dedupe = window.BookingDedupe;
    if (dedupe?.doNotContactKeys && dedupe?.canonicalKey) {
      const keys = dedupe.doNotContactKeys();
      if (keys.has(dedupe.canonicalKey(c))) return 'This email/phone is on the Do Not Contact list.';
    }
    return '';
  }

  function senderFor(c) {
    return window.BookingSenderPolicy?.senderFor?.(c, 'campaign') || { email: 'saxman@rickparma.com', label: 'Rick Parma' };
  }

  function textOk(id) { return !!readState().textOk?.[id]; }

  function manualFallback(draft) {
    const { c, channel, subject, body } = draft;
    if (channel === 'Email' && c.Email) {
      location.href = `mailto:${encodeURIComponent(c.Email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }
    if (channel === 'Text' && c.Phone) {
      const phone = String(c.Phone).replace(/[^0-9+]/g, '');
      location.href = `sms:${phone}?&body=${encodeURIComponent(body)}`;
    }
  }

  async function providerReady(channel) {
    if (!window.BookingCloud || !sessionReady()) return false;
    try {
      const providers = await window.BookingCloud.providerStatus();
      return channel === 'Email' ? !!providers?.email?.configured : channel === 'Text' ? !!providers?.sms?.configured : false;
    } catch {
      return false;
    }
  }

  function ensureModal() {
    let backdrop = document.querySelector('#liveSendModal');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'liveSendModal';
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <div class="modal-card live-send-modal" role="dialog" aria-modal="true" aria-labelledby="liveSendTitle">
        <div class="modal-top">
          <div><div class="eyebrow">FINAL APPROVAL</div><h2 id="liveSendTitle">Send Outreach</h2></div>
          <button class="icon-button" type="button" data-live-close aria-label="Close">×</button>
        </div>
        <div data-live-details></div>
        <label class="draft-field" data-live-subject-wrap>Subject<input type="text" data-live-subject></label>
        <label class="draft-field">Message<textarea rows="13" data-live-body></textarea></label>
        <div class="live-send-safety">Nothing sends until you press the button below. One recipient only.</div>
        <div class="modal-actions live-send-actions">
          <button class="secondary" type="button" data-live-cancel>Cancel</button>
          <button class="primary" type="button" data-live-confirm>Send Now</button>
        </div>
        <div class="cloud-message" data-live-message></div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-live-close]').onclick = closeModal;
    backdrop.querySelector('[data-live-cancel]').onclick = closeModal;
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    return backdrop;
  }

  function closeModal() {
    const modal = document.querySelector('#liveSendModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function showApproval(draft) {
    const modal = ensureModal();
    const sender = senderFor(draft.c);
    const channel = draft.channel;
    const recipient = channel === 'Email' ? draft.c.Email : draft.c.Phone;
    modal.querySelector('#liveSendTitle').textContent = channel === 'Email' ? 'Send Email' : 'Send Text';
    modal.querySelector('[data-live-details]').innerHTML = `
      <div class="detail-grid live-send-grid">
        <div class="detail-box"><span>To</span><strong>${escapeHtml(recipient || '—')}</strong></div>
        <div class="detail-box"><span>From</span><strong>${escapeHtml(channel === 'Email' ? `${sender.label} <${sender.email}>` : 'Twilio booking number')}</strong></div>
        <div class="detail-box"><span>Contact</span><strong>${escapeHtml(draft.c.Entity || '')}</strong></div>
        <div class="detail-box"><span>Relationship</span><strong>${escapeHtml(readState().relationships?.[draft.c['Contact ID']] || 'Cold')}</strong></div>
      </div>`;
    const subjectWrap = modal.querySelector('[data-live-subject-wrap]');
    subjectWrap.style.display = channel === 'Email' ? '' : 'none';
    modal.querySelector('[data-live-subject]').value = draft.subject || '';
    modal.querySelector('[data-live-body]').value = draft.body || '';
    modal.querySelector('[data-live-message]').textContent = '';
    const confirm = modal.querySelector('[data-live-confirm]');
    confirm.textContent = channel === 'Email' ? 'Send Email Now' : 'Send Text Now';
    confirm.disabled = false;
    confirm.onclick = () => performSend(draft, modal);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  async function performSend(draft, modal) {
    const message = modal.querySelector('[data-live-message]');
    const button = modal.querySelector('[data-live-confirm]');
    const c = contactById(draft.c['Contact ID']);
    const stop = blocked(c);
    if (stop) {
      message.textContent = stop;
      return;
    }

    button.disabled = true;
    message.textContent = 'Sending…';
    try {
      const sender = senderFor(c);
      const bodyText = modal.querySelector('[data-live-body]').value;
      const state = readState();
      const campaign = state.campaigns?.[c['Contact ID']];
      let result;

      if (draft.channel === 'Email') {
        result = await window.BookingCloud.api('/api/send/email', {
          method: 'POST',
          body: {
            approved: true,
            complianceOk: true,
            contactId: c['Contact ID'],
            campaignId: c['Contact ID'],
            from: sender.email,
            to: c.Email,
            subject: modal.querySelector('[data-live-subject]').value,
            body: bodyText
          }
        });
      } else {
        if (!textOk(c['Contact ID'])) throw new Error('Text OK is not enabled for this contact.');
        result = await window.BookingCloud.api('/api/send/sms', {
          method: 'POST',
          body: {
            approved: true,
            complianceOk: true,
            textOk: true,
            contactId: c['Contact ID'],
            campaignId: c['Contact ID'],
            to: c.Phone,
            body: bodyText
          }
        });
      }

      message.textContent = `Sent through ${result.provider}.`;
      state.providerThreads ||= {};
      state.providerThreads[c['Contact ID']] = {
        provider: result.provider,
        providerMessageId: result.providerMessageId || null,
        threadId: result.threadId || null,
        crmMessageId: result.crmMessageId || null,
        sentAt: result.sentAt || new Date().toISOString()
      };
      writeState(state);

      const done = document.querySelector(`[data-done-id="${CSS.escape(c['Contact ID'])}"]`);
      if (done) done.click();
      setTimeout(async () => {
        try { await window.BookingCloud.syncNow(); } catch {}
        closeModal();
        toast('Outreach sent');
      }, 600);
    } catch (error) {
      message.textContent = error.message || 'Send failed.';
      button.disabled = false;
    }
  }

  function escapeHtml(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function injectStyles() {
    if (document.querySelector('#live-send-styles')) return;
    const style = document.createElement('style');
    style.id = 'live-send-styles';
    style.textContent = `
      .live-send-safety{padding:10px 12px;margin-top:10px;border:1px solid rgba(99,210,151,.24);background:rgba(99,210,151,.07);border-radius:12px;color:#8ce1b2;font-size:11px;font-weight:750}.live-send-actions{grid-template-columns:1fr 2fr}.live-send-grid{margin-bottom:14px}@media(max-width:520px){.live-send-actions{grid-template-columns:1fr}}`;
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

  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action-id]');
    if (!btn || btn.dataset.submissionAction === 'true') return;
    const smart = window.BookingSmartDrafts;
    if (!smart?.draftFor) return;
    const draft = smart.draftFor(btn.dataset.actionId);
    if (!draft || !['Email', 'Text'].includes(draft.channel)) return;
    if (!sessionReady()) return;

    // We own the click only when a secure provider is actually configured. Otherwise
    // the existing manual mailto/sms behavior remains untouched.
    e.preventDefault();
    e.stopImmediatePropagation();
    const ready = await providerReady(draft.channel);
    if (!ready) {
      manualFallback(draft);
      return;
    }
    const stop = blocked(draft.c);
    if (stop) {
      toast(stop);
      return;
    }
    showApproval(draft);
  }, true);

  injectStyles();
  window.BookingLiveSend = { providerReady, showApproval };
})();
