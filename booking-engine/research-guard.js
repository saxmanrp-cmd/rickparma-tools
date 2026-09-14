(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const STALE_DAYS = 120;

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function mergedContacts() {
    const state = readState();
    return (window.BOOKING_DATA?.contacts || []).map(c => ({ ...c, ...(state.overrides?.[c['Contact ID']] || {}) }));
  }

  function ageDays(dateString) {
    if (!dateString) return Infinity;
    const d = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(d.getTime())) return Infinity;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function hasSubmission(c) {
    return !!window.BookingSubmissionChannel?.submissionInfo?.(c);
  }

  function issueFor(c) {
    const issues = [];
    const confidence = String(c.Confidence || '').toLowerCase();
    const sourceType = String(c['Source Type'] || '').toLowerCase();
    const stale = ageDays(c.Verified) > STALE_DAYS;
    const noRoute = !c.Email && !c.Phone && !hasSubmission(c);

    if (noRoute) issues.push('No usable outreach route');
    if (!c.Verified) issues.push('Not verified');
    else if (stale) issues.push(`Verification is ${ageDays(c.Verified)} days old`);
    if (/low|weak|unverified/.test(confidence)) issues.push(`Low confidence${c.Confidence ? ` (${c.Confidence})` : ''}`);
    if (/directory/.test(sourceType) && !/official/.test(sourceType)) issues.push('Directory-sourced contact');
    if (c.Lane === 'Research Gap') issues.push('Research gap');
    return issues;
  }

  function needsResearch(c) {
    if (!c) return false;
    if (['Booked', 'Pass', 'Do not contact'].includes(c.Status)) return false;
    if (c['Current Venue']) return false;
    return issueFor(c).length > 0;
  }

  function rows() {
    return mergedContacts()
      .filter(needsResearch)
      .map(c => ({ c, issues: issueFor(c) }))
      .sort((a, b) => {
        const aNoRoute = a.issues.includes('No usable outreach route') ? 0 : 1;
        const bNoRoute = b.issues.includes('No usable outreach route') ? 0 : 1;
        if (aNoRoute !== bNoRoute) return aNoRoute - bNoRoute;
        return String(a.c.Entity || '').localeCompare(String(b.c.Entity || ''));
      });
  }

  function removeResearchFromQueue() {
    const state = readState();
    const bad = new Set(rows().filter(r => r.issues.includes('No usable outreach route')).map(r => r.c['Contact ID']));
    if (!bad.size || !Array.isArray(state.queue)) return 0;
    const before = state.queue.length;
    state.queue = state.queue.filter(id => !bad.has(id));
    state.researchSuppressed = [...bad];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return before - state.queue.length;
  }

  function researchCard(row) {
    const { c, issues } = row;
    const source = /^https?:\/\//i.test(String(c['Source URL'] || '')) ? String(c['Source URL']) : '';
    return `
      <article class="research-card">
        <div><strong>${escapeHtml(c.Entity || 'Unknown')}</strong><span>${escapeHtml([c.Contact, c.Role].filter(Boolean).join(' • ') || c.Lane || '')}</span></div>
        <div class="research-issues">${issues.map(issue => `<span>${escapeHtml(issue)}</span>`).join('')}</div>
        <div class="research-actions">
          ${source ? `<a class="secondary" href="${escapeHtml(source)}" target="_blank" rel="noopener">Open Source</a>` : ''}
          <button class="secondary" data-research-open="${escapeHtml(c['Contact ID'])}">Open Lead</button>
        </div>
      </article>`;
  }

  function renderSection() {
    const view = document.querySelector('[data-view="campaigns"]');
    if (!view) return;
    const researchRows = rows();
    let section = view.querySelector('[data-research-guard]');
    if (!researchRows.length) {
      section?.remove();
      return;
    }

    const signature = researchRows.map(r => `${r.c['Contact ID']}:${r.issues.join('|')}`).join('||');
    if (section?.dataset.signature === signature) return;
    if (!section) {
      section = document.createElement('section');
      section.dataset.researchGuard = 'true';
      const list = view.querySelector('#campaignList');
      if (list) list.after(section); else view.appendChild(section);
    }
    section.dataset.signature = signature;
    section.className = 'research-section';
    section.innerHTML = `
      <div class="research-heading"><div><span class="eyebrow">CLEAN THE DATA</span><h3>Research Needed</h3></div><span>${researchRows.length}</span></div>
      <p>These are not safe to treat like normal campaign targets yet.</p>
      <div class="research-list">${researchRows.slice(0, 20).map(researchCard).join('')}</div>
      ${researchRows.length > 20 ? `<div class="research-more">+ ${researchRows.length - 20} more research records</div>` : ''}`;

    section.querySelectorAll('[data-research-open]').forEach(btn => btn.onclick = () => {
      const c = mergedContacts().find(x => x['Contact ID'] === btn.dataset.researchOpen);
      if (!c) return;
      document.querySelector('[data-nav="leads"]')?.click();
      setTimeout(() => {
        const search = document.querySelector('#leadSearch');
        if (search) {
          search.value = c.Entity || '';
          search.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 30);
    });
  }

  function decorateHome() {
    const dashboard = document.querySelector('[data-view="dashboard"]');
    const metricGrid = dashboard?.querySelector('#metricGrid');
    if (!metricGrid) return;
    let badge = dashboard.querySelector('[data-research-home]');
    const count = rows().length;
    if (!badge) {
      badge = document.createElement('button');
      badge.className = 'research-home-button';
      badge.dataset.researchHome = 'true';
      metricGrid.after(badge);
      badge.onclick = () => document.querySelector('[data-nav="campaigns"]')?.click();
    }
    const text = count ? `🔎 ${count} contacts need research before outreach` : '✓ Contact data is clean';
    if (badge.textContent !== text) badge.textContent = text;
    badge.classList.toggle('clean', count === 0);
  }

  function escapeHtml(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function injectStyles() {
    if (document.querySelector('#research-guard-styles')) return;
    const style = document.createElement('style');
    style.id = 'research-guard-styles';
    style.textContent = `
      .research-section{margin-top:24px;padding:16px;border:1px solid rgba(242,190,97,.23);border-radius:20px;background:var(--surface)}.research-section>p{font-size:13px;margin:4px 0 12px}.research-heading{display:flex;align-items:end;justify-content:space-between}.research-heading h3{margin:3px 0 0}.research-heading>span{display:grid;place-items:center;min-width:30px;height:30px;border-radius:999px;background:rgba(242,190,97,.12);color:#ffd37f;font-weight:900}.research-list{display:grid;gap:8px}.research-card{padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2)}.research-card strong{display:block;font-size:14px}.research-card>div>span{display:block;color:var(--muted);font-size:11px;margin-top:3px}.research-issues{display:flex!important;flex-wrap:wrap;gap:5px;margin-top:9px}.research-issues span{display:inline-flex!important;padding:5px 7px;border-radius:999px;background:rgba(242,190,97,.08);border:1px solid rgba(242,190,97,.2);color:#ffd37f!important;font-size:10px!important}.research-actions{display:flex;gap:7px;margin-top:9px}.research-actions .secondary{min-height:38px;font-size:11px}.research-more{color:var(--muted);font-size:11px;text-align:center;padding:10px}.research-home-button{width:100%;border:1px solid rgba(242,190,97,.22);background:rgba(242,190,97,.06);color:#ffd37f;border-radius:14px;padding:11px 13px;font-weight:800;cursor:pointer;margin:-12px 0 10px}.research-home-button.clean{border-color:rgba(99,210,151,.2);background:rgba(99,210,151,.05);color:#8ce1b2}`;
    document.head.appendChild(style);
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#findGigsButton') || e.target.closest('#rebuildQueueButton') || e.target.closest('#buildCampaignsButton')) {
      setTimeout(() => {
        const removed = removeResearchFromQueue();
        if (removed) toast(`${removed} no-route contact${removed === 1 ? '' : 's'} held for research`);
        renderSection();
        decorateHome();
      }, 15);
    }
  }, true);

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  injectStyles();
  const observer = new MutationObserver(() => {
    renderSection();
    decorateHome();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => {
    renderSection();
    decorateHome();
  }, 0);

  window.BookingResearchGuard = { rows, needsResearch, issueFor, removeResearchFromQueue };
})();
