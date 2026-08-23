// v0.7.6 Calendar Sync is flyer-first: choose one update type from a dropdown and create it.
(() => {
  const q = selector => document.querySelector(selector);
  let events = [];
  let existingSources = new Set();

  function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function pad(value) { return String(value).padStart(2,'0'); }
  function localDate(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
  function weekKey(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return localDate(d);
  }
  function formatEventDate(value, allDay=false) {
    try {
      const d = new Date(value);
      return new Intl.DateTimeFormat(undefined, allDay
        ? {weekday:'short',month:'short',day:'numeric'}
        : {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d);
    } catch { return 'Upcoming show'; }
  }
  function formatShowDate(date) {
    return new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(date);
  }
  function formatShowTime(date) {
    return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(date);
  }
  function eventSource(event) {
    const id = String(event?.id || `${event?.dateKey || ''}-${event?.title || 'show'}`).replace(/[^A-Za-z0-9_-]/g,'').slice(0,52);
    return `gig-campaign:gcal:${id || 'event'}`;
  }
  async function api(url, options={}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  function injectStyles() {
    if (q('#calendarSyncStyles')) return;
    const style = document.createElement('style');
    style.id = 'calendarSyncStyles';
    style.textContent = `
      .calendar-sync{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px}
      .calendar-sync-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.calendar-sync-head strong{font-size:15px}.calendar-sync-head span{display:block;color:#8f99a8;font-size:12px;line-height:1.4;margin-top:4px}.calendar-sync-live{border-radius:999px;padding:4px 7px;background:#132f25;color:#86e4b7;font-size:8px;font-weight:900;white-space:nowrap}
      .calendar-sync-list{display:grid;gap:12px;margin-top:12px}.calendar-sync-event{display:grid;grid-template-columns:88px 1fr;gap:12px;align-items:start;background:#0a0f16;border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:12px}.calendar-sync-thumb{width:88px;height:112px;border-radius:12px;overflow:hidden;background:#141a23;display:grid;place-items:center;color:#6f7987;font-size:26px}.calendar-sync-thumb img,.calendar-sync-thumb video{width:100%;height:100%;object-fit:cover}.calendar-sync-copy{min-width:0}.calendar-sync-copy strong{display:block;font-size:16px;line-height:1.25}.calendar-sync-copy small{display:block;font-size:13px;color:#ffbf8b;margin-top:5px}.calendar-sync-copy p{font-size:12px;color:#9aa5b3;margin:5px 0 0;line-height:1.35}.calendar-sync-flyer-note{font-size:11px!important;color:#7f8998!important}.calendar-sync-controls{grid-column:1/-1;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.calendar-sync-select{min-height:46px;border-radius:12px;background:#101722;border:1px solid rgba(255,255,255,.11);color:#eef2f8;padding:0 11px;font-size:14px}.calendar-sync-action{min-height:46px!important;font-size:14px!important;padding:9px 14px!important;white-space:nowrap}.calendar-sync-empty{font-size:14px;color:#8f99a8;background:#0a0f16;border-radius:12px;padding:13px;margin-top:8px}.calendar-sync-refresh{border:0;background:transparent;color:#9d8cff;font-size:13px;font-weight:800;padding:8px 0;margin-top:7px}
      @media(max-width:430px){.calendar-sync-event{grid-template-columns:78px 1fr}.calendar-sync-thumb{width:78px;height:100px}.calendar-sync-controls{grid-template-columns:1fr}.calendar-sync-action{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    const campaign = q('#gigCampaign');
    const form = campaign?.querySelector('.gig-campaign-form');
    if (!campaign || !form || q('#calendarSync')) return;
    injectStyles();
    const sync = document.createElement('div');
    sync.id = 'calendarSync';
    sync.className = 'calendar-sync';
    sync.innerHTML = `
      <div class="calendar-sync-head"><div><strong>Your upcoming shows</strong><span>Pick a show, choose the kind of update, and use the flyer you already made.</span></div><b class="calendar-sync-live">LIVE CALENDAR</b></div>
      <div id="calendarSyncList" class="calendar-sync-list"><div class="calendar-sync-empty">Loading upcoming shows…</div></div>
      <button id="calendarSyncRefresh" class="calendar-sync-refresh" type="button">Refresh shows</button>
    `;
    campaign.insertBefore(sync, form);
    q('#calendarSyncList')?.addEventListener('click', handleClick);
    q('#calendarSyncRefresh')?.addEventListener('click', () => load(true));
  }

  function isVideo(src='') { return /\.(mp4|mov|webm)(?:\?|$)/i.test(src); }
  function render() {
    const wrap = q('#calendarSyncList');
    if (!wrap) return;
    if (!events.length) {
      wrap.innerHTML = '<div class="calendar-sync-empty">No upcoming shows found.</div>';
      return;
    }
    wrap.innerHTML = events.slice(0,16).map((event,index) => {
      const source = eventSource(event);
      const ready = existingSources.has(source);
      const media = event.flyerSrc
        ? (isVideo(event.flyerSrc) ? `<video src="${esc(event.flyerSrc)}" muted playsinline preload="metadata"></video>` : `<img src="${esc(event.flyerSrc)}" alt="Flyer" loading="lazy" />`)
        : '🎷';
      const title = event.title || (event.location ? event.location.split(',')[0] : 'Show');
      const location = event.location || 'Location not listed';
      const flyerNote = event.flyerSrc ? 'Flyer ready' : 'No flyer linked yet — you can still choose one from your phone';
      return `<div class="calendar-sync-event" data-calendar-card="${index}">
        <div class="calendar-sync-thumb">${media}</div>
        <div class="calendar-sync-copy"><strong>${esc(title)}</strong><small>${esc(formatEventDate(event.start,event.allDay))}</small><p>${esc(location)}</p><p class="calendar-sync-flyer-note">${esc(flyerNote)}</p></div>
        <div class="calendar-sync-controls">
          <select class="calendar-sync-select" data-calendar-choice="${index}" aria-label="Choose post type">
            <option value="flyer-now">Post the flyer now</option>
            <option value="announcement">Announcement</option>
            <option value="reminder">Reminder</option>
            <option value="day-of">Day of show</option>
            <option value="last-call">Last call</option>
            <option value="recap">After show / thank you</option>
            <option value="campaign">${ready ? 'Full reminder plan ✓' : 'Build all reminders'}</option>
          </select>
          <button class="button primary calendar-sync-action" type="button" data-create-calendar-post="${index}">${event.allDay ? 'Add Show Time' : 'Create Post'}</button>
        </div>
      </div>`;
    }).join('');
  }

  function splitLocalStart(event) {
    if (event.dateKey) {
      const time = !event.allDay && typeof event.start === 'string' && event.start.includes('T') ? event.start.slice(11,16) : '';
      return { date:event.dateKey, time };
    }
    const d = new Date(event.start);
    return { date:localDate(d), time:`${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }

  function prefillManual(event) {
    const title = event.title || (event.location ? event.location.split(',')[0] : 'Show');
    const start = splitLocalStart(event);
    if (q('#gigVenue')) q('#gigVenue').value = title;
    if (q('#gigDate')) q('#gigDate').value = start.date;
    if (q('#gigTime') && start.time) q('#gigTime').value = start.time;
    if (q('#gigLink')) q('#gigLink').value = event.infoUrl || '';
    const details = q('#easyManualShow');
    if (details) details.open = true;
    q('.gig-campaign-form')?.scrollIntoView({behavior:'smooth',block:'center'});
    q('#gigTime')?.focus();
    toast('Add the show time, then create the post.');
  }

  function phaseForChoice(eventDate, venue, link, choice) {
    const now = new Date();
    const eventLabel = `${formatShowDate(eventDate)} · ${formatShowTime(eventDate)}`;
    const linkLine = link ? `\n\nInfo / tickets: ${link}` : '';
    const phase = { choice, scheduledFor:null, caption:'' };

    if (choice === 'flyer-now') {
      phase.caption = `Come see me live! 🎷\n\n${venue}\n${eventLabel}${linkLine}`;
      return phase;
    }
    if (choice === 'announcement') {
      const when = new Date(eventDate); when.setDate(when.getDate()-5); when.setHours(12,0,0,0);
      phase.scheduledFor = when > now ? when : null;
      phase.caption = `Save the date. 🎶\n\n${venue}\n${eventLabel}${linkLine}\n\nHope to see you there!`;
      return phase;
    }
    if (choice === 'reminder') {
      const when = new Date(eventDate); when.setDate(when.getDate()-2); when.setHours(18,0,0,0);
      phase.scheduledFor = when > now ? when : null;
      phase.caption = `We’re getting close. 🔥\n\n${venue}\n${eventLabel}${linkLine}\n\nCome hang with me.`;
      return phase;
    }
    if (choice === 'day-of') {
      const when = new Date(eventDate.getFullYear(),eventDate.getMonth(),eventDate.getDate(),11,0,0,0);
      phase.scheduledFor = when > now ? when : null;
      phase.caption = `TONIGHT! 🔥\n\n${venue}\n${formatShowTime(eventDate)}${linkLine}\n\nSee you there.`;
      return phase;
    }
    if (choice === 'last-call') {
      const when = new Date(eventDate.getTime()-3*60*60*1000);
      phase.scheduledFor = when > now ? when : null;
      phase.caption = `Last call for tonight! 🎷\n\n${venue}\n${formatShowTime(eventDate)}${linkLine}\n\nCome join me.`;
      return phase;
    }
    const when = new Date(eventDate); when.setDate(when.getDate()+1); when.setHours(11,0,0,0);
    phase.scheduledFor = when > now ? when : null;
    phase.caption = `Thank you for a great night at ${venue}. 🙌\n\nSee you at the next one!`;
    return phase;
  }

  function campaignPhases(eventDate, venue, link) {
    const now = new Date();
    const eventLabel = `${formatShowDate(eventDate)} · ${formatShowTime(eventDate)}`;
    const linkLine = link ? `\n\nInfo / tickets: ${link}` : '';
    const phases = [];
    const add = (id,title,kind,mediaAccept,when,why,captionStarter) => {
      if (when <= new Date(now.getTime() + 20*60*1000) && id !== 'recap') return;
      phases.push({id,title,kind,mediaAccept,scheduledFor:when.toISOString(),why,captionStarter});
    };
    const announcement = new Date(eventDate); announcement.setDate(announcement.getDate()-5); announcement.setHours(12,0,0,0);
    add('announce',`Announce ${venue}`,'photo','image/*,video/*',announcement,'Post the flyer with enough notice for people to make plans.',`Save the date. 🎶\n\n${venue}\n${eventLabel}${linkLine}\n\nHope to see you there!`);
    const reminder = new Date(eventDate); reminder.setDate(reminder.getDate()-2); reminder.setHours(18,0,0,0);
    add('reminder',`Reminder · ${venue}`,'photo','image/*,video/*',reminder,'Bring the flyer back when the show is close enough to act on.',`We’re getting close. 🔥\n\n${venue}\n${eventLabel}${linkLine}\n\nCome hang with me.`);
    let dayOf = new Date(eventDate.getFullYear(),eventDate.getMonth(),eventDate.getDate(),11,0,0,0);
    if (dayOf <= now && eventDate > now) dayOf = new Date(now.getTime()+30*60*1000);
    add('day-of',`Today · ${venue}`,'photo','image/*,video/*',dayOf,'Use the same flyer again with a clear TONIGHT message.',`TONIGHT! 🔥\n\n${venue}\n${formatShowTime(eventDate)}${linkLine}\n\nSee you there.`);
    const recap = new Date(eventDate); recap.setDate(recap.getDate()+1); recap.setHours(11,0,0,0);
    phases.push({id:'recap',title:`Thank you · ${venue}`,kind:'photo',mediaAccept:'image/*,video/*',scheduledFor:recap.toISOString(),why:'A simple thank-you keeps the event alive without forcing extra lifestyle content.',captionStarter:`Thank you for a great night at ${venue}. 🙌\n\nSee you at the next one!`});
    return phases;
  }

  async function loadFlyerIntoComposer(event) {
    if (!event.flyerSrc || typeof handleMedia !== 'function') return false;
    const response = await fetch(`/api/site-calendar/flyer?src=${encodeURIComponent(event.flyerSrc)}`);
    if (!response.ok) return false;
    const blob = await response.blob();
    const ext = blob.type.includes('video') ? 'mp4' : (blob.type.includes('png') ? 'png' : 'jpg');
    const file = new File([blob], `show-flyer-${event.dateKey || Date.now()}.${ext}`, { type:blob.type || 'image/jpeg', lastModified:Date.now() });
    await handleMedia(file);
    return true;
  }

  function setComposerSchedule(date) {
    const now = new Date();
    if (!date || date <= new Date(now.getTime()+20*60*1000)) {
      q('.timing-segmented input[value="now"]')?.closest('.segment')?.click();
      return;
    }
    q('.timing-segmented input[value="schedule"]')?.closest('.segment')?.click();
    if (q('#scheduleDate')) q('#scheduleDate').value = localDate(date);
    if (q('#scheduleTime')) q('#scheduleTime').value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async function createOnePost(event, choice, button) {
    if (event.allDay) return prefillManual(event);
    const venue = event.title || (event.location ? event.location.split(',')[0] : 'Show');
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) return toast('That show date could not be read.');
    const phase = phaseForChoice(start,venue,event.infoUrl || '',choice);
    const old = button.textContent;
    button.disabled = true; button.textContent = 'Loading…';
    try {
      if (typeof navigate === 'function') navigate('create'); else q('.nav-item[data-view="create"]')?.click();
      const cap = q('#caption');
      if (cap) { cap.value = phase.caption; cap.dispatchEvent(new Event('input',{bubbles:true})); }
      setComposerSchedule(phase.scheduledFor ? new Date(phase.scheduledFor) : null);
      const loaded = await loadFlyerIntoComposer(event);
      toast(loaded ? 'Flyer loaded. Your post is ready to review.' : 'Post loaded. Choose the flyer from your phone.');
    } catch (error) {
      toast(error.message || 'Could not prepare that post.');
    } finally {
      button.disabled = false; button.textContent = old;
    }
  }

  async function buildFromEvent(event, button) {
    if (event.allDay) return prefillManual(event);
    const title = event.title || (event.location ? event.location.split(',')[0] : 'Show');
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime()) || start <= new Date()) return toast('This show is no longer in the future.');
    const source = eventSource(event);
    if (existingSources.has(source)) return toast('The full reminder plan is already built for this show.');
    const old = button.textContent; button.disabled = true; button.textContent = 'Building…';
    try {
      const phases = campaignPhases(start,title,event.infoUrl || '');
      const groups = new Map();
      for (const phase of phases) {
        const key = weekKey(new Date(phase.scheduledFor));
        if (!groups.has(key)) groups.set(key,[]);
        groups.get(key).push(phase);
      }
      for (const [key,items] of groups) {
        await api('/api/content-plan/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({weekKey:key,source,items})});
      }
      existingSources.add(source);
      render();
      toast(`${phases.length} flyer reminders added for ${title}.`);
    } catch (error) {
      toast(error.message || 'Could not build the reminder plan.');
      button.disabled = false; button.textContent = old;
    }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-create-calendar-post]');
    if (!button) return;
    const index = Number(button.dataset.createCalendarPost);
    const item = events[index];
    if (!item) return;
    const choice = q(`[data-calendar-choice="${index}"]`)?.value || 'flyer-now';
    if (choice === 'campaign') return buildFromEvent(item,button);
    return createOnePost(item,choice,button);
  }

  async function load(force=false) {
    injectUi();
    const list = q('#calendarSyncList');
    if (force && list) list.innerHTML = '<div class="calendar-sync-empty">Refreshing shows…</div>';
    try {
      const [calendar,plan] = await Promise.all([
        api(`/api/site-calendar/gigs${force ? `?bust=${Date.now()}` : ''}`),
        api('/api/content-plan'),
      ]);
      events = Array.isArray(calendar.events) ? calendar.events : [];
      existingSources = new Set((plan.items || []).map(item => String(item.source || '')).filter(source => source.startsWith('gig-campaign:gcal:')));
      render();
    } catch (error) {
      if (list) list.innerHTML = `<div class="calendar-sync-empty">${esc(error.message || 'Calendar unavailable right now.')}</div>`;
    }
  }

  window.SocialPublisherCalendar = { reload:load, getEvents:() => events.slice() };
  injectUi();
  setTimeout(load,180);
  q('.nav-item[data-view="calendar"]')?.addEventListener('click', () => setTimeout(load,100));
  window.addEventListener('focus', () => { if (q('#view-calendar')?.classList.contains('active')) load(); });
})();
