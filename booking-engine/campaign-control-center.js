(() => {
  'use strict';

  const state = {
    status: null,
    prospects: [],
    drafts: [],
    escalations: [],
    filter: 'all',
    search: '',
    selectedId: null,
    pilotPreview: false,
    busy: false
  };

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 1900);
  }

  async function api(path, options) {
    if (!window.BookingCloud?.api) throw new Error('Cloud CRM is not connected yet.');
    return window.BookingCloud.api(path, options);
  }

  function modeLabel(mode) {
    return ({ off: 'Off', shadow: 'Shadow', pilot: 'Pilot', live: 'Live' })[mode] || String(mode || 'Unknown');
  }

  function sourceCount(p) {
    return Array.isArray(p?.sourceUrls) ? p.sourceUrls.length : 0;
  }

  function isReady(p) {
    const c = state.status?.config || {};
    return !Number(p.suppressed || 0)
      && !Number(p.current_venue || 0)
      && p.room_preference !== 'SKIP'
      && p.room_preference !== 'PERFORMING'
      && p.automation_safe === 'YES_TARGETED'
      && !!String(p.email || '').trim()
      && !!p.verified_at
      && sourceCount(p) > 0
      && Number(p.fit_score || 0) >= Number(c.minFitScore ?? 82)
      && Number(p.confidence || 0) >= Number(c.minConfidence ?? 0.82);
  }

  function bucket(p) {
    if (Number(p.current_venue || 0) || p.room_preference === 'PERFORMING') return 'current';
    if (Number(p.suppressed || 0) || String(p.status || '').toLowerCase() === 'do not contact') return 'stopped';
    if (isReady(p)) return 'ready';
    if (p.automation_safe === 'MANUAL') return 'manual';
    if (!p.verified_at) return 'research';
    return 'other';
  }

  function draftFor(id) {
    return state.drafts.find(d => d.contact_id === id) || null;
  }

  function selectedProspect() {
    return state.prospects.find(p => p.id === state.selectedId) || null;
  }

  function cleanUrl(value) {
    const raw = String(value || '').trim();
    if (!/^https?:\/\//i.test(raw)) return '';
    return raw;
  }

  function timeline(p) {
    const draft = draftFor(p.id);
    const contacted = !!p.last_contacted_at || Number(p.touch_count || 0) > 0;
    const replied = ['Replied', 'Booked', 'Pass', 'Do not contact'].includes(String(p.status || ''));
    const current = bucket(p) === 'current';
    const ready = isReady(p);
    const mode = state.status?.config?.mode || 'shadow';
    const sendBlocked = current || Number(p.suppressed || 0) || !ready;

    return [
      { label: 'Discovered', note: p.discovered_at ? `Found ${formatDate(p.discovered_at)}` : 'In CRM', done: true },
      { label: 'Verified', note: p.verified_at ? `Evidence checked ${formatDate(p.verified_at)}` : 'Waiting for second pass', done: !!p.verified_at },
      { label: 'Drafted', note: draft ? 'Personalized outreach is ready' : ready ? 'Waiting for draft generation' : 'Draft waits for eligibility', done: !!draft },
      { label: 'Initial outreach', note: contacted ? `Contacted ${formatDate(p.last_contacted_at)}` : sendBlocked ? 'Blocked by prospect safeguards' : mode === 'shadow' ? 'Shadow stops here — no send' : 'Eligible for autonomous send', done: contacted, active: !contacted && !sendBlocked },
      { label: 'Follow-ups', note: contacted ? `Touch ${Number(p.touch_count || 0)} • next ${p.next_action_at ? formatDate(p.next_action_at) : 'not scheduled'}` : 'Days 5, 10, 16 and 75 after first send', done: Number(p.touch_count || 0) > 1 },
      { label: 'Reply / decision', note: replied ? String(p.status || '') : 'Routine replies can auto-handle; business decisions go to Needs Rick', done: replied }
    ];
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function counts() {
    const all = state.prospects;
    return {
      all: all.length,
      ready: all.filter(isReady).length,
      manual: all.filter(p => bucket(p) === 'manual').length,
      current: all.filter(p => bucket(p) === 'current').length,
      drafts: state.drafts.length,
      needsRick: state.escalations.length
    };
  }

  function filteredProspects() {
    const q = state.search.toLowerCase().trim();
    return state.prospects
      .filter(p => state.filter === 'all' || bucket(p) === state.filter)
      .filter(p => !q || [p.entity, p.room, p.contact_name, p.contact_role, p.email, p.category].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => Number(b.fit_score || 0) - Number(a.fit_score || 0) || Number(b.confidence || 0) - Number(a.confidence || 0));
  }

  function metric(value, label) {
    return `<div class="cc-metric"><strong>${Number(value || 0)}</strong><span>${esc(label)}</span></div>`;
  }

  function statusPill(p) {
    const b = bucket(p);
    const labels = { ready: 'Send-ready', manual: 'Manual', current: 'PERFORMING', stopped: 'Stopped', research: 'Researching', other: p.automation_safe || 'Open' };
    return `<span class="cc-pill cc-${esc(b)}">${esc(labels[b] || 'Open')}</span>`;
  }

  function prospectCard(p) {
    const draft = draftFor(p.id);
    const selected = p.id === state.selectedId;
    return `
      <button type="button" class="cc-prospect ${selected ? 'selected' : ''}" data-cc-select="${esc(p.id)}">
        <div class="cc-prospect-top">
          <div class="cc-prospect-name">${esc(p.entity || 'Unknown prospect')}</div>
          ${statusPill(p)}
        </div>
        <div class="cc-prospect-sub">${esc(p.room || p.category || p.profile || 'Booking opportunity')}</div>
        <div class="cc-prospect-meta"><span>Fit <strong>${Number(p.fit_score || 0)}</strong></span><span>Confidence <strong>${Math.round(Number(p.confidence || 0) * 100)}%</strong></span><span>${sourceCount(p)} source${sourceCount(p) === 1 ? '' : 's'}</span>${draft ? '<span>Draft ready</span>' : ''}</div>
      </button>`;
  }

  function detailMarkup(p) {
    if (!p) return '<div class="cc-empty">Select a prospect to inspect the campaign.</div>';
    const draft = draftFor(p.id);
    const sources = (p.sourceUrls || []).map(cleanUrl).filter(Boolean);
    const stages = timeline(p);
    const mode = state.status?.config?.mode || 'shadow';
    const modeText = state.pilotPreview && mode === 'shadow' ? 'Pilot preview' : modeLabel(mode);
    const sendText = state.pilotPreview && mode === 'shadow'
      ? 'Preview only — if Pilot were enabled, this contact could send only if every safeguard remains satisfied.'
      : mode === 'shadow'
        ? 'Shadow is live: the engine can research, verify and draft, but sending is blocked.'
        : `${modeLabel(mode)} is active. Daily limits and send-window rules apply.`;

    return `
      <div class="cc-detail-head">
        <div>
          <div class="eyebrow">SELECTED CAMPAIGN</div>
          <h3>${esc(p.entity || '')}</h3>
          <div class="cc-detail-sub">${esc(p.room || p.category || '')}</div>
        </div>
        ${statusPill(p)}
      </div>
      <div class="cc-detail-grid">
        <div><span>Fit</span><strong>${Number(p.fit_score || 0)} / 100</strong></div>
        <div><span>Confidence</span><strong>${Math.round(Number(p.confidence || 0) * 100)}%</strong></div>
        <div><span>Contact</span><strong>${esc(p.contact_name || 'No verified name')}</strong></div>
        <div><span>Email</span><strong>${esc(p.email || 'No verified email')}</strong></div>
      </div>
      <div class="cc-mode-note"><strong>${esc(modeText)}</strong><span>${esc(sendText)}</span></div>
      <div class="cc-section-label">Campaign flow</div>
      <div class="cc-timeline">
        ${stages.map(s => `<div class="cc-stage ${s.done ? 'done' : ''} ${s.active ? 'active' : ''}"><i></i><div><strong>${esc(s.label)}</strong><span>${esc(s.note)}</span></div></div>`).join('')}
      </div>
      <div class="cc-section-label">Why this prospect</div>
      <div class="cc-evidence-copy">${esc(p.fit_reason || p.evidence_summary || 'No research summary available yet.')}</div>
      ${p.evidence_summary && p.evidence_summary !== p.fit_reason ? `<div class="cc-evidence-copy secondary-copy">${esc(p.evidence_summary)}</div>` : ''}
      <div class="cc-source-list">${sources.length ? sources.map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener">Source ${i + 1} ↗</a>`).join('') : '<span>No stored evidence source yet.</span>'}</div>
      <div class="cc-actions">
        <button type="button" class="primary" data-cc-draft ${draft ? '' : 'disabled'}>${draft ? 'View Draft' : 'No Draft Yet'}</button>
        <button type="button" class="secondary" data-cc-refresh>Refresh</button>
        <button type="button" class="secondary" data-cc-settings>Agent Settings</button>
      </div>
      ${draft ? `<div class="cc-draft-wrap" data-cc-draft-panel hidden><div class="cc-draft-head"><div><span>From</span><strong>booking@rickparma.com</strong></div><div><span>Subject</span><strong>${esc(draft.subject || '')}</strong></div></div><pre>${esc(draft.body || '')}</pre></div>` : ''}`;
  }

  function render() {
    const host = document.querySelector('[data-campaign-control-center]');
    if (!host) return;
    const c = counts();
    const mode = state.status?.config?.mode || 'shadow';
    const rows = filteredProspects();
    const selected = selectedProspect();
    const blocker = state.status?.readiness?.sendBlocker || '';

    host.innerHTML = `
      <div class="cc-shell">
        <div class="cc-top">
          <div><div class="eyebrow">LIVE AUTOPILOT CAMPAIGNS</div><h2>Campaign Control Center</h2><p>Real CRM prospects, verification evidence, Shadow drafts and Needs Rick handoffs in one place.</p></div>
          <div class="cc-mode-box"><span>Mode</span><strong>${esc(modeLabel(mode))}</strong><small>${mode === 'shadow' ? 'No prospect sends' : esc(blocker || 'Autonomous limits active')}</small></div>
        </div>
        <div class="cc-metrics">${metric(c.all, 'Prospects')}${metric(c.ready, 'Send-ready')}${metric(c.manual, 'Manual')}${metric(c.current, 'Current venues')}${metric(c.drafts, 'Drafts')}${metric(c.needsRick, 'Needs Rick')}</div>
        <div class="cc-toolbar">
          <div class="cc-filters">
            ${[['all','All'],['ready','Ready'],['manual','Manual'],['current','Playing Here']].map(([value,label]) => `<button type="button" class="cc-chip ${state.filter === value ? 'active' : ''}" data-cc-filter="${value}">${label}</button>`).join('')}
          </div>
          <div class="cc-tools">
            <input type="search" data-cc-search value="${esc(state.search)}" placeholder="Search campaigns…" aria-label="Search campaigns">
            <button type="button" class="secondary" data-cc-run ${state.busy ? 'disabled' : ''}>${state.busy ? 'Running…' : 'Run Agent'}</button>
            <button type="button" class="secondary" data-cc-research ${state.busy ? 'disabled' : ''}>Research</button>
            ${mode === 'shadow' ? `<button type="button" class="secondary" data-cc-preview>${state.pilotPreview ? 'Exit Pilot Preview' : 'Preview Pilot'}</button>` : ''}
          </div>
        </div>
        <div class="cc-layout">
          <div class="cc-list">${rows.length ? rows.map(prospectCard).join('') : '<div class="cc-empty">No prospects match this view.</div>'}</div>
          <div class="cc-detail">${detailMarkup(selected)}</div>
        </div>
        <div class="cc-foot">${state.status?.latestRun?.startedAt ? `Last agent run: ${esc(formatDate(state.status.latestRun.startedAt))}` : 'No completed agent run yet.'}</div>
      </div>`;

    wire(host);
  }

  function wire(host) {
    host.querySelectorAll('[data-cc-filter]').forEach(btn => btn.addEventListener('click', () => {
      state.filter = btn.dataset.ccFilter;
      const rows = filteredProspects();
      if (!rows.some(p => p.id === state.selectedId)) state.selectedId = rows[0]?.id || null;
      render();
    }));

    host.querySelector('[data-cc-search]')?.addEventListener('input', event => {
      state.search = event.target.value;
      const rows = filteredProspects();
      if (!rows.some(p => p.id === state.selectedId)) state.selectedId = rows[0]?.id || null;
      render();
      requestAnimationFrame(() => {
        const input = document.querySelector('[data-campaign-control-center] [data-cc-search]');
        input?.focus();
        if (input) input.setSelectionRange(input.value.length, input.value.length);
      });
    });

    host.querySelectorAll('[data-cc-select]').forEach(btn => btn.addEventListener('click', () => {
      state.selectedId = btn.dataset.ccSelect;
      render();
    }));

    host.querySelector('[data-cc-draft]')?.addEventListener('click', () => {
      const panel = host.querySelector('[data-cc-draft-panel]');
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    host.querySelectorAll('[data-cc-refresh]').forEach(btn => btn.addEventListener('click', load));
    host.querySelector('[data-cc-preview]')?.addEventListener('click', () => { state.pilotPreview = !state.pilotPreview; render(); });
    host.querySelector('[data-cc-run]')?.addEventListener('click', () => runAgent(false));
    host.querySelector('[data-cc-research]')?.addEventListener('click', () => runAgent(true));
    host.querySelector('[data-cc-settings]')?.addEventListener('click', () => document.querySelector('[data-nav="settings"]')?.click());
  }

  async function runAgent(forceResearch) {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const result = await api('/api/autopilot/run', { method: 'POST', body: { forceResearch } });
      const out = result.outbound || {};
      toast(`${forceResearch ? 'Research' : 'Agent'} complete • ${out.drafted || 0} drafts • ${out.sentInitial || 0} sent`);
      await load();
    } catch (error) {
      toast(error.message || 'Agent run failed');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function load() {
    const host = document.querySelector('[data-campaign-control-center]');
    if (host) host.innerHTML = '<div class="cc-loading">Loading live campaign data…</div>';
    try {
      const [status, prospects, drafts, escalations] = await Promise.all([
        api('/api/autopilot/status'),
        api('/api/prospects?limit=200'),
        api('/api/autopilot/drafts?limit=100'),
        api('/api/escalations?limit=50')
      ]);
      state.status = status;
      state.prospects = prospects.prospects || [];
      state.drafts = drafts.drafts || [];
      state.escalations = escalations.escalations || [];
      if (!state.selectedId || !state.prospects.some(p => p.id === state.selectedId)) {
        state.selectedId = state.prospects.find(isReady)?.id || state.prospects[0]?.id || null;
      }
      render();
    } catch (error) {
      if (host) host.innerHTML = `<div class="cc-error"><strong>Campaign Control Center could not load.</strong><span>${esc(error.message)}</span></div>`;
    }
  }

  function install() {
    const view = document.querySelector('[data-view="campaigns"]');
    if (!view || view.querySelector('[data-campaign-control-center]')) return;
    const panel = document.createElement('div');
    panel.dataset.campaignControlCenter = 'true';
    const note = view.querySelector('.queue-note');
    if (note) note.after(panel); else view.prepend(panel);
    injectStyles();
    load();
  }

  function injectStyles() {
    if (document.querySelector('#campaign-control-center-styles')) return;
    const style = document.createElement('style');
    style.id = 'campaign-control-center-styles';
    style.textContent = `
      [data-campaign-control-center]{margin:14px 0 18px}.cc-shell{border:1px solid var(--line);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.008));padding:16px}.cc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.cc-top h2{margin:3px 0 5px;font-size:24px}.cc-top p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}.cc-mode-box{min-width:116px;padding:10px 12px;border:1px solid var(--line);border-radius:15px;background:var(--surface);text-align:right}.cc-mode-box span,.cc-mode-box small{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.cc-mode-box strong{display:block;font-size:18px;margin:2px 0}.cc-metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:14px}.cc-metric{padding:10px 6px;border:1px solid var(--line);border-radius:13px;text-align:center;background:var(--surface)}.cc-metric strong{display:block;font-size:20px}.cc-metric span{display:block;color:var(--muted);font-size:9px;margin-top:2px}.cc-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:14px 0}.cc-filters,.cc-tools{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.cc-chip{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:999px;padding:8px 10px;font-size:11px;font-weight:800;cursor:pointer}.cc-chip.active{background:var(--surface-3);color:var(--text);border-color:#42577e}.cc-tools input{min-width:180px;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:11px;padding:10px 11px}.cc-tools button{min-height:39px}.cc-layout{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:12px}.cc-list{display:grid;gap:8px;align-content:start;max-height:660px;overflow:auto;padding-right:2px}.cc-prospect{width:100%;text-align:left;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:15px;padding:12px;cursor:pointer}.cc-prospect.selected{border-color:#526d9d;background:var(--surface-2)}.cc-prospect-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.cc-prospect-name{font-weight:850;line-height:1.25}.cc-prospect-sub{font-size:10px;color:var(--muted);margin-top:4px;line-height:1.35}.cc-prospect-meta{display:flex;gap:9px;flex-wrap:wrap;color:var(--muted);font-size:9px;margin-top:9px}.cc-prospect-meta strong{color:var(--text)}.cc-pill{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid var(--line);border-radius:999px;padding:5px 7px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.cc-ready{color:#8ce1b2}.cc-manual{color:#ffd37f}.cc-current{color:#b8d0ff}.cc-stopped{color:#ff9ea5}.cc-research{color:#c6b8ff}.cc-detail{border:1px solid var(--line);border-radius:17px;background:var(--surface);padding:15px;min-width:0}.cc-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.cc-detail h3{font-size:21px;margin:3px 0}.cc-detail-sub{color:var(--muted);font-size:11px}.cc-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.cc-detail-grid>div{border:1px solid var(--line);border-radius:11px;padding:9px}.cc-detail-grid span,.cc-draft-head span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.08em}.cc-detail-grid strong{display:block;font-size:11px;margin-top:3px;word-break:break-word}.cc-mode-note{display:grid;gap:4px;border:1px solid rgba(184,208,255,.2);background:rgba(184,208,255,.05);border-radius:12px;padding:10px;margin-top:12px}.cc-mode-note strong{font-size:11px}.cc-mode-note span{font-size:10px;color:var(--muted);line-height:1.4}.cc-section-label{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:15px 0 8px}.cc-timeline{display:grid;gap:2px}.cc-stage{display:grid;grid-template-columns:14px 1fr;gap:8px;padding:6px 0}.cc-stage i{width:10px;height:10px;border-radius:50%;margin-top:3px;background:#4b5563;border:2px solid #4b5563}.cc-stage.done i{background:#8ce1b2;border-color:#8ce1b2}.cc-stage.active i{background:var(--accent-2);border-color:var(--accent-2);box-shadow:0 0 12px rgba(184,208,255,.35)}.cc-stage strong{display:block;font-size:11px}.cc-stage span{display:block;color:var(--muted);font-size:9px;line-height:1.35;margin-top:2px}.cc-evidence-copy{font-size:11px;line-height:1.5}.secondary-copy{color:var(--muted);margin-top:7px}.cc-source-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.cc-source-list a,.cc-source-list span{font-size:9px;border:1px solid var(--line);border-radius:999px;padding:5px 7px;color:var(--muted);text-decoration:none}.cc-actions{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:7px;margin-top:14px}.cc-actions button{min-height:42px}.cc-draft-wrap{border-top:1px solid var(--line);margin-top:14px;padding-top:12px}.cc-draft-head{display:grid;grid-template-columns:1fr 2fr;gap:10px}.cc-draft-head strong{display:block;font-size:10px;margin-top:3px;word-break:break-word}.cc-draft-wrap pre{white-space:pre-wrap;font-family:inherit;font-size:10px;line-height:1.55;color:var(--muted);border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0 0;background:var(--surface-2);max-height:360px;overflow:auto}.cc-empty,.cc-loading,.cc-error{padding:20px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);font-size:11px}.cc-error{display:grid;gap:5px;color:#ff9ea5}.cc-foot{font-size:9px;color:var(--muted);margin-top:10px;text-align:right}@media(max-width:760px){.cc-metrics{grid-template-columns:repeat(3,1fr)}.cc-layout{grid-template-columns:1fr}.cc-list{max-height:none}.cc-toolbar{align-items:stretch;flex-direction:column}.cc-tools input{flex:1;min-width:0}.cc-actions{grid-template-columns:1fr}.cc-top{flex-direction:column}.cc-mode-box{width:100%;text-align:left}.cc-draft-head{grid-template-columns:1fr}.cc-detail-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  const observer = new MutationObserver(() => {
    const campaigns = document.querySelector('[data-view="campaigns"]');
    if (campaigns && !campaigns.querySelector('[data-campaign-control-center]')) install();
    if (campaigns?.classList.contains('active') && campaigns.querySelector('[data-campaign-control-center]') && !state.status) load();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  window.addEventListener('load', install);
  setTimeout(install, 0);
})();
