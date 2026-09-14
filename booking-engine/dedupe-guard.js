(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function writeState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function mergedContact(id) {
    const base = window.BOOKING_DATA?.contacts?.find(c => c['Contact ID'] === id);
    if (!base) return null;
    return { ...base, ...(readState().overrides?.[id] || {}) };
  }

  function canonicalKey(c) {
    const email = String(c?.Email || '').trim().toLowerCase();
    if (email) return `email:${email}`;
    const phone = String(c?.Phone || '').replace(/\D/g, '');
    if (phone.length >= 7) return `phone:${phone}`;
    const person = norm(c?.Contact);
    const operator = norm(c?.Operator);
    if (person && !/booking|management|department|submission|entertainment/.test(person)) return `person:${person}|${operator}`;
    return `contact:${norm(c?.Entity)}|${person}|${operator}`;
  }

  function dedupeQueue() {
    const state = readState();
    const queue = state.queue || [];
    const groups = new Map();

    queue.forEach((id, index) => {
      const c = mergedContact(id);
      if (!c) return;
      const key = canonicalKey(c);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ id, c, index });
    });

    const kept = [];
    const suppressed = {};
    const contexts = {};

    groups.forEach(items => {
      items.sort((a, b) => a.index - b.index);
      const primary = items[0];
      kept.push(primary.id);
      const related = items.slice(1);
      if (!related.length) return;

      contexts[primary.id] = {
        grouped: true,
        canonicalKey: canonicalKey(primary.c),
        relatedContactIds: related.map(x => x.id),
        relatedEntities: related.map(x => x.c.Entity).filter(Boolean),
        allEntities: [primary.c.Entity, ...related.map(x => x.c.Entity)].filter(Boolean)
      };
      related.forEach(item => { suppressed[item.id] = primary.id; });
    });

    kept.sort((a, b) => queue.indexOf(a) - queue.indexOf(b));
    state.queue = kept;
    state.dedupeSuppressed = suppressed;
    state.campaignContexts = { ...(state.campaignContexts || {}), ...contexts };
    state.lastDedupe = {
      at: new Date().toISOString(),
      originalCount: queue.length,
      finalCount: kept.length,
      suppressedCount: queue.length - kept.length
    };
    writeState(state);
    return state.lastDedupe;
  }

  function decorateCampaigns() {
    const view = document.querySelector('[data-view="campaigns"]');
    if (!view) return;
    let note = view.querySelector('[data-dedupe-note]');
    const info = readState().lastDedupe;
    if (!info?.suppressedCount) {
      note?.remove();
      return;
    }
    if (!note) {
      note = document.createElement('div');
      note.dataset.dedupeNote = 'true';
      note.className = 'dedupe-note';
      const legend = view.querySelector('.campaign-legend');
      if (legend) legend.after(note); else view.prepend(note);
    }
    note.textContent = `${info.suppressedCount} duplicate room pitch${info.suppressedCount === 1 ? '' : 'es'} grouped under the same buyer/contact.`;
  }

  function decorateCards() {
    const state = readState();
    document.querySelectorAll('[data-view="campaigns"] [data-campaign-id]').forEach(card => {
      const id = card.dataset.campaignId;
      const context = state.campaignContexts?.[id];
      if (!context?.relatedEntities?.length || card.querySelector('[data-grouped-rooms]')) return;
      const box = document.createElement('div');
      box.dataset.groupedRooms = 'true';
      box.className = 'grouped-rooms';
      box.innerHTML = `<strong>One buyer, multiple rooms</strong><span>${context.allEntities.map(escapeHtml).join(' · ')}</span>`;
      const controls = card.querySelector('.campaign-controls');
      if (controls) controls.before(box); else card.appendChild(box);
    });
  }

  function escapeHtml(v) {
    return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function injectStyles() {
    if (document.querySelector('#dedupe-guard-styles')) return;
    const style = document.createElement('style');
    style.id = 'dedupe-guard-styles';
    style.textContent = `
      .dedupe-note{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(99,210,151,.22);background:rgba(99,210,151,.06);border-radius:12px;color:#8ce1b2;font-size:12px;font-weight:750}.grouped-rooms{display:grid;gap:4px;margin-top:12px;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:var(--surface-2);font-size:11px}.grouped-rooms strong{color:#c9d9f7}.grouped-rooms span{color:var(--muted);line-height:1.4}`;
    document.head.appendChild(style);
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('#buildCampaignsButton');
    if (!btn) return;
    const info = dedupeQueue();
    if (info.suppressedCount) toast(`${info.suppressedCount} duplicate pitch${info.suppressedCount === 1 ? '' : 'es'} grouped`);
    setTimeout(() => {
      decorateCampaigns();
      decorateCards();
    }, 30);
  }, true);

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1700);
  }

  injectStyles();
  const observer = new MutationObserver(() => {
    decorateCampaigns();
    decorateCards();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => {
    decorateCampaigns();
    decorateCards();
  }, 0);

  window.BookingDedupe = { dedupeQueue, canonicalKey };
})();
