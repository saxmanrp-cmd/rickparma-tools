(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const RELATIONSHIPS = ['Cold', 'Familiar', 'Know Them', 'Worked Together', 'Current Booker'];
  const STOP_STATUSES = ['Replied', 'Booked', 'Pass', 'Do not contact'];
  const TYPE_LABELS = { room: 'Room Campaign', buyer: 'Buyer Relationship', agent: 'Agency / Promoter' };
  const SEQUENCES = {
    room: [
      { day: 0, kind: 'intro', label: 'Initial pitch' },
      { day: 5, kind: 'email', label: 'Short email follow-up' },
      { day: 10, kind: 'secondary', label: 'Secondary channel' },
      { day: 16, kind: 'email', label: 'Final short follow-up' },
      { day: 75, kind: 'revisit', label: 'Revisit later' }
    ],
    buyer: [
      { day: 0, kind: 'intro', label: 'Relationship introduction' },
      { day: 7, kind: 'email', label: 'Relationship follow-up' },
      { day: 14, kind: 'secondary', label: 'Call / text if appropriate' },
      { day: 90, kind: 'revisit', label: 'Revisit relationship' }
    ],
    agent: [
      { day: 0, kind: 'intro', label: 'Artist introduction' },
      { day: 6, kind: 'email', label: 'Agency follow-up' },
      { day: 12, kind: 'secondary', label: 'Call / text if appropriate' },
      { day: 60, kind: 'revisit', label: 'Revisit agency' }
    ]
  };

  const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const today = () => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const addDays = (iso, days) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const escapeHtml = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function writeState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function contacts() {
    const data = window.BOOKING_DATA;
    if (!data?.contacts) return [];
    const state = readState();
    return data.contacts.map(c => ({ ...c, ...(state.overrides?.[c['Contact ID']] || {}) }));
  }

  function contactById(id) { return contacts().find(c => c['Contact ID'] === id) || null; }

  function campaignType(c) {
    if (c.Lane === 'Agency / Promoter') return 'agent';
    if (c.Lane === 'Strategic Buyer') return 'buyer';
    return 'room';
  }

  function getCampaign(id) {
    const state = readState();
    return state.campaigns?.[id] || null;
  }

  function relationshipFor(id) {
    const state = readState();
    return state.relationships?.[id] || 'Cold';
  }

  function textOkFor(id) {
    const state = readState();
    return !!state.textOk?.[id];
  }

  function saveRelationship(id, relationship) {
    if (!RELATIONSHIPS.includes(relationship)) return;
    const state = readState();
    state.relationships ||= {};
    state.relationships[id] = relationship;
    writeState(state);
    render();
  }

  function saveTextOk(id, enabled) {
    const state = readState();
    state.textOk ||= {};
    state.textOk[id] = !!enabled;
    writeState(state);
    render();
  }

  function stopped(c) {
    if (!c) return true;
    if (STOP_STATUSES.includes(c.Status)) return true;
    if (c['Current Venue']) return true;
    return false;
  }

  function channelFor(c, campaign, step) {
    const relationship = relationshipFor(c['Contact ID']);
    const textOk = textOkFor(c['Contact ID']);
    const hasEmail = !!c.Email;
    const hasPhone = !!c.Phone;

    if (step.kind === 'revisit') return 'Revisit';
    if (step.kind === 'email') return hasEmail ? 'Email' : hasPhone ? 'Call' : 'Research';
    if (step.kind === 'secondary') {
      if (textOk && hasPhone && ['Know Them', 'Worked Together', 'Current Booker'].includes(relationship)) return 'Text';
      if (hasPhone) return 'Call';
      return hasEmail ? 'Email' : 'Research';
    }
    if (step.kind === 'intro') {
      if (textOk && hasPhone && ['Worked Together', 'Current Booker'].includes(relationship)) return 'Text';
      if (hasEmail) return 'Email';
      if (hasPhone) return 'Call';
      return 'Research';
    }
    return hasEmail ? 'Email' : hasPhone ? 'Call' : 'Research';
  }

  function actionDate(campaign, step) {
    return addDays(campaign.startedOn, step.day);
  }

  function currentStep(c, campaign) {
    const sequence = SEQUENCES[campaign.type] || SEQUENCES.room;
    return sequence[Math.min(campaign.step || 0, sequence.length - 1)];
  }

  function isDue(c, campaign) {
    if (!campaign?.active || stopped(c)) return false;
    const step = currentStep(c, campaign);
    return actionDate(campaign, step) <= today();
  }

  function eligibleForCampaign(c) {
    if (!c || stopped(c)) return false;
    if (c['Automation Safe?'] === 'NO') return false;
    const state = readState();
    const pref = state.contactPrefs?.[c['Contact ID']];
    if (pref === 'SKIP' || pref === 'PERFORMING') return false;
    return true;
  }

  function startCampaign(id) {
    const c = contactById(id);
    if (!eligibleForCampaign(c)) return false;
    const state = readState();
    state.campaigns ||= {};
    state.campaigns[id] = {
      active: true,
      type: campaignType(c),
      startedOn: today(),
      step: 0,
      completed: [],
      lastAction: null,
      lastActionDate: null
    };
    state.overrides ||= {};
    state.overrides[id] = { ...(state.overrides[id] || {}), Status: state.overrides[id]?.Status === 'Queued' ? 'Queued' : (c.Status || 'Not contacted') };
    writeState(state);
    return true;
  }

  function buildFromQueue() {
    const state = readState();
    const ids = state.queue || [];
    let count = 0;
    ids.forEach(id => {
      if (!state.campaigns?.[id]?.active && startCampaign(id)) count++;
    });
    render();
    toast(count ? `${count} campaigns started from queue` : 'No new queue leads to start');
  }

  function advanceCampaign(id, actionLabel) {
    const c = contactById(id);
    const state = readState();
    const campaign = state.campaigns?.[id];
    if (!campaign || stopped(c)) return;
    const sequence = SEQUENCES[campaign.type] || SEQUENCES.room;
    const step = sequence[Math.min(campaign.step || 0, sequence.length - 1)];
    campaign.completed ||= [];
    campaign.completed.push({ step: campaign.step || 0, action: actionLabel, date: today() });
    campaign.lastAction = actionLabel;
    campaign.lastActionDate = today();

    if (step.kind === 'revisit') {
      campaign.startedOn = today();
      campaign.step = 0;
      campaign.active = false;
      campaign.revisitOn = addDays(today(), campaign.type === 'agent' ? 60 : campaign.type === 'buyer' ? 90 : 75);
    } else if ((campaign.step || 0) < sequence.length - 1) {
      campaign.step = (campaign.step || 0) + 1;
    } else {
      campaign.active = false;
    }

    state.overrides ||= {};
    const old = state.overrides[id] || {};
    const firstTouch = !old['Last Contacted'];
    state.overrides[id] = {
      ...old,
      Status: firstTouch ? 'Sent' : 'Follow-up',
      'Last Contacted': today(),
      'Next Follow-up': campaign.active ? actionDate(campaign, currentStep(c, campaign)) : null
    };
    writeState(state);
    render();
    toast('Campaign advanced');
  }

  function setOutcome(id, outcome) {
    const state = readState();
    state.overrides ||= {};
    state.campaigns ||= {};
    state.overrides[id] = { ...(state.overrides[id] || {}), Status: outcome, 'Next Follow-up': null };
    if (state.campaigns[id]) state.campaigns[id].active = false;
    writeState(state);
    render();
    toast(outcome === 'Booked' ? 'Marked booked 🎷' : 'Sequence stopped');
  }

  function campaignMessage(c, campaign, step, channel) {
    const relationship = relationshipFor(c['Contact ID']);
    const firstName = c.Contact && !/booking|management|department|submission/i.test(c.Contact) ? c.Contact.trim().split(/\s+/)[0] : '';
    const hello = firstName ? `Hi ${firstName}` : 'Hello';
    const known = ['Familiar', 'Know Them', 'Worked Together', 'Current Booker'].includes(relationship);
    const settings = readState().settings || {};
    const links = [settings.website ? `Website: ${settings.website}` : '', settings.epk ? `EPK/live media: ${settings.epk}` : ''].filter(Boolean).join('\n');

    if (channel === 'Text') {
      if (step.kind === 'intro') return `${hello} — Rick Parma here. Wanted to check in about upcoming live music dates. I’m focusing on solo singer/sax and flexible lounge work around Vegas. Anything coming up that might fit?`;
      return `${hello} — just circling back on live music dates. If you have anything coming up that fits solo singer/sax or a flexible lounge setup, I’d love to be considered.`;
    }

    if (channel === 'Call') {
      if (known) return `${hello}, it’s Rick Parma. I wanted to check in and see what you’re filling right now for live music. I’m especially looking for solo singer/sax, lounge and casino-bar dates. Anything on your calendar that might fit?`;
      return `Hi, this is Rick Parma. I’m a Las Vegas singer and saxophonist. I’m calling about live entertainment opportunities with ${c.Entity}. I’m especially looking for solo singer/sax, lounge, cocktail and casino-bar work. Who is the right person to speak with about booking or submitting my EPK?`;
    }

    if (step.kind === 'email' && (campaign.step || 0) > 0) {
      return `${hello},\n\nJust bringing this back up in case you’re currently filling live entertainment dates. I’m available for solo singer/sax, lounge and flexible casino/restaurant programming, and I’d be glad to send anything else you need.\n\n${links}\n\nThanks,\nRick Parma`;
    }

    if (campaign.type === 'buyer') {
      return `${hello},\n\nI’m Rick Parma, a Las Vegas-based singer and saxophonist. I perform R&B, Motown, soul, jazz/neo-soul, pop and Top 40, and I can scale from a polished solo-to-tracks setup through full band.\n\nI wanted to introduce myself because I’m looking for recurring lounge, casino-bar, restaurant and special-event opportunities, and there may be more than one room in your portfolio where I fit. I’d rather build the right relationship than send generic venue blasts.\n\n${links}\n\nThanks,\nRick Parma`;
    }

    if (campaign.type === 'agent') {
      return `${hello},\n\nI’m Rick Parma, a Las Vegas-based singer and saxophonist with extensive casino, lounge, corporate and private-event experience. My act scales from solo-to-tracks through full band, with R&B, Motown, soul, jazz/neo-soul, pop and Top 40.\n\nI’m looking to build more recurring Vegas placements and would love to connect about rooms or clients where a versatile singer/sax act would be useful.\n\n${links}\n\nThanks,\nRick Parma`;
    }

    return `${hello},\n\nI’m Rick Parma, a Las Vegas-based singer and saxophonist. I perform R&B, Motown, soul, jazz/neo-soul, pop and Top 40, and I can work from a polished solo-to-tracks setup through full band.\n\nI’m reaching out because ${c.Entity} looks like a strong fit for the kind of solo/lounge work I’m pursuing. I’d love to be considered for upcoming live music dates.\n\n${links}\n\nThanks,\nRick Parma`;
  }

  function subjectFor(c, campaign, step) {
    if (step.kind === 'email' && (campaign.step || 0) > 0) return `Following up — Rick Parma / live music`;
    if (campaign.type === 'buyer') return 'Las Vegas entertainment introduction — Rick Parma';
    if (campaign.type === 'agent') return 'Las Vegas artist partnership — Rick Parma';
    return `Live music for ${c.Entity} — Rick Parma`;
  }

  function doAction(id) {
    const c = contactById(id);
    const campaign = getCampaign(id);
    if (!c || !campaign) return;
    const step = currentStep(c, campaign);
    const channel = channelFor(c, campaign, step);
    const body = campaignMessage(c, campaign, step, channel);

    if (channel === 'Email' && c.Email) {
      const subject = subjectFor(c, campaign, step);
      window.location.href = `mailto:${encodeURIComponent(c.Email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }
    if (channel === 'Text' && c.Phone) {
      const phone = String(c.Phone).replace(/[^0-9+]/g, '');
      window.location.href = `sms:${phone}?&body=${encodeURIComponent(body)}`;
      return;
    }
    if (channel === 'Call' && c.Phone) {
      window.location.href = `tel:${String(c.Phone).replace(/[^0-9+]/g, '')}`;
      copyText(body, 'Call script copied');
      return;
    }
    if (channel === 'Revisit') {
      advanceCampaign(id, 'Revisit cycle');
      return;
    }
    copyText(body, 'Outreach text copied');
  }

  async function copyText(text, message) {
    try { await navigator.clipboard.writeText(text); toast(message); }
    catch { toast('Copy failed — select the text manually'); }
  }

  function activeCampaignRows() {
    const state = readState();
    return Object.entries(state.campaigns || {}).map(([id, campaign]) => ({ c: contactById(id), campaign }))
      .filter(x => x.c && x.campaign?.active && !stopped(x.c));
  }

  function taskCard(c, campaign) {
    const step = currentStep(c, campaign);
    const channel = channelFor(c, campaign, step);
    const due = actionDate(campaign, step);
    const manual = c['Automation Safe?'] === 'MANUAL APPROVAL';
    const relationship = relationshipFor(c['Contact ID']);
    const textOk = textOkFor(c['Contact ID']);
    const relOptions = RELATIONSHIPS.map(r => `<option ${r === relationship ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('');
    return `
      <article class="campaign-card ${due <= today() ? 'due' : ''}" data-campaign-id="${escapeHtml(c['Contact ID'])}">
        <div class="campaign-head">
          <div><span class="campaign-channel channel-${channel.toLowerCase()}">${escapeHtml(channel)}</span><strong>${escapeHtml(c.Entity)}</strong><small>${escapeHtml(TYPE_LABELS[campaign.type])} • ${escapeHtml(step.label)}</small></div>
          <div class="campaign-date">${due <= today() ? 'DUE' : escapeHtml(due)}</div>
        </div>
        ${manual ? '<div class="approval-note">Manual approval contact — review before outreach.</div>' : ''}
        <div class="campaign-controls">
          <label>Relationship<select data-rel-id="${escapeHtml(c['Contact ID'])}">${relOptions}</select></label>
          <label class="campaign-check"><input type="checkbox" data-textok-id="${escapeHtml(c['Contact ID'])}" ${textOk ? 'checked' : ''}><span>Text OK</span></label>
        </div>
        <div class="campaign-actions">
          <button class="secondary" data-preview-id="${escapeHtml(c['Contact ID'])}">Preview</button>
          <button class="primary" data-action-id="${escapeHtml(c['Contact ID'])}">${channel === 'Email' ? 'Open Email' : channel === 'Text' ? 'Open Text' : channel === 'Call' ? 'Call' : channel === 'Revisit' ? 'Revisit' : 'Copy Outreach'}</button>
          <button class="secondary" data-done-id="${escapeHtml(c['Contact ID'])}">Mark Done</button>
        </div>
        <div class="campaign-outcomes"><button data-outcome-id="${escapeHtml(c['Contact ID'])}" data-outcome="Replied">Replied</button><button data-outcome-id="${escapeHtml(c['Contact ID'])}" data-outcome="Booked">Booked</button><button data-outcome-id="${escapeHtml(c['Contact ID'])}" data-outcome="Pass">Pass</button></div>
      </article>`;
  }

  function preview(id) {
    const c = contactById(id);
    const campaign = getCampaign(id);
    if (!c || !campaign) return;
    const step = currentStep(c, campaign);
    const channel = channelFor(c, campaign, step);
    const body = campaignMessage(c, campaign, step, channel);
    const subject = subjectFor(c, campaign, step);
    const modal = document.createElement('div');
    modal.className = 'campaign-preview-backdrop';
    modal.innerHTML = `<div class="campaign-preview"><button class="campaign-close">×</button><div class="eyebrow">${escapeHtml(channel)} • ${escapeHtml(step.label)}</div><h2>${escapeHtml(c.Entity)}</h2>${channel === 'Email' ? `<label>Subject<input value="${escapeHtml(subject)}" readonly></label>` : ''}<label>Message / script<textarea rows="14" readonly>${escapeHtml(body)}</textarea></label><button class="primary campaign-copy">Copy</button></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.campaign-close').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('.campaign-copy').onclick = () => copyText(`${channel === 'Email' ? subject + '\n\n' : ''}${body}`, 'Copied');
  }

  function render() {
    const host = document.querySelector('[data-view="campaigns"]');
    if (!host) return;
    const rows = activeCampaignRows();
    rows.sort((a, b) => actionDate(a.campaign, currentStep(a.c, a.campaign)).localeCompare(actionDate(b.campaign, currentStep(b.c, b.campaign))));
    const dueRows = rows.filter(x => isDue(x.c, x.campaign));
    const email = dueRows.filter(x => channelFor(x.c, x.campaign, currentStep(x.c, x.campaign)) === 'Email').length;
    const call = dueRows.filter(x => channelFor(x.c, x.campaign, currentStep(x.c, x.campaign)) === 'Call').length;
    const text = dueRows.filter(x => channelFor(x.c, x.campaign, currentStep(x.c, x.campaign)) === 'Text').length;

    host.querySelector('#campaignMetrics').innerHTML = [[dueRows.length,'Due now'],[email,'Emails'],[call,'Calls'],[text,'Texts']].map(([n,l]) => `<div class="metric"><strong>${n}</strong><span>${l}</span></div>`).join('');
    host.querySelector('#campaignList').innerHTML = rows.length ? rows.map(x => taskCard(x.c, x.campaign)).join('') : '<div class="empty-state"><strong>No active campaigns yet.</strong><br><br>Build from your current Find Me Gigs queue when you’re ready.</div>';

    host.querySelectorAll('[data-rel-id]').forEach(el => el.onchange = () => saveRelationship(el.dataset.relId, el.value));
    host.querySelectorAll('[data-textok-id]').forEach(el => el.onchange = () => saveTextOk(el.dataset.textokId, el.checked));
    host.querySelectorAll('[data-preview-id]').forEach(el => el.onclick = () => preview(el.dataset.previewId));
    host.querySelectorAll('[data-action-id]').forEach(el => el.onclick = () => doAction(el.dataset.actionId));
    host.querySelectorAll('[data-done-id]').forEach(el => el.onclick = () => advanceCampaign(el.dataset.doneId, channelFor(contactById(el.dataset.doneId), getCampaign(el.dataset.doneId), currentStep(contactById(el.dataset.doneId), getCampaign(el.dataset.doneId)))));
    host.querySelectorAll('[data-outcome-id]').forEach(el => el.onclick = () => setOutcome(el.dataset.outcomeId, el.dataset.outcome));
  }

  function installUI() {
    if (document.querySelector('[data-view="campaigns"]')) return;
    const main = document.querySelector('main');
    const settings = document.querySelector('[data-view="settings"]');
    const section = document.createElement('section');
    section.className = 'view';
    section.dataset.view = 'campaigns';
    section.innerHTML = `
      <div class="page-title inline-title"><div><div class="eyebrow">OUTREACH ENGINE</div><h2>Campaigns</h2></div><button class="secondary" id="buildCampaignsButton">Build from Queue</button></div>
      <div class="queue-note">Email first. Calls and texts only when they make sense. Any reply, booking, pass, do-not-contact, or current-venue status stops the sequence.</div>
      <div id="campaignMetrics" class="metric-grid compact"></div>
      <div class="campaign-legend"><span>Cold → usually Email</span><span>Known + Text OK → Text can be recommended</span><span>Manual Approval → never auto-send</span></div>
      <div id="campaignList" class="stack"></div>`;
    main.insertBefore(section, settings);

    const nav = document.querySelector('.bottom-nav');
    const settingsBtn = nav.querySelector('[data-nav="settings"]');
    const button = document.createElement('button');
    button.className = 'nav-button';
    button.dataset.nav = 'campaigns';
    button.innerHTML = '<span>✉</span><small>Campaigns</small>';
    nav.insertBefore(button, settingsBtn);
    nav.style.gridTemplateColumns = 'repeat(6, 1fr)';

    button.addEventListener('click', () => {
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === 'campaigns'));
      document.querySelectorAll('.nav-button').forEach(b => b.classList.toggle('active', b === button));
      window.scrollTo({ top: 0, behavior: 'instant' });
      render();
    });
    section.querySelector('#buildCampaignsButton').onclick = buildFromQueue;

    injectStyles();
    render();
  }

  function injectStyles() {
    if (document.querySelector('#campaign-engine-styles')) return;
    const style = document.createElement('style');
    style.id = 'campaign-engine-styles';
    style.textContent = `
      .campaign-legend{display:flex;gap:8px;overflow-x:auto;margin:0 0 14px}.campaign-legend span{flex:0 0 auto;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px}
      .campaign-card{padding:18px;border:1px solid var(--line);border-radius:20px;background:var(--surface)}.campaign-card.due{border-color:#42577e}.campaign-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.campaign-head strong{display:block;font-size:18px;margin-top:8px}.campaign-head small{display:block;color:var(--muted);margin-top:4px;line-height:1.35}.campaign-date{font-size:11px;font-weight:900;color:var(--accent-2);letter-spacing:.08em}.campaign-channel{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--surface-3);font-size:11px;font-weight:900}.channel-email{color:#b8d0ff}.channel-call{color:#8ce1b2}.channel-text{color:#ffd37f}.approval-note{margin-top:12px;padding:9px 11px;border-radius:11px;background:rgba(242,190,97,.08);border:1px solid rgba(242,190,97,.25);color:#ffd37f;font-size:12px}.campaign-controls{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin-top:14px}.campaign-controls label{display:grid;gap:5px;color:var(--muted);font-size:11px}.campaign-controls select{padding:10px;border-radius:11px}.campaign-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:7px!important;padding:0 3px 9px}.campaign-check input{width:19px;height:19px}.campaign-actions{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:8px;margin-top:13px}.campaign-actions button{min-height:45px}.campaign-outcomes{display:flex;gap:7px;margin-top:9px}.campaign-outcomes button{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:999px;padding:6px 9px;font-size:11px;cursor:pointer}.campaign-preview-backdrop{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px}.campaign-preview{position:relative;width:min(680px,100%);max-height:calc(100vh - 36px);overflow:auto;background:#0d121d;border:1px solid #34415a;border-radius:24px;padding:22px}.campaign-preview h2{font-size:30px}.campaign-preview label{display:grid;gap:7px;color:var(--muted);font-size:12px;margin:13px 0}.campaign-preview input,.campaign-preview textarea{width:100%;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:13px;padding:12px;line-height:1.45}.campaign-close{position:absolute;right:15px;top:15px;width:38px;height:38px;border:0;border-radius:50%;background:var(--surface-2);color:var(--text);font-size:24px;cursor:pointer}.campaign-copy{width:100%}
      @media(max-width:560px){.campaign-actions{grid-template-columns:1fr}.campaign-controls{grid-template-columns:1fr}.bottom-nav .nav-button small{font-size:9px}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  const ready = window.BOOKING_DATA_READY || Promise.resolve();
  ready.then(() => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUI, { once: true });
    else installUI();
    window.addEventListener('storage', render);
  });
})();
