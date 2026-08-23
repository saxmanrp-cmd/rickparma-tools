// v0.7.3 Gig Campaigns turns one show date into a multi-post promotional sequence.
(() => {
  const q = selector => document.querySelector(selector);
  let campaignItems = [];

  function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function pad(value) { return String(value).padStart(2,'0'); }
  function localDate(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
  function weekKey(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return localDate(d);
  }
  function formatDateTime(value) {
    try { return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)); }
    catch { return 'Recommended time'; }
  }
  function formatEventDate(date) {
    return new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(date);
  }
  function formatEventTime(date) {
    return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(date);
  }
  async function api(url, options={}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  function injectStyles() {
    if (q('#gigCampaignStyles')) return;
    const style = document.createElement('style');
    style.id = 'gigCampaignStyles';
    style.textContent = `
      .gig-campaign{border:1px solid rgba(255,153,74,.25);background:linear-gradient(145deg,#19130f,#0d1118 58%,#12151c);padding:14px;margin-bottom:14px}
      .gig-campaign-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.gig-campaign-kicker{font-size:9px;font-weight:900;letter-spacing:.11em;color:#ffb276;text-transform:uppercase}.gig-campaign h3{margin:4px 0 0;font-size:17px}.gig-campaign-copy{font-size:10px;line-height:1.45;color:#98a2b1;margin:7px 0 0}.gig-campaign-badge{border-radius:999px;padding:4px 7px;font-size:8px;font-weight:900;background:#39271b;color:#ffc495;white-space:nowrap}
      .gig-campaign-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.gig-campaign-form input{width:100%;box-sizing:border-box}.gig-campaign-form .wide{grid-column:1/-1}.gig-campaign-form label{display:grid;gap:4px;font-size:9px;color:#7f8998;font-weight:800}.gig-campaign-form label span{letter-spacing:.05em}.gig-campaign-build{grid-column:1/-1;margin-top:2px}
      .gig-campaign-list{display:grid;gap:10px;margin-top:12px}.gig-group{background:#0a0f16;border-radius:12px;padding:10px}.gig-group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.gig-group-head strong{font-size:12px}.gig-group-head small{display:block;color:#7c8797;font-size:9px;margin-top:3px}.gig-group-hide{border:0;background:transparent;color:#c5898d;font-size:9px;font-weight:800;padding:4px}.gig-phase{border-top:1px solid rgba(255,255,255,.06);padding-top:8px;margin-top:8px}.gig-phase:first-of-type{border-top:0}.gig-phase-top{display:flex;justify-content:space-between;gap:10px}.gig-phase strong{font-size:11px}.gig-phase-time{font-size:9px;color:#ffbf8b}.gig-phase p{font-size:9px;line-height:1.4;color:#9ca6b5;margin:4px 0}.gig-phase-actions{display:flex;gap:7px;margin-top:6px}.gig-phase-actions button{font-size:9px!important;padding:7px 9px!important}
      @media(max-width:390px){.gig-campaign-form{grid-template-columns:1fr}.gig-campaign-form .wide,.gig-campaign-build{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    const calendar = q('#view-calendar');
    const content = q('#calendarContent');
    if (!calendar || !content || q('#gigCampaign')) return;
    injectStyles();
    const card = document.createElement('div');
    card.id = 'gigCampaign';
    card.className = 'card gig-campaign';
    card.innerHTML = `
      <div class="gig-campaign-head"><div><div class="gig-campaign-kicker">Gig Campaigns</div><h3>Promote a show automatically</h3><p class="gig-campaign-copy">Enter the gig once. Social Publisher builds the announcement, reminder, day-of push and recap at useful times.</p></div><span class="gig-campaign-badge">4-TOUCH</span></div>
      <div class="gig-campaign-form">
        <label class="wide"><span>VENUE / EVENT</span><input id="gigVenue" class="compact-input" type="text" maxlength="120" placeholder="Easy's Cocktail Lounge" /></label>
        <label><span>DATE</span><input id="gigDate" class="compact-input" type="date" /></label>
        <label><span>SHOW TIME</span><input id="gigTime" class="compact-input" type="time" value="20:00" /></label>
        <label class="wide"><span>TICKET / INFO LINK · OPTIONAL</span><input id="gigLink" class="compact-input" type="url" maxlength="500" placeholder="https://…" /></label>
        <button id="buildGigCampaignBtn" class="button primary gig-campaign-build" type="button">Build Gig Campaign</button>
      </div>
      <div id="gigCampaignList" class="gig-campaign-list"></div>
    `;
    const weekly = q('#weeklyPlan');
    if (weekly?.nextSibling) calendar.insertBefore(card, weekly.nextSibling); else calendar.insertBefore(card, content);
    q('#buildGigCampaignBtn')?.addEventListener('click', buildCampaign);
    q('#gigCampaignList')?.addEventListener('click', handleAction);
    const today = new Date();
    q('#gigDate').min = localDate(today);
  }

  function campaignPhases(eventDate, venue, link) {
    const now = new Date();
    const eventLabel = `${formatEventDate(eventDate)} · ${formatEventTime(eventDate)}`;
    const linkLine = link ? `\n\nInfo / tickets: ${link}` : '';
    const phases = [];

    const addPhase = (id, title, kind, mediaAccept, when, why, captionStarter) => {
      if (when <= new Date(now.getTime() + 20 * 60 * 1000) && id !== 'recap') return;
      phases.push({ id, title, kind, mediaAccept, scheduledFor:when.toISOString(), why, captionStarter });
    };

    const announcement = new Date(eventDate); announcement.setDate(announcement.getDate() - 5); announcement.setHours(12,0,0,0);
    addPhase('announce', `Announce ${venue}`, 'photo', 'image/*,video/*', announcement,
      'Lead with the venue and date. Give people enough notice to save the post or make plans.',
      `Save the date. 🎶\n\n${venue}\n${eventLabel}${linkLine}\n\nWho’s coming?`);

    const reminder = new Date(eventDate); reminder.setDate(reminder.getDate() - 2); reminder.setHours(18,0,0,0);
    addPhase('reminder', `Reminder · ${venue}`, 'short', 'video/*,image/*', reminder,
      'Use a different visual from the announcement and make the event feel close enough to act on now.',
      `We’re getting close. 🔥\n\n${venue}\n${eventLabel}${linkLine}\n\nCome hang with me.`);

    let dayOf = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 11, 0, 0, 0);
    if (dayOf <= now && eventDate > now) dayOf = new Date(now.getTime() + 30 * 60 * 1000);
    addPhase('day-of', `Today · ${venue}`, 'short', 'video/*,image/*', dayOf,
      'Make the first line unmistakably time-sensitive. Venue and show time should be visible immediately.',
      `TONIGHT! 🔥\n\n${venue}\n${formatEventTime(eventDate)}${linkLine}\n\nSee you there.`);

    const recap = new Date(eventDate); recap.setDate(recap.getDate() + 1); recap.setHours(11,0,0,0);
    phases.push({ id:'recap', title:`Recap · ${venue}`, kind:'short', mediaAccept:'video/*,image/*', scheduledFor:recap.toISOString(),
      why:'Use the strongest crowd, vocal or sax moment as social proof while the show is still fresh.',
      captionStarter:`What a night at ${venue}. 🙌\n\n[One sentence about the best moment]\n\nMore soon.` });

    return phases;
  }

  async function buildCampaign() {
    const venue = String(q('#gigVenue')?.value || '').trim();
    const dateValue = q('#gigDate')?.value || '';
    const timeValue = q('#gigTime')?.value || '';
    const link = String(q('#gigLink')?.value || '').trim();
    if (!venue) return toast('Add the venue or event name.');
    if (!dateValue || !timeValue) return toast('Add the gig date and time.');
    const eventDate = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(eventDate.getTime()) || eventDate <= new Date()) return toast('Choose a future gig date and time.');

    const button = q('#buildGigCampaignBtn');
    button.disabled = true; button.textContent = 'Building campaign…';
    try {
      const source = `gig-campaign:${crypto.randomUUID()}`;
      const phases = campaignPhases(eventDate, venue, link);
      const groups = new Map();
      for (const phase of phases) {
        const key = weekKey(new Date(phase.scheduledFor));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(phase);
      }
      for (const [key, items] of groups) {
        await api('/api/content-plan/generate', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({weekKey:key, source, items}) });
      }
      q('#gigVenue').value = '';
      q('#gigLink').value = '';
      await loadCampaigns();
      q('.nav-item[data-view="calendar"]')?.click();
      toast(`${phases.length}-post gig campaign added to your planner.`);
    } catch (error) {
      toast(error.message || 'Could not build the gig campaign.');
    } finally {
      button.disabled = false; button.textContent = 'Build Gig Campaign';
    }
  }

  async function loadCampaigns() {
    injectUi();
    try {
      const data = await api('/api/content-plan');
      const nowMinusDay = Date.now() - 24 * 60 * 60 * 1000;
      campaignItems = (data.items || []).filter(item => String(item.source || '').startsWith('gig-campaign:') && (!item.scheduledFor || new Date(item.scheduledFor).getTime() >= nowMinusDay || item.status === 'started'));
      renderCampaigns();
    } catch {}
  }

  function groupCampaigns() {
    const groups = new Map();
    for (const item of campaignItems) {
      if (!groups.has(item.source)) groups.set(item.source, []);
      groups.get(item.source).push(item);
    }
    return [...groups.entries()].map(([source,items]) => ({ source, items:items.sort((a,b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor))) }));
  }

  function renderCampaigns() {
    const wrap = q('#gigCampaignList'); if (!wrap) return;
    const groups = groupCampaigns();
    wrap.innerHTML = groups.map(group => {
      const first = group.items[0];
      const venue = String(first?.title || 'Gig campaign').replace(/^(Announce|Reminder ·|Today ·|Recap ·)\s*/, '');
      return `<div class="gig-group"><div class="gig-group-head"><div><strong>${esc(venue || 'Gig campaign')}</strong><small>${group.items.length} campaign post${group.items.length === 1 ? '' : 's'} saved</small></div><button class="gig-group-hide" type="button" data-hide-campaign="${esc(group.source)}">Hide campaign</button></div>${group.items.map(item => `<div class="gig-phase"><div class="gig-phase-top"><strong>${esc(item.title)}</strong><span class="gig-phase-time">${esc(formatDateTime(item.scheduledFor))}</span></div><p>${esc(item.why)}</p><div class="gig-phase-actions"><button class="button primary" type="button" data-start-gig-item="${esc(item.id)}">Start Post</button>${item.status !== 'done' ? `<button class="button secondary" type="button" data-done-gig-item="${esc(item.id)}">Done</button>` : ''}</div></div>`).join('')}</div>`;
    }).join('');
  }

  async function patchStatus(id, status) {
    await api(`/api/content-plan/${encodeURIComponent(id)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({status}) });
    const item = campaignItems.find(row => row.id === id); if (item) item.status = status;
    renderCampaigns();
  }

  async function handleAction(event) {
    const start = event.target.closest('[data-start-gig-item]');
    const done = event.target.closest('[data-done-gig-item]');
    const hide = event.target.closest('[data-hide-campaign]');
    if (start) return startCampaignPost(start.dataset.startGigItem);
    if (done) return patchStatus(done.dataset.doneGigItem,'done').catch(error => toast(error.message));
    if (hide) {
      const ids = campaignItems.filter(item => item.source === hide.dataset.hideCampaign).map(item => item.id);
      await Promise.all(ids.map(id => patchStatus(id,'dismissed').catch(() => null)));
      campaignItems = campaignItems.filter(item => !ids.includes(item.id));
      renderCampaigns();
    }
  }

  async function startCampaignPost(id) {
    const item = campaignItems.find(row => row.id === id); if (!item) return;
    try { await patchStatus(id,'started'); } catch {}
    if (typeof navigate === 'function') navigate('create'); else q('.nav-item[data-view="create"]')?.click();
    const caption = q('#caption');
    if (caption && !caption.value.trim()) { caption.value = item.captionStarter; caption.dispatchEvent(new Event('input',{bubbles:true})); }
    q('.timing-segmented input[value="schedule"]')?.closest('.segment')?.click();
    const d = new Date(item.scheduledFor);
    if (!Number.isNaN(d.getTime())) {
      if (q('#scheduleDate')) q('#scheduleDate').value = localDate(d);
      if (q('#scheduleTime')) q('#scheduleTime').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const input = q('#mediaInput');
    if (input) {
      const previous = input.accept; input.accept = item.mediaAccept || 'image/*,video/*';
      setTimeout(() => input.click(), 80);
      setTimeout(() => { input.accept = previous || 'image/*,video/*'; }, 1600);
    }
    toast('Campaign post loaded. Choose the media.');
  }

  injectUi();
  loadCampaigns();
  q('.nav-item[data-view="calendar"]')?.addEventListener('click', () => setTimeout(loadCampaigns, 80));
  window.addEventListener('focus', () => { if (q('#view-calendar')?.classList.contains('active')) loadCampaigns(); });
  const footer = q('.version-footer'); if (footer) footer.textContent = 'Social Publisher v0.7.3';
})();
