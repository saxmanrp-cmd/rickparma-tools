(async () => {
  'use strict';

  if (window.BOOKING_DATA_READY) await window.BOOKING_DATA_READY;
  const DATA = window.BOOKING_DATA || { contacts: [], buyerMap: [], researchGaps: [], profile: {} };
  const STORAGE_KEY = 'rick-booking-engine-v1';
  const STATUS_OPTIONS = ['Not contacted', 'Queued', 'Drafted', 'Sent', 'Replied', 'Follow-up', 'Booked', 'Pass', 'Do not contact'];
  const priorityRank = { A: 1, B: 2, C: 3 };
  const ROOM_PREFS = ['TARGET', 'MAYBE', 'OPEN', 'SKIP'];

  const defaultState = {
    overrides: {},
    queue: [],
    contactPrefs: {},
    roomPrefs: {},
    settings: {
      website: 'https://RickParma.com',
      epk: '',
      representation: DATA.profile?.representation || 'Booking coordination available through Justin Young Entertainment.',
      includeRepresentation: true
    }
  };

  let state = loadState();
  let currentView = 'dashboard';
  let leadFilter = 'all';
  let activeDraftId = null;
  let liveRoomRows = [];
  let liveRoomRowsFetchedAt = 0;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  injectRoomStyles();

  function injectRoomStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .room-card{padding:18px;border:1px solid var(--line);border-radius:20px;background:var(--surface)}
      .room-card.skip{opacity:.62}.room-card.target{border-color:rgba(99,210,151,.5)}
      .room-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.room-head strong{font-size:18px;line-height:1.25}
      .room-sub{display:block;color:var(--muted);font-size:13px;line-height:1.45;margin-top:5px}.room-buyer{margin-top:12px;padding:12px;border-radius:13px;background:var(--surface-2);font-size:13px;color:var(--muted);line-height:1.45}
      .pref-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:13px}.pref-btn{border:1px solid var(--line);background:var(--surface-3);color:var(--muted);border-radius:999px;padding:7px 10px;font-size:11px;font-weight:850;cursor:pointer}
      .pref-btn.active{color:#fff;border-color:#5571a4;background:#253552}.pref-btn[data-pref="TARGET"].active{background:rgba(99,210,151,.18);border-color:rgba(99,210,151,.5);color:#8ce1b2}.pref-btn[data-pref="SKIP"].active{background:rgba(240,122,131,.15);border-color:rgba(240,122,131,.45);color:#ff9ea5}
      .fit-badge{display:inline-flex;align-items:center;min-height:27px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:850;border:1px solid var(--line);white-space:nowrap}.fit-badge.solo{color:#8ce1b2;border-color:rgba(99,210,151,.32);background:rgba(99,210,151,.09)}.fit-badge.skip{color:#ff9ea5;border-color:rgba(240,122,131,.30);background:rgba(240,122,131,.08)}.fit-badge.open{color:#b8d0ff;border-color:#39517c;background:#1d2940}
      .room-reason{margin-top:8px;color:var(--muted);font-size:12px}.buyer-note{padding:12px 14px;border-radius:14px;background:rgba(120,167,255,.08);border:1px solid rgba(120,167,255,.2);color:#c9d9f7;font-size:13px;line-height:1.45;margin:14px 0}
    `;
    document.head.appendChild(style);
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return {
        ...defaultState,
        ...(saved || {}),
        settings: { ...defaultState.settings, ...(saved?.settings || {}) },
        overrides: saved?.overrides || {},
        queue: saved?.queue || [],
        contactPrefs: saved?.contactPrefs || {},
        roomPrefs: saved?.roomPrefs || {}
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function addDaysISO(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function fieldText(obj, names) { return names.map(n => obj?.[n]).filter(Boolean).join(' '); }

  function contactById(id) {
    const base = DATA.contacts.find(c => c['Contact ID'] === id);
    return base ? { ...base, ...(state.overrides[id] || {}) } : null;
  }
  function contacts() { return DATA.contacts.map(c => ({ ...c, ...(state.overrides[c['Contact ID']] || {}) })); }

  function setOverride(id, patch) {
    state.overrides[id] = { ...(state.overrides[id] || {}), ...patch };
    saveState(); renderAll();
  }

  function isDue(c) {
    const d = c['Next Follow-up'];
    return !!d && d <= todayISO() && !['Booked', 'Pass', 'Do not contact'].includes(c.Status);
  }

  function isVenueSpecific(c) {
    if (c.Lane === 'Working Room') return true;
    const category = norm(c.Category);
    return category.includes('venue') || category.includes('direct submission') || category.includes('casino hotel venue');
  }

  function seededContactPref(c) {
    if (!isVenueSpecific(c)) return { pref: 'OPEN', reason: '' };
    const entity = norm(c.Entity);
    if (entity.includes('maxan jazz')) return { pref: 'SKIP', reason: 'Personal room preference — do not pursue Maxan.' };
    if (entity.includes('vic s las vegas') || entity.includes('vics las vegas')) return { pref: 'SKIP', reason: 'Personal room preference — do not pursue Vic’s.' };
    if (entity.includes('ole red')) return { pref: 'SKIP', reason: 'Country-first room — not enough country material for the pitch.' };
    if (entity.includes('stoney s rockin country') || entity.includes('stoneys rockin country')) return { pref: 'SKIP', reason: 'Country-first room — not a current target.' };
    if (entity.includes('jason aldean')) return { pref: 'SKIP', reason: 'Country-first room — not a current target.' };
    if (entity.includes('gilley')) return { pref: 'SKIP', reason: 'Country-first room — not a current target.' };
    return { pref: 'OPEN', reason: '' };
  }

  function contactPref(c) {
    const custom = state.contactPrefs[c['Contact ID']];
    return custom ? { pref: custom, reason: custom === 'SKIP' ? 'Your room-level preference.' : '' } : seededContactPref(c);
  }

  function setContactPref(id, pref) {
    if (!ROOM_PREFS.includes(pref)) return;
    if (pref === 'OPEN') delete state.contactPrefs[id];
    else state.contactPrefs[id] = pref;
    if (pref === 'SKIP') state.queue = state.queue.filter(q => q !== id);
    saveState(); renderAll();
  }

  function soloFit(c) {
    const text = norm(fieldText(c, ['Entity', 'Lane', 'Category', 'Music Fit', 'Music Fit / Use', 'Fit', 'Notes', 'Properties / Rooms Covered']));
    let score = 0;
    const strong = ['solo', 'duo', 'lounge', 'cocktail', 'restaurant', 'bar', 'nightly', 'rotating musicians', 'local live', 'speakeasy', 'piano'];
    const musical = ['r b', 'soul', 'motown', 'top 40', 'pop', 'neo soul', 'vocals', 'sax'];
    strong.forEach(k => { if (text.includes(k)) score += 5; });
    musical.forEach(k => { if (text.includes(k)) score += 2; });
    if (c.Lane === 'Working Room') score += 8;
    if (text.includes('major touring') || text.includes('arena') || text.includes('festival')) score -= 8;
    return score;
  }

  function effectiveScore(c) {
    let score = Number(c['Campaign Score'] || 0);
    const pref = contactPref(c).pref;
    if (pref === 'TARGET') score += 30;
    if (pref === 'MAYBE') score += 5;
    if (pref === 'SKIP') score -= 200;
    score += Math.min(soloFit(c), 28);
    return score;
  }

  function isSoloFriendly(c) { return isVenueSpecific(c) && soloFit(c) >= 10 && contactPref(c).pref !== 'SKIP'; }
  function eligible(c) { return c['Automation Safe?'] !== 'NO' && contactPref(c).pref !== 'SKIP' && !['Booked', 'Pass', 'Do not contact'].includes(c.Status); }

  function badgeClass(safe) { return safe === 'YES - TARGETED' ? 'good' : safe === 'NO' ? 'danger' : 'warn'; }
  function safeLabel(safe) { return safe === 'YES - TARGETED' ? 'Auto-Safe' : safe === 'NO' ? 'Do Not Pitch' : 'Approval'; }
  function prefBadge(c) {
    if (!isVenueSpecific(c)) return '';
    const p = contactPref(c).pref;
    if (p === 'SKIP') return '<span class="fit-badge skip">Room Skip</span>';
    if (p === 'TARGET') return '<span class="fit-badge solo">Target Room</span>';
    if (isSoloFriendly(c)) return '<span class="fit-badge solo">Solo Fit</span>';
    return '<span class="fit-badge open">Room Open</span>';
  }

  function renderLeadCard(c, opts = {}) {
    const id = c['Contact ID'];
    const title = escapeHtml(c.Entity || 'Unknown');
    const person = [c.Contact, c.Role].filter(Boolean).join(' • ');
    const follow = isDue(c) ? '<span class="meta-pill">⏰ Due now</span>' : (c['Next Follow-up'] ? `<span class="meta-pill">Follow-up ${escapeHtml(c['Next Follow-up'])}</span>` : '');
    const email = c.Email ? '<span class="meta-pill">✉ Email</span>' : '';
    const phone = c.Phone ? '<span class="meta-pill">☎ Phone</span>' : '';
    const queueMark = opts.queuePosition ? `<span class="meta-pill">#${opts.queuePosition}</span>` : '';
    return `
      <article class="lead-card" data-contact-id="${escapeHtml(id)}" tabindex="0" role="button" aria-label="Open ${title}">
        <div class="lead-top">
          <div class="score">${escapeHtml(effectiveScore(c))}</div>
          <div class="lead-title"><strong>${title}</strong><span>${escapeHtml(person || c.Operator || c.Lane)}</span></div>
          ${prefBadge(c) || `<span class="badge ${badgeClass(c['Automation Safe?'])}">${safeLabel(c['Automation Safe?'])}</span>`}
        </div>
        <div class="lead-meta">
          ${queueMark}<span class="meta-pill ${c.Priority === 'A' ? 'priority-a' : ''}">Priority ${escapeHtml(c.Priority)}</span>
          <span class="meta-pill">${escapeHtml(c.Lane)}</span><span class="meta-pill">${escapeHtml(c.Status || 'Not contacted')}</span>
          ${email}${phone}${follow}
        </div>
      </article>`;
  }

  function renderDashboard() {
    const all = contacts();
    const solo = all.filter(isSoloFriendly).length;
    const ready = all.filter(c => eligible(c) && c['Automation Safe?'] === 'YES - TARGETED' && c.Status === 'Not contacted').length;
    const skipped = all.filter(c => contactPref(c).pref === 'SKIP').length;
    const due = all.filter(c => eligible(c) && isDue(c)).length;
    $('#metricGrid').innerHTML = [[solo, 'Solo-friendly'], [ready, 'Ready to pitch'], [skipped, 'Rooms skipped'], [due, 'Follow-ups due']]
      .map(([n, label]) => `<div class="metric"><strong>${n}</strong><span>${label}</span></div>`).join('');

    const top = all.filter(eligible).sort((a, b) => effectiveScore(b) - effectiveScore(a)).slice(0, 6);
    $('#topLeads').innerHTML = top.map(renderLeadCard).join('') || '<div class="empty-state">No leads available.</div>';
    bindLeadCards($('#topLeads'));
  }

  function currentLeadResults() {
    const q = ($('#leadSearch')?.value || '').trim().toLowerCase();
    let rows = contacts();
    if (leadFilter === 'A') rows = rows.filter(c => c.Priority === 'A');
    else if (leadFilter === 'safe') rows = rows.filter(c => c['Automation Safe?'] === 'YES - TARGETED' && contactPref(c).pref !== 'SKIP');
    else if (leadFilter === 'followups') rows = rows.filter(c => eligible(c) && isDue(c));
    else if (leadFilter === 'solo') rows = rows.filter(isSoloFriendly);
    else if (leadFilter === 'skipped') rows = rows.filter(c => contactPref(c).pref === 'SKIP');
    else if (leadFilter !== 'all') rows = rows.filter(c => c.Lane === leadFilter);

    if (q) rows = rows.filter(c => [c.Entity, c.Operator, c.Contact, c.Role, c.Email, c.Phone, c.Lane, c.Notes].filter(Boolean).join(' ').toLowerCase().includes(q));

    const sort = $('#leadSort')?.value || 'score';
    rows.sort((a, b) => {
      if (sort === 'priority') return (priorityRank[a.Priority] || 9) - (priorityRank[b.Priority] || 9) || effectiveScore(b) - effectiveScore(a);
      if (sort === 'entity') return String(a.Entity || '').localeCompare(String(b.Entity || ''));
      if (sort === 'followup') return String(a['Next Follow-up'] || '9999-12-31').localeCompare(String(b['Next Follow-up'] || '9999-12-31'));
      return effectiveScore(b) - effectiveScore(a) || (priorityRank[a.Priority] || 9) - (priorityRank[b.Priority] || 9);
    });
    return rows;
  }

  function renderLeads() {
    const rows = currentLeadResults();
    $('#resultCount').textContent = `${rows.length} lead${rows.length === 1 ? '' : 's'}`;
    $('#leadList').innerHTML = rows.map(renderLeadCard).join('') || '<div class="empty-state">Nothing matches that filter.</div>';
    bindLeadCards($('#leadList'));
  }

  function buildSmartQueue() {
    const all = contacts().filter(eligible);
    const due = all.filter(isDue).sort((a, b) => String(a['Next Follow-up']).localeCompare(String(b['Next Follow-up'])) || effectiveScore(b) - effectiveScore(a));
    const solo = all.filter(c => isSoloFriendly(c) && c.Status === 'Not contacted').sort((a, b) => effectiveScore(b) - effectiveScore(a));
    const safe = all.filter(c => c['Automation Safe?'] === 'YES - TARGETED' && c.Status === 'Not contacted' && c.Email).sort((a, b) => effectiveScore(b) - effectiveScore(a));
    const approval = all.filter(c => c['Automation Safe?'] === 'MANUAL APPROVAL' && c.Status === 'Not contacted').sort((a, b) => effectiveScore(b) - effectiveScore(a));

    const ids = [];
    [...due, ...solo, ...safe, ...approval].forEach(c => {
      if (ids.length < 12 && !ids.includes(c['Contact ID'])) ids.push(c['Contact ID']);
    });
    state.queue = ids;
    ids.forEach(id => {
      const c = contactById(id);
      if (c && c.Status === 'Not contacted') state.overrides[id] = { ...(state.overrides[id] || {}), Status: 'Queued' };
    });
    saveState(); renderAll(); return ids.length;
  }

  function renderQueue() {
    const rows = state.queue.map(contactById).filter(c => c && eligible(c));
    const solo = rows.filter(isSoloFriendly).length;
    const approval = rows.filter(c => c['Automation Safe?'] === 'MANUAL APPROVAL').length;
    const due = rows.filter(isDue).length;
    $('#queueSummary').innerHTML = [[rows.length, 'In queue'], [solo, 'Solo-friendly'], [approval, 'Need approval'], [due, 'Due follow-ups']]
      .map(([n, label]) => `<div class="metric"><strong>${n}</strong><span>${label}</span></div>`).join('');
    $('#queueList').innerHTML = rows.length ? rows.map((c, i) => renderLeadCard(c, { queuePosition: i + 1 })).join('') : '<div class="empty-state"><strong>Your queue is empty.</strong><br><br>Tap <b>Find Me Gigs</b> and the app will prioritize solo-friendly rooms without throwing away useful buyers.</div>';
    bindLeadCards($('#queueList'));
  }

  function roomKey(r) { return [r['Operator / Group'], r['Property / Venue'], r['Room / Surface']].map(norm).join('|'); }

  function seededRoomPref(r) {
    const text = norm(fieldText(r, ['Property / Venue', 'Room / Surface', 'Music Fit', 'Notes']));
    if (text.includes('maxan jazz')) return { pref: 'SKIP', reason: 'Personal room preference — do not pursue Maxan.' };
    if (text.includes('vic s las vegas') || text.includes('vics las vegas')) return { pref: 'SKIP', reason: 'Personal room preference — do not pursue Vic’s.' };
    if (text.includes('ole red') || text.includes('stoney s rockin country') || text.includes('stoneys rockin country') || text.includes('jason aldean')) return { pref: 'SKIP', reason: 'Country-first room — not a current target.' };
    if (text.includes('gilley') && !text.includes('theatre relationship is separate')) return { pref: 'SKIP', reason: 'Country-first room — not a current target.' };
    return { pref: 'OPEN', reason: '' };
  }

  function roomPref(r) {
    const custom = state.roomPrefs[roomKey(r)];
    if (custom) return { pref: custom, reason: custom === 'SKIP' ? 'Your room-level preference.' : '' };

    const livePref = String(r.__liveRoomPreference || '').toUpperCase();
    if (ROOM_PREFS.includes(livePref)) {
      return { pref: livePref, reason: livePref === 'SKIP' ? 'Your room-level preference.' : '' };
    }

    return seededRoomPref(r);
  }

  function roomSoloScore(r) {
    const text = norm(fieldText(r, ['Property / Venue', 'Room / Surface', 'Campaign Lane', 'Music Fit', 'Notes']));
    let score = 50;
    ['solo', 'duo', 'lounge', 'cocktail', 'bar', 'restaurant', 'nightly', 'local', 'rotating musicians', 'speakeasy'].forEach(k => { if (text.includes(k)) score += 8; });
    ['r b', 'soul', 'motown', 'top 40', 'pop', 'vocals', 'sax'].forEach(k => { if (text.includes(k)) score += 3; });
    if (text.includes('arena') || text.includes('major touring')) score -= 18;
    const pref = roomPref(r).pref;
    if (pref === 'TARGET') score += 40;
    if (pref === 'MAYBE') score += 8;
    if (pref === 'SKIP') score -= 200;
    return score;
  }

  async function setRoomPref(r, pref) {
    if (r.__liveProspectId && window.BookingCloud?.api) {
      try {
        await window.BookingCloud.api(`/api/prospects/${encodeURIComponent(r.__liveProspectId)}/room-preference`, {
          method: 'PUT',
          body: { preference: pref }
        });
        r.__liveRoomPreference = pref;
      } catch (error) {
        toast(error.message || 'Could not update live room preference.');
        return;
      }
    }

    const key = roomKey(r);
    if (pref === 'OPEN') delete state.roomPrefs[key]; else state.roomPrefs[key] = pref;

    const roomText = norm(`${r['Property / Venue'] || ''} ${r['Room / Surface'] || ''}`);
    DATA.contacts.forEach(c => {
      if (!isVenueSpecific(c)) return;
      const entity = norm(c.Entity);
      if (entity && roomText && (roomText.includes(entity) || entity.includes(norm(r['Property / Venue'])))) {
        if (pref === 'OPEN') delete state.contactPrefs[c['Contact ID']]; else state.contactPrefs[c['Contact ID']] = pref;
        if (pref === 'SKIP') state.queue = state.queue.filter(id => id !== c['Contact ID']);
      }
    });
    saveState(); renderAll(); renderRooms();
  }

  async function refreshLiveRoomRows(force = false) {
    if (!window.BookingCloud?.api) return;
    if (!force && Date.now() - liveRoomRowsFetchedAt < 60000) return;

    try {
      const data = await window.BookingCloud.api('/api/prospects?limit=500');
      liveRoomRows = (data.prospects || [])
        .filter(p => String(p.profile || '').toLowerCase() === 'room' && p.entity)
        .map(p => ({
          'Operator / Group': p.entity || '',
          'Property / Venue': p.entity || '',
          'Room / Surface': p.room || '',
          'Campaign Lane': p.category || 'Live CRM',
          'Music Fit': p.fit_reason || p.evidence_summary || '',
          'Primary Buyer / Route': [p.contact_name, p.contact_role].filter(Boolean).join(' • ') || p.contact_route || 'Live CRM',
          'Contact Detail': [p.email, p.phone].filter(Boolean).join(' • '),
          __liveProspectId: p.id || '',
          __liveRoomPreference: p.room_preference || 'OPEN'
        }));
      liveRoomRowsFetchedAt = Date.now();
    } catch (error) {
      if (force) toast(error.message || 'Could not refresh live rooms.');
    }
  }

  function mergedRoomRows() {
    const merged = [...DATA.buyerMap];
    const seen = new Set(merged.map(roomKey));

    for (const row of liveRoomRows) {
      const key = roomKey(row);
      if (!key || seen.has(key)) continue;
      merged.push(row);
      seen.add(key);
    }

    return merged;
  }

  async function renderRooms(refreshLive = false) {
    await refreshLiveRoomRows(refreshLive === true);

    const q = ($('#buyerSearch')?.value || '').trim().toLowerCase();
    const allRows = mergedRoomRows();
    let rows = allRows.filter(r => !q || Object.values(r).filter(Boolean).join(' ').toLowerCase().includes(q));
    rows.sort((a, b) => roomSoloScore(b) - roomSoloScore(a));

    $('#buyerMap').innerHTML = rows.map((r, index) => {
      const pref = roomPref(r);
      const name = `${r['Property / Venue'] || ''}${r['Room / Surface'] ? ` — ${r['Room / Surface']}` : ''}`;
      const solo = roomSoloScore(r) >= 70 && pref.pref !== 'SKIP';
      const badge = pref.pref === 'SKIP' ? '<span class="fit-badge skip">Skip Room</span>' : pref.pref === 'TARGET' ? '<span class="fit-badge solo">Target Room</span>' : solo ? '<span class="fit-badge solo">Solo-Friendly</span>' : '<span class="fit-badge open">Open</span>';
      return `
        <section class="room-card ${pref.pref === 'SKIP' ? 'skip' : pref.pref === 'TARGET' ? 'target' : ''}" data-room-index="${index}">
          <div class="room-head"><div><strong>${escapeHtml(name)}</strong><span class="room-sub">${escapeHtml(r['Music Fit'] || r['Campaign Lane'] || '')}</span></div>${badge}</div>
          ${pref.reason ? `<div class="room-reason">${escapeHtml(pref.reason)}</div>` : ''}
          <div class="room-buyer"><b>Booking route stays active:</b> ${escapeHtml(r['Primary Buyer / Route'] || 'Research buyer route')}<br>${r['Contact Detail'] ? escapeHtml(r['Contact Detail']) : ''}</div>
          <div class="pref-buttons">
            ${ROOM_PREFS.map(p => `<button class="pref-btn ${pref.pref === p ? 'active' : ''}" data-room-pref="${p}" data-room-key="${escapeHtml(roomKey(r))}">${p === 'TARGET' ? '★ Target' : p === 'MAYBE' ? 'Maybe' : p === 'SKIP' ? 'Skip Room' : 'Open'}</button>`).join('')}
          </div>
        </section>`;
    }).join('') || '<div class="empty-state">No rooms match.</div>';

    $$('[data-room-pref]', $('#buyerMap')).forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const row = rows.find(r => roomKey(r) === btn.dataset.roomKey);
      if (row) setRoomPref(row, btn.dataset.roomPref);
    }));
  }

  function showView(name) {
    currentView = name;
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    $$('.nav-button').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (name === 'leads') renderLeads();
    if (name === 'queue') renderQueue();
    if (name === 'buyers') renderRooms(true);
    if (name === 'settings') renderSettings();
  }

  function bindLeadCards(root) {
    $$('[data-contact-id]', root).forEach(card => {
      const open = () => openDetail(card.dataset.contactId);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  function openModal(id) { const el = $(`#${id}`); if (!el) return; el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) { const el = $(`#${id}`); if (!el) return; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }

  function openDetail(id) {
    const c = contactById(id); if (!c) return;
    const cp = contactPref(c);
    $('#detailEyebrow').textContent = `${c.Lane || ''} • RICK FIT ${effectiveScore(c)}`;
    $('#detailTitle').textContent = c.Entity || 'Lead';
    const source = c['Source URL'] ? `<a href="${escapeHtml(c['Source URL'])}" target="_blank" rel="noopener">Open source ↗</a>` : '—';
    const roomControl = isVenueSpecific(c) ? `
      <div class="detail-section"><h3>Room preference</h3>
        <p>This affects this room only. It does <b>not</b> blacklist the buyer from other venues.</p>
        <div class="pref-buttons" id="contactPrefButtons">${ROOM_PREFS.map(p => `<button class="pref-btn ${cp.pref === p ? 'active' : ''}" data-contact-pref="${p}">${p === 'TARGET' ? '★ Target' : p === 'MAYBE' ? 'Maybe' : p === 'SKIP' ? 'Skip Room' : 'Open'}</button>`).join('')}</div>
        ${cp.reason ? `<div class="room-reason">${escapeHtml(cp.reason)}</div>` : ''}
      </div>` : `<div class="buyer-note"><b>Buyer-level contact:</b> keep this relationship active. A room you dislike can be skipped separately without throwing away this buyer.</div>`;

    $('#detailContent').innerHTML = `
      <div class="detail-grid">
        <div class="detail-box"><span>Contact</span><strong>${escapeHtml(c.Contact || '—')}</strong></div><div class="detail-box"><span>Role</span><strong>${escapeHtml(c.Role || '—')}</strong></div>
        <div class="detail-box"><span>Email</span><strong>${escapeHtml(c.Email || '—')}</strong></div><div class="detail-box"><span>Phone</span><strong>${escapeHtml(c.Phone || '—')}</strong></div>
        <div class="detail-box"><span>Priority / Rick Fit</span><strong>${escapeHtml(c.Priority)} / ${effectiveScore(c)}</strong></div><div class="detail-box"><span>Confidence</span><strong>${escapeHtml(c.Confidence || '—')}</strong></div>
        <div class="detail-box"><span>Verified</span><strong>${escapeHtml(c.Verified || '—')}</strong></div><div class="detail-box"><span>Research</span>${source}</div>
      </div>
      ${roomControl}
      <div class="detail-section"><h3>Why this lead matters</h3><p>${escapeHtml(c.Notes || 'No notes yet.')}</p></div>
      <div class="detail-section"><h3>Outreach</h3><div class="status-controls">
        <label>Status<select id="detailStatus">${STATUS_OPTIONS.map(s => `<option ${s === c.Status ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select></label>
        <label>Next follow-up<input id="detailFollowup" type="date" value="${escapeHtml(c['Next Follow-up'] || '')}" /></label>
      </div><label class="draft-field">Private CRM note<textarea class="notes-input" id="detailNote" rows="4" placeholder="What happened? What should I remember?">${escapeHtml(c['CRM Note'] || '')}</textarea></label></div>
      <div class="detail-actions">${c.Phone ? `<a class="secondary" href="tel:${escapeHtml(String(c.Phone).replace(/[^0-9+]/g,''))}">Call</a>` : '<button class="secondary" disabled>No phone</button>'}${c.Email ? `<a class="secondary" href="mailto:${escapeHtml(c.Email)}">Email</a>` : '<button class="secondary" disabled>No email</button>'}<button class="primary" id="createDraftFromDetail" ${cp.pref === 'SKIP' ? 'disabled' : ''}>${cp.pref === 'SKIP' ? 'Room Skipped' : 'Create Pitch'}</button></div>`;

    $('#detailStatus').addEventListener('change', e => setOverride(id, { Status: e.target.value }));
    $('#detailFollowup').addEventListener('change', e => setOverride(id, { 'Next Follow-up': e.target.value || null }));
    $('#detailNote').addEventListener('change', e => setOverride(id, { 'CRM Note': e.target.value }));
    $$('[data-contact-pref]', $('#detailContent')).forEach(btn => btn.addEventListener('click', () => { setContactPref(id, btn.dataset.contactPref); closeModal('detailModal'); openDetail(id); }));
    const draftBtn = $('#createDraftFromDetail'); if (draftBtn && !draftBtn.disabled) draftBtn.addEventListener('click', () => { closeModal('detailModal'); openDraft(id); });
    openModal('detailModal');
  }

  function campaignDraft(c) {
    const name = c.Contact && !/management|booking|department|submission/i.test(c.Contact) ? c.Contact.split(' ')[0] : '';
    const hello = name ? `Hi ${name},` : 'Hello,';
    const website = state.settings.website ? `\nWebsite: ${state.settings.website}` : '';
    const epk = state.settings.epk ? `\nEPK / live media: ${state.settings.epk}` : '';
    const rep = state.settings.includeRepresentation && state.settings.representation ? `\n\n${state.settings.representation}` : '';
    const profileLine = `I’m Rick Parma, a Las Vegas-based singer and saxophonist performing R&B, Motown, soul, jazz/neo-soul, pop and Top 40. I work especially well as a polished solo performer with tracks, and I can scale up through full-band configurations when a room calls for it.`;
    const cred = DATA.profile?.venueCred || 'I have extensive Las Vegas casino, lounge, corporate and private-event experience.';

    if (c.Lane === 'Agency / Promoter') return { subject: 'Las Vegas artist partnership — Rick Parma', body: `${hello}\n\n${profileLine}\n\n${cred}\n\nI’m reaching out because ${c.Entity} looks like a strong fit for the kind of Las Vegas placements and recurring entertainment work I’m pursuing. My main focus right now is solo singer/sax rooms, lounges, cocktail spaces, restaurants and casino stages where one polished act can cover a lot of ground. I can also scale up when needed.\n${website}${epk}${rep}\n\nThanks,\nRick Parma` };
    if (c.Lane === 'Strategic Buyer') return { subject: 'Las Vegas entertainment introduction — Rick Parma', body: `${hello}\n\n${profileLine}\n\n${cred}\n\nI’m reaching out to introduce myself and see which rooms within ${c.Entity}${c.Operator ? ` / ${c.Operator}` : ''} might fit a versatile solo singer/sax act. I’m especially interested in recurring lounge, cocktail, restaurant, casino-bar and small-stage programming.\n\nIf you oversee multiple rooms, I’d rather find the right fit than force the act into the wrong venue.\n${website}${epk}${rep}\n\nThank you,\nRick Parma` };
    if (!c.Email && c.Phone) return { subject: `Call script — ${c.Entity}`, body: `Hi, this is Rick Parma. I’m a Las Vegas-based singer and saxophonist. My main setup is a polished solo act with tracks covering R&B, Motown, soul, jazz/neo-soul, pop and Top 40.\n\nI’m interested in ${c.Entity}, especially any lounge, cocktail, restaurant, casino-bar or small-stage dates that work well for a solo performer. Who handles that room’s live music booking, and what is the best way to submit my EPK and live video?` };
    return { subject: `Live music for ${c.Entity} — Rick Parma`, body: `${hello}\n\n${profileLine}\n\n${cred}\n\nI’m reaching out because ${c.Entity} looks like a strong fit for my solo singer/sax setup. My sets are built around reading the room, so I can keep things smooth and upscale or turn the energy up without needing a full-band footprint.\n${website}${epk}${rep}\n\nThanks for your time,\nRick Parma` };
  }

  function openDraft(id) {
    const c = contactById(id); if (!c) return;
    if (contactPref(c).pref === 'SKIP') { toast('That room is skipped'); return; }
    activeDraftId = id;
    const d = campaignDraft(c);
    $('#draftTitle').textContent = c.Entity; $('#draftSubject').value = d.subject; $('#draftBody').value = d.body;
    $('#emailDraftButton').style.display = c.Email ? '' : 'none';
    $('#draftGuardrail').textContent = c['Automation Safe?'] === 'MANUAL APPROVAL' ? 'Manual approval lead: review before contacting.' : c['Automation Safe?'] === 'YES - TARGETED' ? 'Targeted lead: approved for personalized outreach, not bulk blasting.' : 'This record is marked NO. Do not send outreach unless research status changes.';
    if (c.Status === 'Queued') setOverride(id, { Status: 'Drafted' });
    openModal('draftModal');
  }

  function renderSettings() {
    $('#websiteInput').value = state.settings.website || ''; $('#epkInput').value = state.settings.epk || '';
    $('#representationInput').value = state.settings.representation || ''; $('#representationToggle').checked = !!state.settings.includeRepresentation;
  }

  function renderAll() { renderDashboard(); if (currentView === 'leads') renderLeads(); if (currentView === 'queue') renderQueue(); if (currentView === 'buyers') renderRooms(); }

  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function shortcut(which) {
    if (which === 'best') { leadFilter = 'all'; $('#leadSort').value = 'score'; }
    if (which === 'solo') leadFilter = 'solo';
    if (which === 'working') leadFilter = 'Working Room';
    if (which === 'strategic') leadFilter = 'Strategic Buyer';
    if (which === 'agency') leadFilter = 'Agency / Promoter';
    if (which === 'followups') leadFilter = 'followups';
    if (which === 'skipped') leadFilter = 'skipped';
    $('#leadSearch').value = '';
    $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === leadFilter));
    showView('leads');
  }

  function initEvents() {
    $$('.nav-button').forEach(b => b.addEventListener('click', () => showView(b.dataset.nav)));
    $$('[data-go-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goView)));
    $$('[data-shortcut]').forEach(b => b.addEventListener('click', () => shortcut(b.dataset.shortcut)));
    $$('[data-close-modal]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.closeModal)));
    $$('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));

    $('#findGigsButton').addEventListener('click', () => { const count = buildSmartQueue(); showView('queue'); toast(`${count} best moves queued`); });
    $('#rebuildQueueButton').addEventListener('click', () => { const n = buildSmartQueue(); toast(`${n} leads ranked`); });
    $('#refreshButton').addEventListener('click', () => { renderAll(); toast('Refreshed'); });
    $('#leadSearch').addEventListener('input', renderLeads); $('#leadSort').addEventListener('change', renderLeads);
    $('#filterRow').addEventListener('click', e => { const chip = e.target.closest('[data-filter]'); if (!chip) return; leadFilter = chip.dataset.filter; $$('.chip').forEach(c => c.classList.toggle('active', c === chip)); renderLeads(); });
    $('#buyerSearch').addEventListener('input', renderRooms);

    $('#copyDraftButton').addEventListener('click', async () => { await navigator.clipboard.writeText(`${$('#draftSubject').value}\n\n${$('#draftBody').value}`); toast('Draft copied'); });
    $('#emailDraftButton').addEventListener('click', () => { const c = contactById(activeDraftId); if (!c?.Email) return; window.location.href = `mailto:${encodeURIComponent(c.Email)}?subject=${encodeURIComponent($('#draftSubject').value)}&body=${encodeURIComponent($('#draftBody').value)}`; });
    $('#markSentButton').addEventListener('click', () => {
      if (!activeDraftId) return; const c = contactById(activeDraftId);
      if (c?.['Automation Safe?'] === 'NO' || contactPref(c).pref === 'SKIP') { toast('This room/contact is not cleared to pitch'); return; }
      setOverride(activeDraftId, { Status: 'Sent', 'Last Contacted': todayISO(), 'Next Follow-up': addDaysISO(7) }); closeModal('draftModal'); toast('Marked sent • follow-up in 7 days');
    });

    $('#saveSettingsButton').addEventListener('click', () => {
      state.settings = { website: $('#websiteInput').value.trim(), epk: $('#epkInput').value.trim(), representation: $('#representationInput').value.trim(), includeRepresentation: $('#representationToggle').checked };
      saveState(); toast('Settings saved');
    });
    $('#exportButton').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' }); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `rick-booking-crm-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('CRM backup exported');
    });
    $('#importInput').addEventListener('change', async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
        const parsed = JSON.parse(await file.text()); const incoming = parsed.state || parsed;
        state = { ...defaultState, ...incoming, settings: { ...defaultState.settings, ...(incoming.settings || {}) }, overrides: incoming.overrides || {}, queue: incoming.queue || [], contactPrefs: incoming.contactPrefs || {}, roomPrefs: incoming.roomPrefs || {} };
        saveState(); renderAll(); renderSettings(); toast('CRM backup imported');
      } catch { toast('Could not import that file'); }
      e.target.value = '';
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal('detailModal'); closeModal('draftModal'); } });
  }

  initEvents(); renderAll();
})();
