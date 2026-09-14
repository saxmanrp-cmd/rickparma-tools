(async () => {
  'use strict';

  if (window.BOOKING_DATA_READY) await window.BOOKING_DATA_READY;
  const DATA = window.BOOKING_DATA || { contacts: [], buyerMap: [], researchGaps: [], profile: {} };
  const STORAGE_KEY = 'rick-booking-engine-v1';
  const STATUS_OPTIONS = ['Not contacted', 'Queued', 'Drafted', 'Sent', 'Replied', 'Follow-up', 'Booked', 'Pass', 'Do not contact'];
  const priorityRank = { A: 1, B: 2, C: 3 };

  const defaultState = {
    overrides: {},
    queue: [],
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
  let activeDetailId = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return {
        ...defaultState,
        ...(saved || {}),
        settings: { ...defaultState.settings, ...(saved?.settings || {}) },
        overrides: saved?.overrides || {},
        queue: saved?.queue || []
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

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
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function contactById(id) {
    const base = DATA.contacts.find(c => c['Contact ID'] === id);
    if (!base) return null;
    return { ...base, ...(state.overrides[id] || {}) };
  }

  function contacts() {
    return DATA.contacts.map(c => ({ ...c, ...(state.overrides[c['Contact ID']] || {}) }));
  }

  function setOverride(id, patch) {
    state.overrides[id] = { ...(state.overrides[id] || {}), ...patch };
    saveState();
    renderAll();
  }

  function isDue(c) {
    const d = c['Next Follow-up'];
    if (!d) return false;
    return d <= todayISO() && !['Booked', 'Pass', 'Do not contact'].includes(c.Status);
  }

  function needsResearch(c) {
    if (c.Lane === 'Research Gap') return true;
    if (!c.Verified) return true;
    const verified = new Date(`${c.Verified}T00:00:00`);
    if (Number.isNaN(verified.getTime())) return false;
    const ageDays = Math.floor((Date.now() - verified.getTime()) / 86400000);
    return ageDays > 90;
  }

  function badgeClass(safe) {
    if (safe === 'YES - TARGETED') return 'good';
    if (safe === 'NO') return 'danger';
    return 'warn';
  }

  function safeLabel(safe) {
    if (safe === 'YES - TARGETED') return 'Auto-Safe';
    if (safe === 'NO') return 'Do Not Pitch';
    return 'Approval';
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
          <div class="score">${escapeHtml(c['Campaign Score'] ?? '—')}</div>
          <div class="lead-title">
            <strong>${title}</strong>
            <span>${escapeHtml(person || c.Operator || c.Lane)}</span>
          </div>
          <span class="badge ${badgeClass(c['Automation Safe?'])}">${safeLabel(c['Automation Safe?'])}</span>
        </div>
        <div class="lead-meta">
          ${queueMark}
          <span class="meta-pill ${c.Priority === 'A' ? 'priority-a' : ''}">Priority ${escapeHtml(c.Priority)}</span>
          <span class="meta-pill">${escapeHtml(c.Lane)}</span>
          <span class="meta-pill">${escapeHtml(c.Status || 'Not contacted')}</span>
          ${email}${phone}${follow}
        </div>
      </article>`;
  }

  function renderDashboard() {
    const all = contacts();
    const ready = all.filter(c => c['Automation Safe?'] === 'YES - TARGETED' && c.Status === 'Not contacted').length;
    const approval = all.filter(c => c['Automation Safe?'] === 'MANUAL APPROVAL' && !['Booked', 'Pass', 'Do not contact'].includes(c.Status)).length;
    const working = all.filter(c => c.Lane === 'Working Room').length;
    const due = all.filter(isDue).length;
    $('#metricGrid').innerHTML = [
      [ready, 'Ready to pitch'],
      [approval, 'Need approval'],
      [working, 'Working rooms'],
      [due, 'Follow-ups due']
    ].map(([n, label]) => `<div class="metric"><strong>${n}</strong><span>${label}</span></div>`).join('');

    const top = all
      .filter(c => c['Automation Safe?'] !== 'NO' && c.Lane !== 'Research Gap' && !['Booked', 'Pass', 'Do not contact'].includes(c.Status))
      .sort((a, b) => (b['Campaign Score'] || 0) - (a['Campaign Score'] || 0))
      .slice(0, 6);
    $('#topLeads').innerHTML = top.map(c => renderLeadCard(c)).join('') || '<div class="empty-state">No leads available.</div>';
    bindLeadCards($('#topLeads'));
  }

  function currentLeadResults() {
    const q = ($('#leadSearch')?.value || '').trim().toLowerCase();
    let rows = contacts();
    if (leadFilter === 'A') rows = rows.filter(c => c.Priority === 'A');
    else if (leadFilter === 'safe') rows = rows.filter(c => c['Automation Safe?'] === 'YES - TARGETED');
    else if (leadFilter === 'followups') rows = rows.filter(isDue);
    else if (leadFilter !== 'all') rows = rows.filter(c => c.Lane === leadFilter);

    if (q) {
      rows = rows.filter(c => [c.Entity, c.Operator, c.Contact, c.Role, c.Email, c.Phone, c.Lane, c.Notes]
        .filter(Boolean).join(' ').toLowerCase().includes(q));
    }

    const sort = $('#leadSort')?.value || 'score';
    rows.sort((a, b) => {
      if (sort === 'priority') return (priorityRank[a.Priority] || 9) - (priorityRank[b.Priority] || 9) || (b['Campaign Score'] || 0) - (a['Campaign Score'] || 0);
      if (sort === 'entity') return String(a.Entity || '').localeCompare(String(b.Entity || ''));
      if (sort === 'followup') return String(a['Next Follow-up'] || '9999-12-31').localeCompare(String(b['Next Follow-up'] || '9999-12-31'));
      return (b['Campaign Score'] || 0) - (a['Campaign Score'] || 0) || (priorityRank[a.Priority] || 9) - (priorityRank[b.Priority] || 9);
    });
    return rows;
  }

  function renderLeads() {
    const rows = currentLeadResults();
    $('#resultCount').textContent = `${rows.length} lead${rows.length === 1 ? '' : 's'}`;
    $('#leadList').innerHTML = rows.map(c => renderLeadCard(c)).join('') || '<div class="empty-state">Nothing matches that filter.</div>';
    bindLeadCards($('#leadList'));
  }

  function buildSmartQueue() {
    const all = contacts().filter(c => c['Automation Safe?'] !== 'NO' && !['Booked', 'Pass', 'Do not contact'].includes(c.Status));
    const due = all.filter(isDue).sort((a, b) => String(a['Next Follow-up']).localeCompare(String(b['Next Follow-up'])) || (b['Campaign Score'] || 0) - (a['Campaign Score'] || 0));
    const safe = all.filter(c => c['Automation Safe?'] === 'YES - TARGETED' && c.Status === 'Not contacted' && c.Email)
      .sort((a, b) => (b['Campaign Score'] || 0) - (a['Campaign Score'] || 0));
    const approval = all.filter(c => c['Automation Safe?'] === 'MANUAL APPROVAL' && c.Status === 'Not contacted')
      .sort((a, b) => (b['Campaign Score'] || 0) - (a['Campaign Score'] || 0));

    const ids = [];
    [...due, ...safe, ...approval].forEach(c => {
      if (ids.length < 12 && !ids.includes(c['Contact ID'])) ids.push(c['Contact ID']);
    });
    state.queue = ids;
    ids.forEach(id => {
      const c = contactById(id);
      if (c && c.Status === 'Not contacted') state.overrides[id] = { ...(state.overrides[id] || {}), Status: 'Queued' };
    });
    saveState();
    renderAll();
    return ids.length;
  }

  function renderQueue() {
    const rows = state.queue.map(contactById).filter(Boolean);
    const safe = rows.filter(c => c['Automation Safe?'] === 'YES - TARGETED').length;
    const approval = rows.filter(c => c['Automation Safe?'] === 'MANUAL APPROVAL').length;
    const due = rows.filter(isDue).length;
    const email = rows.filter(c => c.Email).length;
    $('#queueSummary').innerHTML = [
      [rows.length, 'In queue'],
      [safe, 'Auto-safe'],
      [approval, 'Need approval'],
      [due || email, due ? 'Due follow-ups' : 'Email-ready']
    ].map(([n, label]) => `<div class="metric"><strong>${n}</strong><span>${label}</span></div>`).join('');
    $('#queueList').innerHTML = rows.length
      ? rows.map((c, i) => renderLeadCard(c, { queuePosition: i + 1 })).join('')
      : '<div class="empty-state"><strong>Your queue is empty.</strong><br><br>Tap <b>Find Me Gigs</b> or <b>Rebuild</b> and the app will rank today’s best moves.</div>';
    bindLeadCards($('#queueList'));
  }

  function renderBuyerMap() {
    const q = ($('#buyerSearch')?.value || '').trim().toLowerCase();
    const rows = DATA.buyerMap.filter(r => {
      if (!q) return true;
      return Object.values(r).filter(Boolean).join(' ').toLowerCase().includes(q);
    });
    const groups = new Map();
    rows.forEach(row => {
      const key = row['Operator / Group'] || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    $('#buyerMap').innerHTML = [...groups.entries()].map(([group, list]) => `
      <section class="buyer-group">
        <div class="buyer-group-header"><strong>${escapeHtml(group)}</strong><span>${list.length} propert${list.length === 1 ? 'y' : 'ies / rooms'}</span></div>
        ${list.map(r => `
          <div class="buyer-row">
            <strong>${escapeHtml(r['Property / Venue'])}${r['Room / Surface'] ? ` — ${escapeHtml(r['Room / Surface'])}` : ''}</strong>
            <span>${escapeHtml(r['Primary Buyer / Route'] || '')}</span>
            ${r['Contact Detail'] ? `<span>${escapeHtml(r['Contact Detail'])}</span>` : ''}
          </div>`).join('')}
      </section>`).join('') || '<div class="empty-state">No buyer map matches.</div>';
  }

  function showView(name) {
    currentView = name;
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    $$('.nav-button').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (name === 'leads') renderLeads();
    if (name === 'queue') renderQueue();
    if (name === 'buyers') renderBuyerMap();
    if (name === 'settings') renderSettings();
  }

  function bindLeadCards(root) {
    $$('[data-contact-id]', root).forEach(card => {
      const open = () => openDetail(card.dataset.contactId);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  function openModal(id) {
    const el = $(`#${id}`);
    if (!el) return;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const el = $(`#${id}`);
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openDetail(id) {
    const c = contactById(id);
    if (!c) return;
    activeDetailId = id;
    $('#detailEyebrow').textContent = `${c.Lane || ''} • SCORE ${c['Campaign Score'] ?? '—'}`;
    $('#detailTitle').textContent = c.Entity || 'Lead';
    const source = c['Source URL'] ? `<a href="${escapeHtml(c['Source URL'])}" target="_blank" rel="noopener">Open source ↗</a>` : '—';
    $('#detailContent').innerHTML = `
      <div class="detail-grid">
        <div class="detail-box"><span>Contact</span><strong>${escapeHtml(c.Contact || '—')}</strong></div>
        <div class="detail-box"><span>Role</span><strong>${escapeHtml(c.Role || '—')}</strong></div>
        <div class="detail-box"><span>Email</span><strong>${escapeHtml(c.Email || '—')}</strong></div>
        <div class="detail-box"><span>Phone</span><strong>${escapeHtml(c.Phone || '—')}</strong></div>
        <div class="detail-box"><span>Priority / Score</span><strong>${escapeHtml(c.Priority)} / ${escapeHtml(c['Campaign Score'] ?? '—')}</strong></div>
        <div class="detail-box"><span>Confidence</span><strong>${escapeHtml(c.Confidence || '—')}</strong></div>
        <div class="detail-box"><span>Verified</span><strong>${escapeHtml(c.Verified || '—')}</strong></div>
        <div class="detail-box"><span>Research</span>${source}</div>
      </div>
      <div class="detail-section">
        <h3>Why this lead matters</h3>
        <p>${escapeHtml(c.Notes || 'No notes yet.')}</p>
      </div>
      <div class="detail-section">
        <h3>Outreach</h3>
        <div class="status-controls">
          <label>Status
            <select id="detailStatus">${STATUS_OPTIONS.map(s => `<option ${s === c.Status ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select>
          </label>
          <label>Next follow-up
            <input id="detailFollowup" type="date" value="${escapeHtml(c['Next Follow-up'] || '')}" />
          </label>
        </div>
        <label class="draft-field">Private CRM note
          <textarea class="notes-input" id="detailNote" rows="4" placeholder="What happened? What should I remember?">${escapeHtml(c['CRM Note'] || '')}</textarea>
        </label>
      </div>
      <div class="detail-actions">
        ${c.Phone ? `<a class="secondary" href="tel:${escapeHtml(String(c.Phone).replace(/[^0-9+]/g,''))}">Call</a>` : '<button class="secondary" disabled>No phone</button>'}
        ${c.Email ? `<a class="secondary" href="mailto:${escapeHtml(c.Email)}">Email</a>` : '<button class="secondary" disabled>No email</button>'}
        <button class="primary" id="createDraftFromDetail">Create Pitch</button>
      </div>`;

    $('#detailStatus').addEventListener('change', e => setOverride(id, { Status: e.target.value }));
    $('#detailFollowup').addEventListener('change', e => setOverride(id, { 'Next Follow-up': e.target.value || null }));
    $('#detailNote').addEventListener('change', e => setOverride(id, { 'CRM Note': e.target.value }));
    $('#createDraftFromDetail').addEventListener('click', () => { closeModal('detailModal'); openDraft(id); });
    openModal('detailModal');
  }

  function campaignDraft(c) {
    const name = c.Contact && !/management|booking|department|submission/i.test(c.Contact) ? c.Contact.split(' ')[0] : '';
    const hello = name ? `Hi ${name},` : 'Hello,';
    const website = state.settings.website ? `\nWebsite: ${state.settings.website}` : '';
    const epk = state.settings.epk ? `\nEPK / live media: ${state.settings.epk}` : '';
    const rep = state.settings.includeRepresentation && state.settings.representation ? `\n\n${state.settings.representation}` : '';
    const profileLine = `I’m Rick Parma, a Las Vegas-based singer and saxophonist performing R&B, Motown, soul, jazz/neo-soul, pop and Top 40. I work from a polished solo-to-tracks setup through full-band configurations, depending on the room.`;
    const cred = DATA.profile?.venueCred || 'I have extensive Las Vegas casino, lounge, corporate and private-event experience.';

    if (c.Lane === 'Agency / Promoter') {
      return {
        subject: `Las Vegas artist partnership — Rick Parma`,
        body: `${hello}\n\n${profileLine}\n\n${cred}\n\nI’m reaching out because ${c.Entity} looks like a strong fit for the kind of Las Vegas placements and recurring entertainment work I’m pursuing. I’d love to connect about where my act could fit across your rooms, clients or upcoming events.\n\nI can scale the show to the need — intimate lounge, cocktail environment, corporate reception, dance-forward party set or full band.\n${website}${epk}${rep}\n\nThanks,\nRick Parma`
      };
    }

    if (c.Lane === 'Strategic Buyer') {
      return {
        subject: `Las Vegas entertainment introduction — Rick Parma`,
        body: `${hello}\n\n${profileLine}\n\n${cred}\n\nI’m reaching out to introduce myself and see where I may fit within ${c.Entity}${c.Operator ? ` / ${c.Operator}` : ''}. I’m especially interested in recurring lounge programming, special events, casino entertainment and support opportunities where a flexible singer/sax act can work well.\n\nRather than send a generic blast, I wanted to contact the right entertainment person directly. If there is a better buyer or programming contact for this type of act, I’d appreciate the direction.\n${website}${epk}${rep}\n\nThank you,\nRick Parma`
      };
    }

    if (!c.Email && c.Phone) {
      return {
        subject: `Call script — ${c.Entity}`,
        body: `Hi, this is Rick Parma. I’m a Las Vegas-based singer and saxophonist. I perform R&B, Motown, soul, jazz/neo-soul, pop and Top 40, from solo-to-tracks through full band.\n\nI’m calling because I’m interested in entertainment opportunities with ${c.Entity}. I’ve worked casino, lounge and corporate rooms around Las Vegas, and I’d like to make sure I’m speaking with the person who actually handles live music or entertainment booking.\n\nWho would be the best person for me to send my EPK and live video to?\n\n[If transferred]\nGreat — I’ll keep it short. I can scale the act for lounge, cocktail, corporate or higher-energy rooms. What is the best way for me to submit materials, and what kind of dates or programming are you currently filling?`
      };
    }

    return {
      subject: `Live music for ${c.Entity} — Rick Parma`,
      body: `${hello}\n\n${profileLine}\n\n${cred}\n\nI’m reaching out because ${c.Entity} looks like a strong fit for my act. I’d love to be considered for upcoming live music, lounge, casino or special-event dates.\n\nMy sets are built around reading the room, and I can keep things smooth and upscale or turn the energy up when the night calls for it.\n${website}${epk}${rep}\n\nThanks for your time,\nRick Parma`
    };
  }

  function openDraft(id) {
    const c = contactById(id);
    if (!c) return;
    activeDraftId = id;
    const d = campaignDraft(c);
    $('#draftTitle').textContent = c.Entity;
    $('#draftSubject').value = d.subject;
    $('#draftBody').value = d.body;
    $('#emailDraftButton').style.display = c.Email ? '' : 'none';
    $('#draftGuardrail').textContent = c['Automation Safe?'] === 'MANUAL APPROVAL'
      ? 'Manual approval lead: nothing is sent automatically. Review this draft before contacting the buyer.'
      : c['Automation Safe?'] === 'YES - TARGETED'
        ? 'Targeted lead: this contact is approved for personalized outreach, not bulk blasting.'
        : 'This record is marked NO. Do not send outreach unless the research status changes.';
    if (c.Status === 'Queued') setOverride(id, { Status: 'Drafted' });
    openModal('draftModal');
  }

  function renderSettings() {
    $('#websiteInput').value = state.settings.website || '';
    $('#epkInput').value = state.settings.epk || '';
    $('#representationInput').value = state.settings.representation || '';
    $('#representationToggle').checked = !!state.settings.includeRepresentation;
  }

  function renderAll() {
    renderDashboard();
    if (currentView === 'leads') renderLeads();
    if (currentView === 'queue') renderQueue();
    if (currentView === 'buyers') renderBuyerMap();
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function shortcut(which) {
    if (which === 'best') { leadFilter = 'all'; $('#leadSort').value = 'score'; }
    if (which === 'working') leadFilter = 'Working Room';
    if (which === 'strategic') leadFilter = 'Strategic Buyer';
    if (which === 'agency') leadFilter = 'Agency / Promoter';
    if (which === 'followups') leadFilter = 'followups';
    if (which === 'research') {
      leadFilter = 'all';
      $('#leadSearch').value = 'Research Gap';
    } else if ($('#leadSearch')) {
      $('#leadSearch').value = '';
    }
    $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === leadFilter));
    showView('leads');
  }

  function initEvents() {
    $$('.nav-button').forEach(b => b.addEventListener('click', () => showView(b.dataset.nav)));
    $$('[data-go-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goView)));
    $$('[data-shortcut]').forEach(b => b.addEventListener('click', () => shortcut(b.dataset.shortcut)));
    $$('[data-close-modal]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.closeModal)));
    $$('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));

    $('#findGigsButton').addEventListener('click', () => {
      const count = buildSmartQueue();
      showView('queue');
      toast(`${count} best moves queued`);
    });
    $('#rebuildQueueButton').addEventListener('click', () => { const n = buildSmartQueue(); toast(`${n} leads ranked`); });
    $('#refreshButton').addEventListener('click', () => { renderAll(); toast('Refreshed'); });

    $('#leadSearch').addEventListener('input', renderLeads);
    $('#leadSort').addEventListener('change', renderLeads);
    $('#filterRow').addEventListener('click', e => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;
      leadFilter = chip.dataset.filter;
      $$('.chip').forEach(c => c.classList.toggle('active', c === chip));
      renderLeads();
    });
    $('#buyerSearch').addEventListener('input', renderBuyerMap);

    $('#copyDraftButton').addEventListener('click', async () => {
      const text = `${$('#draftSubject').value}\n\n${$('#draftBody').value}`;
      await navigator.clipboard.writeText(text);
      toast('Draft copied');
    });

    $('#emailDraftButton').addEventListener('click', () => {
      const c = contactById(activeDraftId);
      if (!c?.Email) return;
      const url = `mailto:${encodeURIComponent(c.Email)}?subject=${encodeURIComponent($('#draftSubject').value)}&body=${encodeURIComponent($('#draftBody').value)}`;
      window.location.href = url;
    });

    $('#markSentButton').addEventListener('click', () => {
      if (!activeDraftId) return;
      const c = contactById(activeDraftId);
      if (c?.['Automation Safe?'] === 'NO') { toast('This lead is marked Do Not Pitch'); return; }
      setOverride(activeDraftId, { Status: 'Sent', 'Last Contacted': todayISO(), 'Next Follow-up': addDaysISO(7) });
      closeModal('draftModal');
      toast('Marked sent • follow-up in 7 days');
    });

    $('#saveSettingsButton').addEventListener('click', () => {
      state.settings = {
        website: $('#websiteInput').value.trim(),
        epk: $('#epkInput').value.trim(),
        representation: $('#representationInput').value.trim(),
        includeRepresentation: $('#representationToggle').checked
      };
      saveState();
      toast('Settings saved');
    });

    $('#exportButton').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rick-booking-crm-${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('CRM backup exported');
    });

    $('#importInput').addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const incoming = parsed.state || parsed;
        state = {
          ...defaultState,
          ...incoming,
          settings: { ...defaultState.settings, ...(incoming.settings || {}) },
          overrides: incoming.overrides || {},
          queue: incoming.queue || []
        };
        saveState();
        renderAll();
        renderSettings();
        toast('CRM backup imported');
      } catch {
        toast('Could not import that file');
      }
      e.target.value = '';
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeModal('detailModal');
        closeModal('draftModal');
      }
    });
  }

  initEvents();
  renderAll();
})();
