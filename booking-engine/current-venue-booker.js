(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function writeState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function saveDetail(key, patch) {
    const state = readState();
    state.currentVenueDetails ||= {};
    state.currentVenueDetails[key] = { ...(state.currentVenueDetails[key] || {}), ...patch };
    writeState(state);
    toast('Current venue saved');
  }

  function detailFor(key) {
    return readState().currentVenueDetails?.[key] || {};
  }

  function decorate() {
    const state = readState();
    document.querySelectorAll('.room-card.current-venue').forEach(card => {
      const prefWrap = card.querySelector('.pref-buttons');
      const key = prefWrap?.querySelector('[data-room-key]')?.dataset.roomKey;
      if (!key || state.roomPrefs?.[key] !== 'PERFORMING') return;

      let panel = card.querySelector('[data-current-booker-panel]');
      if (!panel) {
        panel = document.createElement('div');
        panel.dataset.currentBookerPanel = 'true';
        panel.className = 'current-booker-panel';
        const d = detailFor(key);
        panel.innerHTML = `
          <div class="current-booker-title">Current booking relationship</div>
          <label>Booked through
            <input type="text" data-current-booker value="${escapeHtml(d.bookedThrough || '')}" placeholder="Justin Young Entertainment, venue direct, other booker…">
          </label>
          <label>Arrangement
            <select data-current-arrangement>
              ${['','Recurring','Occasional','One-off / Special Event'].map(v => `<option value="${escapeHtml(v)}" ${v === (d.arrangement || '') ? 'selected' : ''}>${escapeHtml(v || 'Choose…')}</option>`).join('')}
            </select>
          </label>
          <label>Note
            <input type="text" data-current-note value="${escapeHtml(d.note || '')}" placeholder="Anything to remember about this room">
          </label>`;
        prefWrap.before(panel);

        panel.querySelector('[data-current-booker]')?.addEventListener('change', e => saveDetail(key, { bookedThrough: e.target.value.trim() }));
        panel.querySelector('[data-current-arrangement]')?.addEventListener('change', e => saveDetail(key, { arrangement: e.target.value }));
        panel.querySelector('[data-current-note]')?.addEventListener('change', e => saveDetail(key, { note: e.target.value.trim() }));
      }
    });

    document.querySelectorAll('[data-current-booker-panel]').forEach(panel => {
      const card = panel.closest('.room-card');
      if (!card?.classList.contains('current-venue')) panel.remove();
    });
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
    toast._t = setTimeout(() => el.classList.remove('show'), 1400);
  }

  function injectStyles() {
    if (document.querySelector('#current-venue-booker-styles')) return;
    const style = document.createElement('style');
    style.id = 'current-venue-booker-styles';
    style.textContent = `
      .current-booker-panel{display:grid;grid-template-columns:1.3fr .8fr 1.2fr;gap:9px;padding:12px;margin-top:12px;border:1px solid rgba(120,167,255,.25);border-radius:14px;background:rgba(120,167,255,.06)}.current-booker-title{grid-column:1/-1;color:#cfe0ff;font-size:12px;font-weight:850}.current-booker-panel label{display:grid;gap:5px;color:var(--muted);font-size:10px;font-weight:750}.current-booker-panel input,.current-booker-panel select{width:100%;border:1px solid var(--line);background:#0d121d;color:var(--text);border-radius:10px;padding:9px;font-size:12px}@media(max-width:620px){.current-booker-panel{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  injectStyles();
  const observer = new MutationObserver(decorate);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', decorate);
  setTimeout(decorate, 0);
})();
