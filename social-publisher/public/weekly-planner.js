// v0.7.2 Weekly Planner turns Content Coach into a saved four-post week.
(() => {
  const q = selector => document.querySelector(selector);
  let profile = null;
  let currentItems = [];

  const ideas = {
    short_video:{ title:'Performance discovery clip', kind:'short', mediaAccept:'video/*', why:'Use a 15–30 second vertical performance moment with the payoff starting immediately.', captionStarter:'Turn this one up. 🔥\n\nA quick moment from the set.\n\nWhat do you think?' },
    event_promo:{ title:'Show announcement', kind:'photo', mediaAccept:'image/*,video/*', why:'Make venue, date and time instantly readable so the post is easy to save and share.', captionStarter:'Save the date. 🎶\n\n[Venue] · [Date] · [Time]\n\nWho’s coming?' },
    behind_scenes:{ title:'Behind-the-scenes moment', kind:'short', mediaAccept:'video/*', why:'Use soundcheck, rehearsal, setup or backstage access to make the audience feel closer to the show.', captionStarter:'A little behind the scenes. 👀\n\n[One detail about what is happening]\n\nWant to see the finished version?' },
    recap:{ title:'Best moment from the latest show', kind:'short', mediaAccept:'video/*', why:'Turn the strongest crowd, vocal or sax moment into social proof for the next show.', captionStarter:'What a night. 🙌\n\n[One sentence about the moment]\n\nMore soon.' },
    photo:{ title:'Strong live photo', kind:'photo', mediaAccept:'image/*', why:'Give the feed a visual change of pace between clips while keeping stage energy front and center.', captionStarter:'One of those moments. 📸\n\n[Where this was / what was happening]\n\nWhat should I play next?' },
    video:{ title:'Fuller performance feature', kind:'video', mediaAccept:'video/*', why:'Use a 30–90 second performance sequence for people who already care, then cut a short version later.', captionStarter:'A moment worth watching all the way through.\n\n[One sentence of context]\n\nWhat part hits you most?' },
  };

  const fallbackHours = { short:18, photo:12, video:18 };

  function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function pad(value) { return String(value).padStart(2,'0'); }
  function localDate(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
  function weekKey(date=new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diff);
    return localDate(d);
  }
  function formatDateTime(value) {
    try { return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)); }
    catch { return 'Recommended time'; }
  }
  async function api(url, options={}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  function injectStyles() {
    if (q('#weeklyPlannerStyles')) return;
    const style = document.createElement('style');
    style.id = 'weeklyPlannerStyles';
    style.textContent = `
      .weekly-plan{border:1px solid rgba(83,161,255,.25);background:linear-gradient(145deg,#101827,#0d1118 58%,#11151d);padding:14px;margin-bottom:14px}
      .weekly-plan-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.weekly-plan-kicker{font-size:9px;font-weight:900;letter-spacing:.11em;color:#72b2ff;text-transform:uppercase}.weekly-plan h3{margin:4px 0 0;font-size:17px}.weekly-plan-summary{font-size:10px;line-height:1.45;color:#8e9aaa;margin:7px 0 0}
      .weekly-plan-actions{display:flex;gap:8px;margin-top:11px}.weekly-plan-items{display:grid;gap:8px;margin-top:11px}.weekly-item{background:#0a0f16;border-radius:12px;padding:10px}.weekly-item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.weekly-item small{display:block;color:#718096;font-size:8px;font-weight:900;letter-spacing:.07em}.weekly-item strong{display:block;font-size:12px;margin-top:3px}.weekly-item p{font-size:10px;line-height:1.4;color:#a8b2c1;margin:5px 0 0}.weekly-item-time{color:#a9cfff!important}.weekly-item-buttons{display:flex;gap:7px;margin-top:8px}.weekly-item-buttons button{font-size:10px!important;padding:8px 10px!important}.weekly-status{border-radius:999px;padding:4px 7px;font-size:8px;font-weight:900;white-space:nowrap}.weekly-status.planned{background:#1c2740;color:#a9cfff}.weekly-status.started{background:#2b243c;color:#d6c5ff}.weekly-status.done{background:#183226;color:#9fe2b8}.weekly-status.dismissed{background:#2b2224;color:#d4a0a5}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    const calendar = q('#view-calendar');
    const content = q('#calendarContent');
    if (!calendar || !content || q('#weeklyPlan')) return;
    injectStyles();
    const card = document.createElement('div');
    card.id = 'weeklyPlan';
    card.className = 'card weekly-plan';
    card.innerHTML = `
      <div class="weekly-plan-head">
        <div><div class="weekly-plan-kicker">Weekly Planner</div><h3>Your content week</h3><p id="weeklyPlanSummary" class="weekly-plan-summary">Loading your plan…</p></div>
        <span id="weeklyPlanBadge" class="weekly-status planned">SMART WEEK</span>
      </div>
      <div class="weekly-plan-actions"><button id="buildWeekBtn" class="button primary" type="button">Build My Week</button><button id="refreshWeekBtn" class="button secondary hidden" type="button">Rebuild</button></div>
      <div id="weeklyPlanItems" class="weekly-plan-items"></div>
    `;
    calendar.insertBefore(card, content);
    q('#buildWeekBtn')?.addEventListener('click', generateWeek);
    q('#refreshWeekBtn')?.addEventListener('click', generateWeek);
    q('#weeklyPlanItems')?.addEventListener('click', handleItemAction);
  }

  function orderedIdeaKeys() {
    const preferred = String(profile?.bestFormat?.kind || '');
    const mapped = preferred === 'short_video' ? 'short_video' : preferred === 'photo' ? 'photo' : preferred === 'video' ? 'video' : '';
    const base = ['short_video','event_promo','behind_scenes','recap','photo','video'];
    if (!mapped) return base;
    return [mapped, ...base.filter(key => key !== mapped)];
  }

  function nextFutureDate(dayOffset, hour) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }

  function buildWeekItems() {
    const keys = orderedIdeaKeys();
    const selected = [];
    for (const key of keys) {
      if (!selected.some(existing => ideas[existing].kind === ideas[key].kind) || selected.length >= 2) selected.push(key);
      if (selected.length === 4) break;
    }
    while (selected.length < 4) selected.push(keys[selected.length % keys.length]);

    const personalizedHour = Number(profile?.bestWindow?.startHour);
    const offsets = [0,2,4,6];
    return selected.map((key,index) => {
      const idea = ideas[key];
      const hour = Number.isFinite(personalizedHour) && profile?.ready ? Math.min(21, Math.max(9, personalizedHour + (index % 2))) : fallbackHours[idea.kind];
      const scheduled = nextFutureDate(offsets[index], hour);
      return { ...idea, scheduledFor:scheduled.toISOString() };
    });
  }

  async function loadProfile() {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const response = await fetch(`/api/intelligence/profile?timezone=${encodeURIComponent(timezone)}`, {headers:{accept:'application/json'}});
      if (response.ok) profile = await response.json();
    } catch {}
  }

  async function loadWeek() {
    injectUi();
    const key = weekKey();
    try {
      const data = await api(`/api/content-plan?weekKey=${encodeURIComponent(key)}`);
      currentItems = data.items || [];
      render();
    } catch (error) {
      q('#weeklyPlanSummary').textContent = error.message || 'Could not load the weekly plan.';
    }
  }

  async function generateWeek() {
    const build = q('#buildWeekBtn'), refresh = q('#refreshWeekBtn');
    const button = currentItems.length ? refresh : build;
    if (button) { button.disabled = true; button.textContent = 'Building…'; }
    try {
      await loadProfile();
      const key = weekKey();
      const items = buildWeekItems();
      const data = await api('/api/content-plan/generate', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({weekKey:key, items})
      });
      currentItems = data.items || [];
      render();
      if (typeof toast === 'function') toast(profile?.ready ? 'Personalized content week built.' : 'Content week built.');
    } catch (error) {
      if (typeof toast === 'function') toast(error.message || 'Could not build the week.');
    } finally {
      if (button) { button.disabled = false; button.textContent = currentItems.length ? 'Rebuild' : 'Build My Week'; }
    }
  }

  function render() {
    const wrap = q('#weeklyPlanItems');
    if (!wrap) return;
    q('#buildWeekBtn')?.classList.toggle('hidden', currentItems.length > 0);
    q('#refreshWeekBtn')?.classList.toggle('hidden', currentItems.length === 0);
    q('#weeklyPlanSummary').textContent = currentItems.length
      ? `${currentItems.filter(item => item.status !== 'dismissed').length} planned ideas · ${profile?.ready ? 'personalized from your performance learning' : 'learning mode'}`
      : 'Build a four-post plan for the next seven days. Social Publisher will choose a balanced mix and recommended times.';
    q('#weeklyPlanBadge').textContent = profile?.ready ? 'PERSONALIZED' : 'SMART WEEK';
    wrap.innerHTML = currentItems.filter(item => item.status !== 'dismissed').map(item => `
      <div class="weekly-item" data-plan-id="${esc(item.id)}">
        <div class="weekly-item-top"><div><small>${esc(item.kind === 'short' ? 'SHORT VIDEO' : item.kind.toUpperCase())}</small><strong>${esc(item.title)}</strong></div><span class="weekly-status ${esc(item.status)}">${esc(item.status.toUpperCase())}</span></div>
        <p class="weekly-item-time">${esc(formatDateTime(item.scheduledFor))}</p><p>${esc(item.why)}</p>
        <div class="weekly-item-buttons"><button class="button primary" type="button" data-start-plan="${esc(item.id)}">Start Post</button>${item.status !== 'done' ? `<button class="button secondary" type="button" data-done-plan="${esc(item.id)}">Done</button>` : ''}<button class="button secondary" type="button" data-dismiss-plan="${esc(item.id)}">Hide</button></div>
      </div>
    `).join('');
  }

  async function patchStatus(id, status) {
    await api(`/api/content-plan/${encodeURIComponent(id)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({status}) });
    const item = currentItems.find(row => row.id === id); if (item) item.status = status;
    render();
  }

  async function handleItemAction(event) {
    const start = event.target.closest('[data-start-plan]');
    const done = event.target.closest('[data-done-plan]');
    const dismiss = event.target.closest('[data-dismiss-plan]');
    if (start) return startPlannedPost(start.dataset.startPlan);
    if (done) return patchStatus(done.dataset.donePlan, 'done').catch(error => toast(error.message));
    if (dismiss) return patchStatus(dismiss.dataset.dismissPlan, 'dismissed').catch(error => toast(error.message));
  }

  async function startPlannedPost(id) {
    const item = currentItems.find(row => row.id === id); if (!item) return;
    try { await patchStatus(id, 'started'); } catch {}
    if (typeof navigate === 'function') navigate('create'); else q('.nav-item[data-view="create"]')?.click();
    const caption = q('#caption');
    if (caption && !caption.value.trim()) { caption.value = item.captionStarter; caption.dispatchEvent(new Event('input',{bubbles:true})); }
    const scheduleSegment = q('.timing-segmented input[value="schedule"]')?.closest('.segment');
    scheduleSegment?.click();
    const d = new Date(item.scheduledFor);
    if (!Number.isNaN(d.getTime())) {
      const dateInput=q('#scheduleDate'), timeInput=q('#scheduleTime');
      if (dateInput) dateInput.value = localDate(d);
      if (timeInput) timeInput.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const input = q('#mediaInput');
    if (input) {
      const previous = input.accept;
      input.accept = item.mediaAccept || 'image/*,video/*';
      setTimeout(() => input.click(), 80);
      setTimeout(() => { input.accept = previous || 'image/*,video/*'; }, 1600);
    }
    if (typeof toast === 'function') toast('Weekly plan loaded. Choose the media.');
  }

  injectUi();
  loadProfile().then(loadWeek);
  q('.nav-item[data-view="calendar"]')?.addEventListener('click', () => setTimeout(loadWeek, 50));
  window.addEventListener('focus', () => { if (q('#view-calendar')?.classList.contains('active')) loadWeek(); });

  const footer = q('.version-footer');
  if (footer) footer.textContent = 'Social Publisher v0.7.2';
})();
