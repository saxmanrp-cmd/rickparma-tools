(() => {
  'use strict';

  let rendering = false;

  function esc(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  async function api(path, options) {
    if (!window.BookingCloud?.api) throw new Error('Cloud CRM is not connected.');
    return window.BookingCloud.api(path, options);
  }

  function label(category) {
    return ({
      availability_request:'Availability',
      rate_request:'Rate / Money',
      offer_or_hold:'Offer / Hold',
      submission_redirect:'Submission Route',
      other:'Decision Needed'
    })[category] || String(category || 'Decision Needed').replaceAll('_',' ');
  }

  function placeholder(item) {
    if (item.category === 'rate_request') return 'Example: $600 solo, 3 x 45-minute sets';
    if (item.category === 'availability_request') return 'Example: yes, tell them the date works';
    if (item.category === 'offer_or_hold') return 'Example: accept the hold, but do not confirm contract yet';
    if (item.category === 'submission_redirect') return 'Example: go ahead with the submission route';
    return 'Tell the agent what you want it to do…';
  }

  function calendarLine(item) {
    const summary = item.metadata?.calendarAvailability?.summary;
    return summary ? `<div class="needs-calendar">📅 ${esc(summary)}</div>` : '';
  }

  async function respond(item, card) {
    const input = card.querySelector('[data-rick-decision]');
    const button = card.querySelector('[data-rick-send]');
    const message = card.querySelector('[data-rick-message]');
    const decision = input?.value.trim();
    if (!decision) {
      message.textContent = 'Type your decision first.';
      input?.focus();
      return;
    }
    button.disabled = true;
    message.textContent = 'Writing and sending your response…';
    try {
      await api(`/api/escalations/${encodeURIComponent(item.id)}/respond`, {
        method:'POST',
        body:{ decision }
      });
      message.textContent = 'Sent.';
      const toast = document.querySelector('#toast');
      if (toast) {
        toast.textContent = 'Booking response sent';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1800);
      }
      await render(true);
      window.dispatchEvent(new CustomEvent('booking-agent-refresh'));
    } catch (error) {
      message.textContent = error.message || 'Could not send.';
      button.disabled = false;
    }
  }

  async function resolveOnly(item, card) {
    const button = card.querySelector('[data-rick-resolve]');
    const message = card.querySelector('[data-rick-message]');
    button.disabled = true;
    message.textContent = 'Resolving…';
    try {
      await api(`/api/escalations/${encodeURIComponent(item.id)}/resolve`, {
        method:'POST',
        body:{ resolution:'Resolved by Rick without another reply.' }
      });
      await render(true);
      window.dispatchEvent(new CustomEvent('booking-agent-refresh'));
    } catch (error) {
      message.textContent = error.message || 'Could not resolve.';
      button.disabled = false;
    }
  }

  function targetView() {
    return document.querySelector('[data-view="dashboard"]')
      || document.querySelector('[data-view="campaigns"]');
  }

  async function render(force = false) {
    if (rendering) return;
    const view = targetView();
    if (!view) return;
    let host = view.querySelector('[data-needs-rick-inbox]');
    if (!host) {
      host = document.createElement('section');
      host.dataset.needsRickInbox = 'true';
      host.className = 'needs-rick-inbox';

      const agentHome = view.querySelector('[data-agent-home]');
      if (agentHome) agentHome.after(host);
      else {
        const anchor = view.querySelector('.metric-grid, .dashboard-grid, #campaignList');
        if (anchor) anchor.after(host); else view.appendChild(host);
      }
    } else if (!force && host.dataset.loaded === 'true') return;

    rendering = true;
    try {
      const data = await api('/api/escalations?limit=25');
      const items = data.escalations || [];
      const legacy = view.querySelector('[data-agent-review] .agent-review-block:first-child');
      if (legacy) legacy.style.display = 'none';
      host.dataset.loaded = 'true';
      host.innerHTML = `
        <div class="needs-head">
          <div><div class="eyebrow">ONLY WHEN A HUMAN DECISION MATTERS</div><h3>Needs Rick</h3></div>
          <span>${items.length}</span>
        </div>
        ${items.length ? `<div class="needs-stack">${items.map(item => `
          <details class="needs-card ${item.priority==='high'?'needs-high':''}" ${item.priority==='high'?'open':''} data-escalation-id="${esc(item.id)}">
            <summary>
              <div><strong>${esc(item.entity || item.inbound_sender || 'Booking reply')}</strong><span>${esc(label(item.category))}${item.contact_name ? ` • ${esc(item.contact_name)}` : ''}</span></div>
              <b>›</b>
            </summary>
            <div class="needs-body">
              <div class="needs-summary">${esc(item.summary || 'A booking decision needs you.')}</div>
              ${calendarLine(item)}
              ${item.inbound_subject ? `<div class="needs-subject"><span>Subject</span><strong>${esc(item.inbound_subject)}</strong></div>` : ''}
              <div class="needs-message"><span>Their message</span><p>${esc(item.inbound_body || 'No message body available.')}</p></div>
              <label>Your decision — one line is enough
                <textarea rows="3" data-rick-decision placeholder="${esc(placeholder(item))}"></textarea>
              </label>
              <div class="needs-actions">
                <button class="primary" data-rick-send>Write + Send Response</button>
                <button class="secondary" data-rick-resolve>Resolve Without Reply</button>
              </div>
              <div class="needs-status" data-rick-message></div>
            </div>
          </details>`).join('')}</div>` : '<div class="needs-empty"><strong>Nothing needs you.</strong><span>The agent can keep working on its own.</span></div>'}`;

      items.forEach(item => {
        const card = host.querySelector(`[data-escalation-id="${CSS.escape(item.id)}"]`);
        card?.querySelector('[data-rick-send]')?.addEventListener('click', e => { e.preventDefault(); respond(item, card); });
        card?.querySelector('[data-rick-resolve]')?.addEventListener('click', e => { e.preventDefault(); resolveOnly(item, card); });
      });
    } catch {
      host.innerHTML = '';
      host.dataset.loaded = 'false';
    } finally {
      rendering = false;
    }
  }

  function styles() {
    if (document.querySelector('#needs-rick-styles')) return;
    const style = document.createElement('style');
    style.id = 'needs-rick-styles';
    style.textContent = `
      .needs-rick-inbox{border:1px solid var(--line);border-radius:20px;background:var(--surface);padding:16px;margin:12px 0}.needs-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.needs-head h3{font-size:22px;margin:3px 0 0}.needs-head>span{min-width:30px;height:30px;display:grid;place-items:center;border-radius:999px;background:var(--surface-3);font-size:12px;font-weight:900}.needs-stack{display:grid;gap:8px;margin-top:13px}.needs-card{border:1px solid var(--line);border-radius:14px;background:var(--surface-2);overflow:hidden}.needs-card.needs-high{border-color:rgba(242,190,97,.38)}.needs-card summary{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px;cursor:pointer;list-style:none}.needs-card summary::-webkit-details-marker{display:none}.needs-card summary strong{display:block;font-size:13px}.needs-card summary span{display:block;font-size:10px;color:var(--muted);margin-top:2px}.needs-card summary b{font-size:20px;color:var(--muted);transition:transform .2s}.needs-card[open] summary b{transform:rotate(90deg)}.needs-body{border-top:1px solid var(--line);padding:12px}.needs-summary,.needs-calendar{font-size:11px;line-height:1.45;padding:10px;border-radius:10px;background:rgba(255,255,255,.03);margin-bottom:8px}.needs-calendar{color:#cfe0ff}.needs-subject,.needs-message{margin:10px 0}.needs-subject span,.needs-message span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.needs-subject strong{font-size:12px}.needs-message p{white-space:pre-wrap;font-size:11px;line-height:1.5;margin:0;max-height:190px;overflow:auto}.needs-body label{display:grid;gap:6px;color:var(--muted);font-size:10px;margin-top:12px}.needs-body textarea{width:100%;resize:vertical;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:11px;padding:10px;font:inherit;font-size:12px;line-height:1.4}.needs-actions{display:grid;grid-template-columns:1.3fr 1fr;gap:8px;margin-top:9px}.needs-actions button{min-height:42px}.needs-status{min-height:16px;color:var(--muted);font-size:10px;margin-top:7px}.needs-empty{display:grid;gap:3px;padding:18px 4px 5px}.needs-empty strong{font-size:14px}.needs-empty span{font-size:11px;color:var(--muted)}@media(max-width:520px){.needs-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  styles();
  async function openNeedsRick() {
    await render(true);
    const host = targetView()?.querySelector('[data-needs-rick-inbox]');
    if (!host) return;
    host.scrollIntoView({ behavior:'smooth', block:'start' });
    const first = host.querySelector('.needs-card');
    if (first && !first.open) first.open = true;
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-view="dashboard"].active') && !document.querySelector('[data-needs-rick-inbox]')) render();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('load',()=>setTimeout(render,2100));
  window.addEventListener('booking-agent-refresh',()=>render(true));
  window.addEventListener('booking-needs-rick-open',openNeedsRick);
})();
