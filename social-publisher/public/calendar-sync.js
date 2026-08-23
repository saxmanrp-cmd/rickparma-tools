// v0.7.4 Calendar Sync pulls upcoming RickParma.com shows into Gig Campaigns.
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
      .calendar-sync-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.calendar-sync-head strong{font-size:12px}.calendar-sync-head span{display:block;color:#7f8998;font-size:9px;line-height:1.4;margin-top:3px}.calendar-sync-live{border-radius:999px;padding:4px 7px;background:#132f25;color:#86e4b7;font-size:8px;font-weight:900;white-space:nowrap}
      .calendar-sync-list{display:grid;gap:8px;margin-top:9px}.calendar-sync-event{display:grid;grid-template-columns:58px 1fr auto;gap:9px;align-items:center;background:#0a0f16;border-radius:11px;padding:8px}.calendar-sync-thumb{width:58px;height:58px;border-radius:8px;overflow:hidden;background:#141a23;display:grid;place-items:center;color:#6f7987;font-size:20px}.calendar-sync-thumb img,.calendar-sync-thumb video{width:100%;height:100%;object-fit:cover}.calendar-sync-copy{min-width:0}.calendar-sync-copy strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calendar-sync-copy small{display:block;font-size:9px;color:#ffbf8b;margin-top:3px}.calendar-sync-copy p{font-size:9px;color:#8d98a7;margin:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calendar-sync-action{font-size:9px!important;padding:7px 9px!important;white-space:nowrap}.calendar-sync-action.ready{border-color:#2d6b50!important;color:#94e9bd!important}.calendar-sync-empty{font-size:10px;color:#7f8998;background:#0a0f16;border-radius:10px;padding:10px;margin-top:8px}.calendar-sync-refresh{border:0;background:transparent;color:#9d8cff;font-size:9px;font-weight:800;padding:4px 0;margin-top:7px}
      @media(max-width:430px){.calendar-sync-event{grid-template-columns:48px 1fr}.calendar-sync-thumb{width:48px;height:48px}.calendar-sync-action{grid-column:1/-1;width:100%}}
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
      <div class="calendar-sync-head"><div><strong>Upcoming from RickParma.com</strong><span>Your Google Calendar shows appear here automatically. One tap builds the full promotion campaign.</span></div><b class="calendar-sync-live">GOOGLE CALENDAR</b></div>
      <div id="calendarSyncList" class="calendar-sync-list"><div class="calendar-sync-empty">Loading upcoming shows…</div></div>
      <button id="calendarSyncRefresh" class="calendar-sync-refresh" type="button">Refresh calendar</button>
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
      wrap.innerHTML = '<div class="calendar-sync-empty">No upcoming Google Calendar shows found.</div>';
      return;
    }
    wrap.innerHTML = events.slice(0,12).map((event,index) => {
      const source = eventSource(event);
      const ready = existingSources.has(source);
      const media = event.flyerSrc
        ? (isVideo(event.flyerSrc) ? `<video src="${esc(event.flyerSrc)}" muted playsinline preload="metadata"></video>` : `<img src="${esc(event.flyerSrc)}" alt="" loading="lazy" />`)
        : '🎷';
      const title = event.title || (event.location ? event.location.split(',')[0] : 'Show');
      const location = event.location || 'Location not listed';
      const action = event.allDay ? 'Use Event' : (ready ? 'Campaign Ready ✓' : 'Build Campaign');
      return `<div class="calendar-sync-event"><div class="calendar-sync-thumb">${media}</div><div class="calendar-sync-copy"><strong>${esc(title)}</strong><small>${esc(formatEventDate(event.start,event.allDay))}</small><p>${esc(location)}</p></div><button class="button secondary calendar-sync-action ${ready ? 'ready' : ''}" type="button" data-calendar-event="${index}" ${ready && !event.allDay ? 'disabled' : ''}>${action}</button></div>`;
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
    q('.gig-campaign-form')?.scrollIntoView({behavior:'smooth',block:'center'});
    if (event.allDay) {
      q('#gigTime')?.focus();
      toast('Event loaded. Add the show time, then build the campaign.');
    } else {
      toast('Google Calendar event loaded.');
    }
  }

  function campaignPhases(eventDate, venue, link) {
    const now = new Date();
    const eventLabel = `${new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(eventDate)} · ${new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(eventDate)}`;
    const linkLine = link ? `\n\nInfo / tickets: ${link}` : '';
    const phases = [];
    const add = (id,title,kind,mediaAccept,when,why,captionStarter) => {
      if (when <= new Date(now.getTime() + 20*60*1000) && id !== 'recap') return;
      phases.push({id,title,kind,mediaAccept,scheduledFor:when.toISOString(),why,captionStarter});
    };
    const announcement = new Date(eventDate); announcement.setDate(announcement.getDate()-5); announcement.setHours(12,0,0,0);
    add('announce',`Announce ${venue}`,'photo','image/*,video/*',announcement,'Lead with the venue and date. Give people enough notice to save the post or make plans.',`Save the date. 🎶\n\n${venue}\n${eventLabel}${linkLine}\n\nWho’s coming?`);
    const reminder = new Date(eventDate); reminder.setDate(reminder.getDate()-2); reminder.setHours(18,0,0,0);
    add('reminder',`Reminder · ${venue}`,'short','video/*,image/*',reminder,'Use a different visual from the announcement and make the event feel close enough to act on now.',`We’re getting close. 🔥\n\n${venue}\n${eventLabel}${linkLine}\n\nCome hang with me.`);
    let dayOf = new Date(eventDate.getFullYear(),eventDate.getMonth(),eventDate.getDate(),11,0,0,0);
    if (dayOf <= now && eventDate > now) dayOf = new Date(now.getTime()+30*60*1000);
    add('day-of',`Today · ${venue}`,'short','video/*,image/*',dayOf,'Make the first line unmistakably time-sensitive. Venue and show time should be visible immediately.',`TONIGHT! 🔥\n\n${venue}\n${new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(eventDate)}${linkLine}\n\nSee you there.`);
    const recap = new Date(eventDate); recap.setDate(recap.getDate()+1); recap.setHours(11,0,0,0);
    phases.push({id:'recap',title:`Recap · ${venue}`,kind:'short',mediaAccept:'video/*,image/*',scheduledFor:recap.toISOString(),why:'Use the strongest crowd, vocal or sax moment as social proof while the show is still fresh.',captionStarter:`What a night at ${venue}. 🙌\n\n[One sentence about the best moment]\n\nMore soon.`});
    return phases;
  }

  async function buildFromEvent(event, button) {
    if (event.allDay) return prefillManual(event);
    const title = event.title || (event.location ? event.location.split(',')[0] : 'Show');
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime()) || start <= new Date()) return toast('This show is no longer in the future.');
    const source = eventSource(event);
    if (existingSources.has(source)) return toast('That Google Calendar show already has a campaign.');
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
      q('.nav-item[data-view="calendar"]')?.click();
      toast(`${phases.length}-post campaign built from Google Calendar.`);
    } catch (error) {
      toast(error.message || 'Could not build the calendar campaign.');
      button.disabled = false; button.textContent = old;
    }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-calendar-event]');
    if (!button) return;
    const item = events[Number(button.dataset.calendarEvent)];
    if (!item) return;
    buildFromEvent(item,button);
  }

  async function load(force=false) {
    injectUi();
    const list = q('#calendarSyncList');
    if (force && list) list.innerHTML = '<div class="calendar-sync-empty">Refreshing Google Calendar…</div>';
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

  injectUi();
  setTimeout(load,180);
  q('.nav-item[data-view="calendar"]')?.addEventListener('click', () => setTimeout(load,100));
  window.addEventListener('focus', () => { if (q('#view-calendar')?.classList.contains('active')) load(); });
})();
