(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const SESSION_SEEDED = 'rick-booking-prospects-seeded-session';
  let lastStatus = null;
  let busy = false;

  function localState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function esc(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  async function api(path, options) {
    if (!window.BookingCloud?.api) throw new Error('Cloud CRM is not connected yet.');
    return window.BookingCloud.api(path, options);
  }

  async function seedProspects() {
    if (sessionStorage.getItem(SESSION_SEEDED) === '1') return;
    const contacts = window.BOOKING_DATA?.contacts || [];
    if (!contacts.length) return;
    await api('/api/prospects/import', {
      method: 'POST',
      body: { contacts, state: localState() }
    });
    sessionStorage.setItem(SESSION_SEEDED, '1');
  }

  async function status() {
    await seedProspects();
    lastStatus = await api('/api/autopilot/status');
    return lastStatus;
  }

  function modeLabel(mode) {
    return ({ off: 'Off', shadow: 'Shadow', pilot: 'Pilot', live: 'Live' })[mode] || mode;
  }

  function readinessRows(s) {
    const r = s.readiness || {};
    return `
      <div class="agent-status-row"><span>AI research + writing</span><strong class="${r.openai?.configured ? 'good' : 'warn'}">${r.openai?.configured ? 'Ready' : 'Needs API key'}</strong></div>
      <div class="agent-status-row"><span>Microsoft email</span><strong class="${r.microsoft?.configured ? 'good' : 'warn'}">${r.microsoft?.configured ? 'Ready' : 'Needs Graph setup'}</strong></div>
      <div class="agent-status-row"><span>Autonomous sending</span><strong class="${r.canSend ? 'good' : 'warn'}">${r.canSend ? 'Ready' : esc(r.sendBlocker || 'Blocked')}</strong></div>
      <div class="agent-status-row"><span>Send window right now</span><strong>${r.sendWindowOpen ? 'Open' : 'Closed'}</strong></div>`;
  }

  async function renderSettings() {
    const settings = document.querySelector('[data-view="settings"]');
    if (!settings) return;
    let card = settings.querySelector('[data-autopilot-settings]');
    if (!card) {
      card = document.createElement('div');
      card.className = 'settings-card agent-settings';
      card.dataset.autopilotSettings = 'true';
      settings.appendChild(card);
    }

    let s;
    try { s = await status(); }
    catch (error) {
      card.innerHTML = `<h3>Booking Agent Autopilot</h3><p>Connect the Cloud CRM first. The autonomous engine stays safely offline until the secure Worker is deployed and you log in.</p><div class="agent-error">${esc(error.message)}</div>`;
      return;
    }
    const c = s.config || {};
    card.innerHTML = `
      <div class="agent-title-row"><div><div class="eyebrow">AUTONOMOUS BOOKING</div><h3>Booking Agent</h3></div><span class="agent-mode mode-${esc(c.mode)}">${esc(modeLabel(c.mode))}</span></div>
      <p><strong>Shadow</strong> researches and writes but sends nothing. <strong>Pilot</strong> runs automatically with small daily limits. <strong>Live</strong> is the full autonomous engine.</p>
      <label>Mode
        <select data-agent-mode>
          <option value="off" ${c.mode==='off'?'selected':''}>Off</option>
          <option value="shadow" ${c.mode==='shadow'?'selected':''}>Shadow — no sending</option>
          <option value="pilot" ${c.mode==='pilot'?'selected':''}>Pilot — small autonomous batches</option>
          <option value="live" ${c.mode==='live'?'selected':''}>Live — autonomous</option>
        </select>
      </label>
      <div class="agent-grid">
        <label>New emails / day<input data-agent-initial type="number" min="0" max="50" value="${Number(c.dailyInitialEmailLimit ?? 3)}"></label>
        <label>Follow-ups / day<input data-agent-followups type="number" min="0" max="100" value="${Number(c.dailyFollowupEmailLimit ?? 5)}"></label>
        <label>Minimum fit<input data-agent-fit type="number" min="0" max="100" value="${Number(c.minFitScore || 82)}"></label>
        <label>Minimum confidence<input data-agent-confidence type="number" min="0" max="1" step="0.01" value="${Number(c.minConfidence || .82)}"></label>
      </div>
      <label>Business postal address <span>(required before Pilot/Live sends)</span>
        <input data-agent-address value="${esc(c.businessPostalAddress || '')}" placeholder="Business mailing address / PO Box / mailbox">
      </label>
      <div class="agent-safety">Cold SMS is permanently disabled. Money, contracts, date holds, exclusivity and unusual commitments always go to <strong>Needs Rick</strong>.</div>
      <div class="agent-readiness">${readinessRows(s)}</div>
      <div class="agent-buttons">
        <button class="primary" data-agent-save>Save Agent Settings</button>
        <button class="secondary" data-agent-run>Run Now</button>
        <button class="secondary" data-agent-research>Research Now</button>
      </div>
      <div class="agent-message" data-agent-message></div>`;

    card.querySelector('[data-agent-save]').onclick = async () => {
      const message = card.querySelector('[data-agent-message]');
      message.textContent = 'Saving…';
      try {
        const config = {
          ...c,
          mode: card.querySelector('[data-agent-mode]').value,
          dailyInitialEmailLimit: Number(card.querySelector('[data-agent-initial]').value),
          dailyFollowupEmailLimit: Number(card.querySelector('[data-agent-followups]').value),
          minFitScore: Number(card.querySelector('[data-agent-fit]').value),
          minConfidence: Number(card.querySelector('[data-agent-confidence]').value),
          businessPostalAddress: card.querySelector('[data-agent-address]').value.trim()
        };
        await api('/api/autopilot/config', { method: 'PUT', body: { config } });
        toast('Booking Agent settings saved');
        await refreshAll();
      } catch (error) { message.textContent = error.message; }
    };

    card.querySelector('[data-agent-run]').onclick = () => runNow(false, card);
    card.querySelector('[data-agent-research]').onclick = () => runNow(true, card);
  }

  async function runNow(forceResearch, card) {
    if (busy) return;
    busy = true;
    const message = card?.querySelector('[data-agent-message]');
    if (message) message.textContent = forceResearch ? 'Researching and running agent…' : 'Running booking agent…';
    try {
      const result = await api('/api/autopilot/run', { method: 'POST', body: { forceResearch } });
      const out = result.outbound || {};
      if (message) message.textContent = `Done • ${out.drafted || 0} drafts • ${out.sentInitial || 0} new sent • ${out.sentFollowups || 0} follow-ups`;
      toast('Booking Agent cycle complete');
      await refreshAll();
    } catch (error) {
      if (message) message.textContent = error.message;
    } finally { busy = false; }
  }

  function metric(n, label) {
    if (label === 'Needs Rick') {
      return `<button type="button" class="agent-metric agent-metric-button" data-open-needs-rick aria-label="Open Needs Rick items"><strong>${Number(n || 0)}</strong><span>${esc(label)}</span></button>`;
    }
    return `<div class="agent-metric"><strong>${Number(n || 0)}</strong><span>${esc(label)}</span></div>`;
  }

  function activityLabel(eventType, prospect) {
    const status = String(prospect?.status || '');
    if (eventType === 'autopilot_initial_sent') return 'Sent first outreach';
    if (eventType === 'autopilot_followup_sent') return 'Sent follow-up';
    if (eventType === 'autopilot_escalation_created') return 'Needs Rick';
    if (eventType === 'autopilot_reply_sent') return 'Agent replied';
    if (eventType === 'autopilot_opt_out') return 'Opted out • stopped';
    if (eventType === 'autopilot_contacts_learned') return 'Learned booking contact';
    if (eventType === 'autopilot_non_booking_contact') return 'Removed non-booking contact';
    if (eventType === 'rick_decision_sent') return 'Rick decision sent';
    if (eventType === 'message_received') {
      if (status === 'Replied') return 'Replied • follow-ups stopped';
      if (status === 'Pass') return 'Passed • follow-ups stopped';
      if (status === 'Do not contact') return 'Opted out • stopped';
      return 'Reply received';
    }
    return '';
  }

  async function renderHome() {
    const home = document.querySelector('[data-view="dashboard"]');
    if (!home) return;

    let panel = home.querySelector('[data-agent-home]');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'agent-home-panel';
      panel.dataset.agentHome = 'true';
      const anchor = home.querySelector('.metric-grid, .dashboard-grid');
      if (anchor) anchor.after(panel);
      else home.appendChild(panel);
    }

    if (!lastStatus) {
      try { await status(); }
      catch { panel.remove(); return; }
    }

    const s = lastStatus;
    const c = s.counts || {};

    let recent = [];
    try {
      const [eventsData, prospectsData] = await Promise.all([
        api('/api/events?limit=30'),
        api('/api/prospects?limit=500')
      ]);

      const prospects = new Map(
        (prospectsData.prospects || []).map(p => [p.id, p])
      );

      recent = (eventsData.events || [])
        .map(e => ({ ...e, prospect: prospects.get(e.contactId) || null }))
        .filter(e => activityLabel(e.eventType, e.prospect))
        .slice(0, 8);
    } catch {}

    panel.innerHTML = `
      <div class="agent-home-head">
        <div>
          <div class="eyebrow">BOOKING AGENT</div>
          <strong>What happened</strong>
        </div>
        <span class="agent-mode mode-${esc(s.config?.mode)}">${esc(modeLabel(s.config?.mode))}</span>
      </div>

      <div class="agent-home-metrics">
        ${metric(c.contacted,'Contacted')}
        ${metric(c.replied,'Replies')}
        ${metric(c.needsRick,'Needs Rick')}
        ${metric(c.verified,'Verified')}
      </div>

      <div class="agent-home-activity">
        <div class="agent-section-title">
          <strong>Recent activity</strong>
          <span>${recent.length}</span>
        </div>

        ${recent.length ? recent.map(e => `
          <div class="agent-home-activity-row">
            <div>
              <strong>${esc(e.prospect?.entity || 'Booking activity')}</strong>
              <span>${esc(activityLabel(e.eventType, e.prospect))}</span>
            </div>
            <time>${esc(new Date(e.createdAt).toLocaleString([], {
              month:'short',
              day:'numeric',
              hour:'numeric',
              minute:'2-digit'
            }))}</time>
          </div>
        `).join('') : '<div class="agent-empty">No recent booking activity.</div>'}
      </div>

      <div class="agent-home-foot">
        ${s.latestRun?.startedAt
          ? `Last agent run: ${new Date(s.latestRun.startedAt).toLocaleString()}`
          : 'Agent has not run yet.'}
      </div>`;

    panel.querySelector('[data-open-needs-rick]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('booking-needs-rick-open'));
    });
  }

  async function renderCampaignAgentSections() {
    const view = document.querySelector('[data-view="campaigns"]');
    if (!view) return;
    let section = view.querySelector('[data-agent-review]');
    if (!section) {
      section = document.createElement('div');
      section.className = 'agent-review-section';
      section.dataset.agentReview = 'true';
      const list = view.querySelector('#campaignList');
      if (list) list.before(section); else view.appendChild(section);
    }
    try {
      const [escalations, drafts] = await Promise.all([
        api('/api/escalations?limit=10'),
        api('/api/autopilot/drafts?limit=8')
      ]);
      const needs = escalations.escalations || [];
      const draftRows = drafts.drafts || [];
      section.innerHTML = `
        <div class="agent-review-block">
          <div class="agent-section-title"><strong>Needs Rick</strong><span>${needs.length}</span></div>
          ${needs.length ? needs.map(e => `<div class="agent-exception ${e.priority==='high'?'high':''}"><div><strong>${esc(e.entity || 'Booking reply')}</strong><span>${esc(e.category)} • ${esc(e.contact_name || e.email || '')}</span></div><p>${esc(e.summary)}</p></div>`).join('') : '<div class="agent-empty">Nothing needs you right now.</div>'}
        </div>
        ${lastStatus?.config?.mode === 'shadow' ? `<div class="agent-review-block"><div class="agent-section-title"><strong>Shadow Drafts</strong><span>${draftRows.length}</span></div>${draftRows.length ? draftRows.slice(0,5).map(d => `<details class="agent-draft"><summary>${esc(d.entity || d.email || 'Draft')} — ${esc(d.subject || '')}</summary><pre>${esc(d.body || '')}</pre></details>`).join('') : '<div class="agent-empty">No shadow drafts yet.</div>'}</div>` : ''}`;
    } catch {
      section.innerHTML = '';
    }
  }

  async function refreshAll() {
    try { await status(); } catch {}
    await Promise.allSettled([renderSettings(), renderHome(), renderCampaignAgentSections()]);
  }

  function injectStyles() {
    if (document.querySelector('#autopilot-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'autopilot-ui-styles';
    style.textContent = `
      .agent-title-row,.agent-home-head,.agent-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.agent-title-row h3{margin:2px 0 0}.agent-mode{font-size:11px;font-weight:900;padding:7px 10px;border-radius:999px;border:1px solid var(--line);text-transform:uppercase;letter-spacing:.08em}.mode-shadow{color:#b8d0ff}.mode-pilot{color:#ffd37f}.mode-live{color:#8ce1b2}.agent-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.agent-settings label span{font-weight:500;color:var(--muted)}.agent-safety{padding:11px 12px;border:1px solid rgba(242,190,97,.22);background:rgba(242,190,97,.06);border-radius:12px;font-size:11px;line-height:1.45;color:var(--muted);margin:10px 0}.agent-readiness{margin:10px 0}.agent-status-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px}.agent-status-row span{color:var(--muted)}.agent-status-row strong.good{color:#8ce1b2}.agent-status-row strong.warn{color:#ffd37f;max-width:55%;text-align:right}.agent-buttons{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:8px}.agent-message{min-height:18px;color:var(--muted);font-size:11px;margin-top:8px}.agent-home-panel,.agent-review-block{border:1px solid var(--line);border-radius:18px;background:var(--surface);padding:15px;margin:14px 0}.agent-home-head strong{font-size:18px}.agent-dot{width:10px;height:10px;border-radius:999px;background:#6b7280}.agent-dot.on{background:#8ce1b2;box-shadow:0 0 14px rgba(140,225,178,.5)}.agent-home-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px}.agent-metric{padding:10px 6px;border:1px solid var(--line);border-radius:12px;text-align:center;background:transparent;color:inherit;font:inherit}.agent-metric-button{cursor:pointer;background:rgba(242,190,97,.06);border-color:rgba(242,190,97,.28)}.agent-metric-button:active{transform:scale(.98)}.agent-metric strong{display:block;font-size:20px}.agent-metric span{display:block;font-size:9px;color:var(--muted);margin-top:2px}.agent-home-activity{margin-top:14px}.agent-home-activity-row{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:11px 0;border-top:1px solid rgba(255,255,255,.06)}.agent-home-activity-row strong{display:block;font-size:13px}.agent-home-activity-row span{display:block;color:var(--muted);font-size:11px;margin-top:3px}.agent-home-activity-row time{font-size:10px;color:var(--muted);white-space:nowrap}.agent-home-foot{font-size:10px;color:var(--muted);margin-top:10px}.agent-review-section{margin:12px 0}.agent-section-title span{font-size:11px;padding:4px 7px;border-radius:999px;background:var(--surface-3);color:var(--muted)}.agent-exception{padding:10px 0;border-bottom:1px solid var(--line)}.agent-exception:last-child{border-bottom:0}.agent-exception.high{border-left:3px solid #ffd37f;padding-left:10px}.agent-exception div{display:flex;justify-content:space-between;gap:8px}.agent-exception span,.agent-exception p,.agent-empty{font-size:11px;color:var(--muted)}.agent-exception p{margin:6px 0 0;line-height:1.4}.agent-draft{border-top:1px solid var(--line);padding:9px 0}.agent-draft summary{cursor:pointer;font-size:11px;font-weight:700}.agent-draft pre{white-space:pre-wrap;font-family:inherit;color:var(--muted);font-size:11px;line-height:1.45}.agent-error{color:#ffd37f;font-size:11px}@media(max-width:520px){.agent-grid{grid-template-columns:1fr 1fr}.agent-buttons{grid-template-columns:1fr}.agent-home-metrics{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  injectStyles();
  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-view="settings"].active') && !document.querySelector('[data-autopilot-settings]')) renderSettings();
    if (document.querySelector('[data-view="campaigns"].active') && !document.querySelector('[data-agent-review]')) renderCampaignAgentSections();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', () => setTimeout(refreshAll, 600));
  setTimeout(refreshAll, 1200);
})();