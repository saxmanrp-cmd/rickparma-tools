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
    busy: false,
    loading: false
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
    toast._timer = setTimeout(() => el.classList.remove('show'), 2000);
  }

  async function api(path, options) {
    if (!window.BookingCloud?.api) throw new Error('Cloud CRM is not connected yet.');
    return window.BookingCloud.api(path, options);
  }

  function modeLabel(mode) {
    return ({ off: 'Off', shadow: 'Shadow', pilot: 'Pilot', live: 'Live' })[mode] || String(mode || 'Unknown');
  }

  function sourceCount(p) { return Array.isArray(p?.sourceUrls) ? p.sourceUrls.length : 0; }

  function isReady(p) {
    const c = state.status?.config || {};
    return !Number(p.suppressed || 0)
      && !Number(p.current_venue || 0)
      && !['SKIP','PERFORMING'].includes(String(p.room_preference || ''))
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

  function draftFor(id) { return state.drafts.find(d => d.contact_id === id) || null; }
  function selectedProspect() { return state.prospects.find(p => p.id === state.selectedId) || null; }

  function parseDate(value) {
    if (!value) return null;
    const raw = String(value);
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value) {
    const d = parseDate(value);
    if (!d) return value || '—';
    const tz = state.status?.config?.timezone || 'America/Los_Angeles';
    return d.toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function counts() {
    return {
      all: state.prospects.length,
      ready: state.prospects.filter(isReady).length,
      manual: state.prospects.filter(p => bucket(p) === 'manual').length,
      research: state.prospects.filter(p => bucket(p) === 'research').length,
      current: state.prospects.filter(p => bucket(p) === 'current').length,
      drafts: state.drafts.length,
      needsRick: state.escalations.length
    };
  }

  function filteredProspects() {
    const q = state.search.toLowerCase().trim();
    return state.prospects
      .filter(p => state.filter === 'all' || bucket(p) === state.filter)
      .filter(p => !q || [p.entity,p.room,p.contact_name,p.contact_role,p.email,p.category]
        .some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a,b) => Number(b.fit_score || 0) - Number(a.fit_score || 0) || Number(b.confidence || 0) - Number(a.confidence || 0));
  }

  function pill(p) {
    const b = bucket(p);
    const labels = { ready:'Send-ready', manual:'Manual', current:'PERFORMING', research:'Researching', stopped:'Stopped', other:p.automation_safe || 'Open' };
    return `<span class="ccs-pill ccs-${esc(b)}">${esc(labels[b] || 'Open')}</span>`;
  }

  function card(p) {
    const d = draftFor(p.id);
    return `<button type="button" class="ccs-card ${p.id === state.selectedId ? 'selected' : ''}" data-ccs-select="${esc(p.id)}">
      <div class="ccs-card-top"><strong>${esc(p.entity || 'Unknown')}</strong>${pill(p)}</div>
      <span>${esc(p.room || p.category || p.profile || 'Booking opportunity')}</span>
      <small>Fit ${Number(p.fit_score || 0)} • Confidence ${Math.round(Number(p.confidence || 0)*100)}% • ${sourceCount(p)} sources${d ? ' • Draft ready' : ''}</small>
    </button>`;
  }

  function stages(p) {
    const draft = draftFor(p.id);
    const contacted = !!p.last_contacted_at || Number(p.touch_count || 0) > 0;
    const replied = ['Replied','Booked','Pass','Do not contact'].includes(String(p.status || ''));
    const ready = isReady(p);
    const mode = state.status?.config?.mode || 'shadow';
    return [
      ['Discovered', p.discovered_at ? `Found ${formatDate(p.discovered_at)}` : 'In CRM', true],
      ['Verified', p.verified_at ? `Evidence checked ${formatDate(p.verified_at)}` : 'Waiting for second pass', !!p.verified_at],
      ['Drafted', draft ? 'Personalized outreach ready' : ready ? 'Waiting for draft generation' : 'Draft waits for eligibility', !!draft],
      ['Initial outreach', contacted ? `Contacted ${formatDate(p.last_contacted_at)}` : mode === 'shadow' ? 'Shadow stops here — no send' : ready ? 'Eligible under sending rules' : 'Blocked by safeguards', contacted],
      ['Follow-ups', contacted ? `Touch ${Number(p.touch_count || 0)}${p.next_action_at ? ` • next ${formatDate(p.next_action_at)}` : ''}` : 'Days 5, 10, 16 and 75', Number(p.touch_count || 0) > 1],
      ['Reply / decision', replied ? String(p.status || '') : 'Business decisions route to Needs Rick', replied]
    ];
  }

  function detail(p) {
    if (!p) return '<div class="ccs-empty">Select a prospect.</div>';
    const d = draftFor(p.id);
    const sourceLinks = (p.sourceUrls || []).filter(u => /^https?:\/\//i.test(String(u || '')));
    const mode = state.status?.config?.mode || 'shadow';
    return `<div class="ccs-detail-head"><div><div class="eyebrow">SELECTED CAMPAIGN</div><h3>${esc(p.entity || '')}</h3><span>${esc(p.room || p.category || '')}</span></div>${pill(p)}</div>
      <div class="ccs-grid"><div><span>Fit</span><strong>${Number(p.fit_score || 0)} / 100</strong></div><div><span>Confidence</span><strong>${Math.round(Number(p.confidence || 0)*100)}%</strong></div><div><span>Contact</span><strong>${esc(p.contact_name || 'No verified name')}</strong></div><div><span>Email</span><strong>${esc(p.email || 'No verified email')}</strong></div></div>
      <div class="ccs-mode"><strong>${state.pilotPreview && mode === 'shadow' ? 'Pilot preview' : modeLabel(mode)}</strong><span>${mode === 'shadow' ? 'Research, verification and drafting only. No prospect sends.' : 'Daily limits and send-window rules apply.'}</span></div>
      <div class="ccs-label">Campaign flow</div>
      <div class="ccs-flow">${stages(p).map(([label,note,done]) => `<div class="ccs-stage ${done ? 'done' : ''}"><i></i><div><strong>${esc(label)}</strong><span>${esc(note)}</span></div></div>`).join('')}</div>
      <div class="ccs-label">Why this prospect</div><p class="ccs-copy">${esc(p.fit_reason || p.evidence_summary || 'No research summary yet.')}</p>
      ${p.evidence_summary && p.evidence_summary !== p.fit_reason ? `<p class="ccs-copy muted">${esc(p.evidence_summary)}</p>` : ''}
      <div class="ccs-sources">${sourceLinks.length ? sourceLinks.map((u,i) => `<a href="${esc(u)}" target="_blank" rel="noopener">Source ${i+1} ↗</a>`).join('') : '<span>No stored source yet.</span>'}</div>
      <div class="ccs-actions"><button type="button" class="primary" data-ccs-draft ${d ? '' : 'disabled'}>${d ? 'View Draft' : 'No Draft Yet'}</button><button type="button" class="secondary" data-ccs-refresh>Refresh</button><button type="button" class="secondary" data-ccs-settings>Agent Settings</button></div>
      ${d ? `<div class="ccs-draft" data-ccs-draft-panel hidden><div><span>From</span><strong>booking@rickparma.com</strong></div><div><span>Subject</span><strong>${esc(d.subject || '')}</strong></div><pre>${esc(d.body || '')}</pre></div>` : ''}`;
  }

  function render() {
    const host = document.querySelector('[data-campaign-control-center-safe]');
    if (!host) return;
    const c = counts();
    const rows = filteredProspects();
    const mode = state.status?.config?.mode || 'shadow';
    host.innerHTML = `<div class="ccs-shell">
      <div class="ccs-top"><div><div class="eyebrow">LIVE AUTOPILOT CAMPAIGNS</div><h2>Campaign Control Center</h2><p>Real CRM prospects, evidence, Shadow drafts and Needs Rick handoffs.</p></div><div class="ccs-modebox"><span>Mode</span><strong>${esc(modeLabel(mode))}</strong><small>${mode === 'shadow' ? 'No prospect sends' : esc(state.status?.readiness?.sendBlocker || 'Autonomous limits active')}</small></div></div>
      <div class="ccs-metrics">${[['Prospects',c.all],['Send-ready',c.ready],['Manual',c.manual],['Researching',c.research],['Current',c.current],['Drafts',c.drafts],['Needs Rick',c.needsRick]].map(([l,n]) => `<div><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>
      <div class="ccs-toolbar"><div>${[['all','All'],['ready','Ready'],['manual','Manual'],['research','Researching'],['current','Playing Here']].map(([v,l]) => `<button type="button" class="ccs-chip ${state.filter===v?'active':''}" data-ccs-filter="${v}">${l}</button>`).join('')}</div><div><input type="search" data-ccs-search value="${esc(state.search)}" placeholder="Search campaigns…"><button type="button" class="secondary" data-ccs-run ${state.busy?'disabled':''}>${state.busy?'Running…':'Run Agent'}</button><button type="button" class="secondary" data-ccs-research ${state.busy?'disabled':''}>Research</button>${mode==='shadow'?`<button type="button" class="secondary" data-ccs-preview>${state.pilotPreview?'Exit Pilot Preview':'Preview Pilot'}</button>`:''}</div></div>
      <div class="ccs-layout"><div class="ccs-list">${rows.length ? rows.map(card).join('') : '<div class="ccs-empty">No prospects match this view.</div>'}</div><div class="ccs-detail">${detail(selectedProspect())}</div></div>
      <div class="ccs-foot">${state.status?.latestRun?.startedAt ? `Last agent run: ${esc(formatDate(state.status.latestRun.startedAt))}` : 'No completed agent run yet.'}</div>
    </div>`;
    wire(host);
  }

  function wire(host) {
    host.querySelectorAll('[data-ccs-filter]').forEach(btn => btn.addEventListener('click', () => { state.filter = btn.dataset.ccsFilter; const rows = filteredProspects(); if (!rows.some(p => p.id === state.selectedId)) state.selectedId = rows[0]?.id || null; render(); }));
    host.querySelector('[data-ccs-search]')?.addEventListener('input', e => { state.search = e.target.value; const rows = filteredProspects(); if (!rows.some(p => p.id === state.selectedId)) state.selectedId = rows[0]?.id || null; render(); requestAnimationFrame(() => document.querySelector('[data-ccs-search]')?.focus()); });
    host.querySelectorAll('[data-ccs-select]').forEach(btn => btn.addEventListener('click', () => { state.selectedId = btn.dataset.ccsSelect; render(); }));
    host.querySelector('[data-ccs-draft]')?.addEventListener('click', () => { const panel = host.querySelector('[data-ccs-draft-panel]'); if (panel) panel.hidden = !panel.hidden; });
    host.querySelector('[data-ccs-refresh]')?.addEventListener('click', load);
    host.querySelector('[data-ccs-settings]')?.addEventListener('click', () => document.querySelector('[data-nav="settings"]')?.click());
    host.querySelector('[data-ccs-preview]')?.addEventListener('click', () => { state.pilotPreview = !state.pilotPreview; render(); });
    host.querySelector('[data-ccs-run]')?.addEventListener('click', () => runAgent(false));
    host.querySelector('[data-ccs-research]')?.addEventListener('click', () => runAgent(true));
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    const host = document.querySelector('[data-campaign-control-center-safe]');
    if (host) host.innerHTML = '<div class="ccs-empty">Loading live campaign data…</div>';
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
      if (!state.selectedId || !state.prospects.some(p => p.id === state.selectedId)) state.selectedId = state.prospects.find(isReady)?.id || state.prospects[0]?.id || null;
      render();
    } catch (error) {
      if (host) host.innerHTML = `<div class="ccs-empty"><strong>Campaign Control Center could not load.</strong><br>${esc(error.message || 'Unknown error')}</div>`;
    } finally {
      state.loading = false;
    }
  }

  async function runAgent(forceResearch) {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const result = await api('/api/autopilot/run', { method:'POST', body:{ forceResearch } });
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

  function injectStyles() {
    if (document.querySelector('#campaign-control-center-safe-styles')) return;
    const style = document.createElement('style');
    style.id = 'campaign-control-center-safe-styles';
    style.textContent = `
      [data-campaign-control-center-safe]{margin:14px 0 18px}.ccs-shell{border:1px solid var(--line);border-radius:22px;padding:16px;background:rgba(255,255,255,.015)}.ccs-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.ccs-top h2{font-size:24px;margin:3px 0 5px}.ccs-top p{font-size:12px;margin:0}.ccs-modebox{min-width:118px;border:1px solid var(--line);border-radius:15px;padding:10px 12px;background:var(--surface)}.ccs-modebox span,.ccs-modebox small{display:block;color:var(--muted);font-size:9px}.ccs-modebox strong{display:block;font-size:18px;margin:2px 0}.ccs-metrics{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin:14px 0}.ccs-metrics>div{border:1px solid var(--line);border-radius:12px;padding:9px 6px;text-align:center;background:var(--surface)}.ccs-metrics strong{display:block;font-size:18px}.ccs-metrics span{display:block;font-size:9px;color:var(--muted);margin-top:2px}.ccs-toolbar{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px}.ccs-toolbar>div{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.ccs-toolbar input{min-width:180px;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:11px;padding:10px}.ccs-chip{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:999px;padding:8px 10px;font-size:11px;font-weight:800}.ccs-chip.active{background:var(--surface-3);color:var(--text)}.ccs-layout{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:12px}.ccs-list{display:grid;gap:8px;align-content:start;max-height:660px;overflow:auto}.ccs-card{width:100%;text-align:left;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:15px;padding:12px}.ccs-card.selected{border-color:#526d9d;background:var(--surface-2)}.ccs-card-top{display:flex;justify-content:space-between;gap:8px}.ccs-card>span,.ccs-card small{display:block;color:var(--muted);margin-top:5px;font-size:10px}.ccs-pill{border:1px solid var(--line);border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;white-space:nowrap}.ccs-ready{color:#8ce1b2}.ccs-manual{color:#ffd37f}.ccs-current{color:#b8d0ff}.ccs-research{color:#c6b8ff}.ccs-stopped{color:#ff9ea5}.ccs-detail{border:1px solid var(--line);border-radius:17px;background:var(--surface);padding:15px;min-width:0}.ccs-detail-head{display:flex;justify-content:space-between;gap:10px}.ccs-detail-head h3{font-size:21px;margin:3px 0}.ccs-detail-head span{color:var(--muted);font-size:10px}.ccs-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.ccs-grid>div{border:1px solid var(--line);border-radius:11px;padding:9px}.ccs-grid span,.ccs-draft span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase}.ccs-grid strong{display:block;font-size:11px;margin-top:3px;word-break:break-word}.ccs-mode{border:1px solid rgba(184,208,255,.2);border-radius:12px;padding:10px;margin-top:12px}.ccs-mode strong,.ccs-mode span{display:block;font-size:10px}.ccs-mode span{color:var(--muted);margin-top:3px}.ccs-label{font-size:10px;font-weight:900;text-transform:uppercase;color:var(--muted);margin:15px 0 8px}.ccs-stage{display:grid;grid-template-columns:14px 1fr;gap:8px;padding:6px 0}.ccs-stage i{width:10px;height:10px;border-radius:50%;background:#4b5563;margin-top:3px}.ccs-stage.done i{background:#8ce1b2}.ccs-stage strong{display:block;font-size:11px}.ccs-stage span{display:block;color:var(--muted);font-size:9px;margin-top:2px}.ccs-copy{font-size:11px;line-height:1.45}.ccs-copy.muted{color:var(--muted)}.ccs-sources{display:flex;gap:6px;flex-wrap:wrap}.ccs-sources a,.ccs-sources span{font-size:9px;border:1px solid var(--line);border-radius:999px;padding:5px 7px;color:var(--muted);text-decoration:none}.ccs-actions{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:7px;margin-top:14px}.ccs-draft{border-top:1px solid var(--line);margin-top:14px;padding-top:12px}.ccs-draft>div{margin-bottom:8px}.ccs-draft pre{white-space:pre-wrap;font-family:inherit;font-size:10px;line-height:1.5;color:var(--muted);border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface-2)}.ccs-empty{padding:20px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);font-size:11px}.ccs-foot{text-align:right;color:var(--muted);font-size:9px;margin-top:10px}@media(max-width:760px){.ccs-top,.ccs-toolbar{flex-direction:column}.ccs-modebox{width:100%}.ccs-metrics{grid-template-columns:repeat(3,1fr)}.ccs-layout{grid-template-columns:1fr}.ccs-list{max-height:none}.ccs-grid{grid-template-columns:1fr 1fr}.ccs-actions{grid-template-columns:1fr}.ccs-toolbar input{min-width:0;flex:1}}
    `;
    document.head.appendChild(style);
  }

  function install(attempt = 0) {
    const view = document.querySelector('[data-view="campaigns"]');
    if (!view) {
      if (attempt < 20) setTimeout(() => install(attempt + 1), 50);
      return;
    }
    if (view.querySelector('[data-campaign-control-center-safe]')) return;
    const old = view.querySelector('[data-campaign-control-center]');
    if (old) old.remove();
    const panel = document.createElement('div');
    panel.dataset.campaignControlCenterSafe = 'true';
    const note = view.querySelector('.queue-note');
    if (note) note.after(panel); else view.prepend(panel);
    injectStyles();
    load();
  }

  install();
})();
