(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const PREF = 'PERFORMING';

  const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const roomKey = r => [r['Operator / Group'], r['Property / Venue'], r['Room / Surface']].map(norm).join('|');

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function isVenueSpecific(c) {
    if (c.Lane === 'Working Room') return true;
    const category = norm(c.Category);
    return category.includes('venue') || category.includes('direct submission') || category.includes('casino hotel venue');
  }

  function matchingVenueContacts(row) {
    const data = window.BOOKING_DATA;
    if (!data?.contacts?.length) return [];
    const property = norm(row['Property / Venue']);
    const roomText = norm(`${row['Property / Venue'] || ''} ${row['Room / Surface'] || ''}`);
    return data.contacts.filter(c => {
      if (!isVenueSpecific(c)) return false;
      const entity = norm(c.Entity);
      return !!entity && !!roomText && (roomText.includes(entity) || entity.includes(property));
    });
  }

  function markCurrentVenue(row) {
    const state = readState();
    state.roomPrefs ||= {};
    state.overrides ||= {};
    state.queue ||= [];
    state.roomCurrentContacts ||= {};

    const key = roomKey(row);
    state.roomPrefs[key] = PREF;
    const previous = state.roomCurrentContacts[key] || {};

    matchingVenueContacts(row).forEach(c => {
      const id = c['Contact ID'];
      const override = state.overrides[id] || {};
      if (!(id in previous)) previous[id] = override.Status ?? c.Status ?? 'Not contacted';
      state.overrides[id] = {
        ...override,
        Status: 'Booked',
        'Current Venue': true
      };
      state.queue = state.queue.filter(q => q !== id);
    });

    state.roomCurrentContacts[key] = previous;
    writeState(state);
  }

  function clearCurrentVenue(row) {
    const state = readState();
    const key = roomKey(row);
    const previous = state.roomCurrentContacts?.[key] || {};

    Object.entries(previous).forEach(([id, oldStatus]) => {
      const override = state.overrides?.[id];
      if (!override) return;
      const restored = { ...override, Status: oldStatus };
      delete restored['Current Venue'];
      state.overrides[id] = restored;
    });

    if (state.roomCurrentContacts) delete state.roomCurrentContacts[key];
    writeState(state);
  }

  function rowForKey(key) {
    return window.BOOKING_DATA?.buyerMap?.find(r => roomKey(r) === key) || null;
  }

  function decorateRooms() {
    const state = readState();
    document.querySelectorAll('.room-card').forEach(card => {
      const prefWrap = card.querySelector('.pref-buttons');
      const anyPref = prefWrap?.querySelector('[data-room-key]');
      if (!prefWrap || !anyPref) return;
      const key = anyPref.dataset.roomKey;
      const current = state.roomPrefs?.[key] === PREF;

      let btn = prefWrap.querySelector('[data-room-current]');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pref-btn';
        btn.dataset.roomCurrent = 'true';
        btn.dataset.roomKey = key;
        btn.textContent = '✓ Already Playing Here';
        prefWrap.prepend(btn);
      }

      btn.classList.toggle('active', current);
      card.classList.toggle('current-venue', current);

      if (current) {
        prefWrap.querySelectorAll('[data-room-pref]').forEach(b => b.classList.remove('active'));
        const badge = card.querySelector('.fit-badge');
        if (badge) {
          badge.className = 'fit-badge current-venue-badge';
          badge.textContent = 'Current Venue';
        }
        const reason = card.querySelector('.room-reason');
        if (reason) reason.textContent = 'Already performing here — removed from prospecting. Buyer relationship stays active for other rooms.';
        else {
          const buyer = card.querySelector('.room-buyer');
          if (buyer) {
            const note = document.createElement('div');
            note.className = 'room-reason current-venue-note';
            note.textContent = 'Already performing here — removed from prospecting. Buyer relationship stays active for other rooms.';
            buyer.before(note);
          }
        }
      } else {
        card.querySelector('.current-venue-note')?.remove();
      }
    });
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .room-card.current-venue{border-color:rgba(120,167,255,.55);background:linear-gradient(145deg,rgba(120,167,255,.08),var(--surface) 58%)}
      .pref-btn[data-room-current].active{background:rgba(120,167,255,.18);border-color:rgba(120,167,255,.55);color:#cfe0ff}
      .current-venue-badge{color:#cfe0ff;border-color:rgba(120,167,255,.48);background:rgba(120,167,255,.12)}
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', e => {
    const currentBtn = e.target.closest('[data-room-current]');
    if (currentBtn) {
      e.preventDefault();
      e.stopPropagation();
      const row = rowForKey(currentBtn.dataset.roomKey);
      if (!row) return;
      const state = readState();
      if (state.roomPrefs?.[currentBtn.dataset.roomKey] === PREF) {
        clearCurrentVenue(row);
        state.roomPrefs ||= {};
        delete state.roomPrefs[currentBtn.dataset.roomKey];
        writeState({ ...readState(), roomPrefs: state.roomPrefs });
      } else {
        markCurrentVenue(row);
      }
      window.location.reload();
      return;
    }

    const prefBtn = e.target.closest('[data-room-pref]');
    if (prefBtn) {
      const state = readState();
      if (state.roomPrefs?.[prefBtn.dataset.roomKey] === PREF) {
        const row = rowForKey(prefBtn.dataset.roomKey);
        if (row) clearCurrentVenue(row);
      }
    }
  }, true);

  injectStyles();
  const observer = new MutationObserver(decorateRooms);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener('load', decorateRooms);
  setTimeout(decorateRooms, 0);
})();
