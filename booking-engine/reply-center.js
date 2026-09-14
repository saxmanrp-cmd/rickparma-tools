(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function writeState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function contacts() {
    const state = readState();
    return (window.BOOKING_DATA?.contacts || []).map(c => ({ ...c, ...(state.overrides?.[c['Contact ID']] || {}) }));
  }

  function setStatus(id, status) {
    const state = readState();
    state.overrides ||= {};
    state.overrides[id] = { ...(state.overrides[id] || {}), Status: status, 'Next Follow-up': null };
    if (state.campaigns?.[id]) state.campaigns[id].active = false;
    writeState(state);
    render();
    toast(status === 'Booked' ? 'Booked 🎷' : 'Updated');
  }

  function openLead(c) {
    document.querySelector('[data-nav="leads"]')?.click();
    setTimeout(() => {
      const search = document.querySelector('#leadSearch');
      if (search) {
        search.value = c.Entity || '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      setTimeout(() => document.querySelector(`[data-contact-id="${CSS.escape(c['Contact ID'])}"]`)?.click(), 30);
    }, 30);
  }

  function replyCard(c) {
    const note = c['CRM Note'] ? `<div class="reply-note">${escapeHtml(c['CRM Note'])}</div>` : '';
    return `
      <article class="reply-card" data-reply-id="${escapeHtml(c['Contact ID'])}">
        <div><span class="reply-kicker">REPLIED</span><strong>${escapeHtml(c.Entity)}</strong><small>${escapeHtml([c.Contact, c.Role].filter(Boolean).join(' • ') || c.Lane || '')}</small></div>
        ${note}
        <div class="reply-actions">
          <button class="secondary" data-reply-open="${escapeHtml(c['Contact ID'])}">Open Lead</button>
          <button class="primary" data-reply-booked="${escapeHtml(c['Contact ID'])}">Booked</button>
          <button class="secondary" data-reply-pass="${escapeHtml(c['Contact ID'])}">Pass</button>
        </div>
      </article>`;
  }

  function winCard(c) {
    return `<div class="win-row"><span>✓</span><div><strong>${escapeHtml(c.Entity)}</strong><small>${escapeHtml(c.Contact || c.Lane || '')}</small></div></div>`;
  }

  function render() {
    const view = document.querySelector('[data-view="campaigns"]');
    if (!view) return;
    let host = view.querySelector('[data-reply-center]');
    if (!host) {
      host = document.createElement('div');
      host.dataset.replyCenter = 'true';
      const metrics = view.querySelector('#campaignMetrics');
      if (metrics) metrics.after(host); else view.prepend(host);
    }

    const all = contacts();
    const replies = all.filter(c => c.Status === 'Replied');
    const wins = all.filter(c => c.Status === 'Booked').slice(0, 8);

    host.innerHTML = `
      ${replies.length ? `<section class="reply-section"><div class="reply-heading"><div><span class="eyebrow">NEEDS YOU</span><h3>Hot Replies</h3></div><span>${replies.length}</span></div><div class="reply-grid">${replies.map(replyCard).join('')}</div></section>` : ''}
      ${wins.length ? `<section class="wins-section"><div class="reply-heading"><div><span class="eyebrow">WINS</span><h3>Booked</h3></div><span>${wins.length}</span></div><div class="wins-list">${wins.map(winCard).join('')}</div></section>` : ''}`;

    host.querySelectorAll('[data-reply-open]').forEach(btn => btn.onclick = () => {
      const c = all.find(x => x['Contact ID'] === btn.dataset.replyOpen);
      if (c) openLead(c);
    });
    host.querySelectorAll('[data-reply-booked]').forEach(btn => btn.onclick = () => setStatus(btn.dataset.replyBooked, 'Booked'));
    host.querySelectorAll('[data-reply-pass]').forEach(btn => btn.onclick = () => setStatus(btn.dataset.replyPass, 'Pass'));
  }

  function escapeHtml(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1600);
  }

  function injectStyles() {
    if (document.querySelector('#reply-center-styles')) return;
    const style = document.createElement('style');
    style.id = 'reply-center-styles';
    style.textContent = `
      .reply-section,.wins-section{margin:0 0 18px;padding:16px;border:1px solid var(--line);border-radius:20px;background:var(--surface)}.reply-section{border-color:rgba(242,190,97,.28)}.reply-heading{display:flex;justify-content:space-between;align-items:end;margin-bottom:11px}.reply-heading h3{margin:3px 0 0}.reply-heading>span{display:grid;place-items:center;min-width:30px;height:30px;border-radius:999px;background:var(--surface-3);font-weight:900}.reply-grid{display:grid;gap:9px}.reply-card{padding:13px;border:1px solid var(--line);border-radius:15px;background:var(--surface-2)}.reply-card strong{display:block;font-size:16px;margin-top:5px}.reply-card small{display:block;color:var(--muted);margin-top:3px}.reply-kicker{color:#ffd37f;font-size:10px;font-weight:900;letter-spacing:.1em}.reply-note{margin-top:9px;color:var(--muted);font-size:12px;line-height:1.4}.reply-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:10px}.reply-actions button{min-height:40px}.wins-list{display:grid;gap:7px}.win-row{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:center;padding:9px;border-radius:12px;background:var(--surface-2)}.win-row>span{color:#8ce1b2;font-weight:900}.win-row strong{display:block;font-size:13px}.win-row small{display:block;color:var(--muted);font-size:11px;margin-top:2px}@media(max-width:520px){.reply-actions{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  injectStyles();
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', render);
  setTimeout(render, 0);
})();
