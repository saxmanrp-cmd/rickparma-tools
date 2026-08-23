// v0.7.6 keeps Social Publisher focused on show dates, flyers, and simple promotional updates.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  const TOKEN_KEY = 'socialPublisherTextBlastToken';
  const SEEN_KEY = 'socialPublisherTextBlastSeen';
  let blastLog = [];

  function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function cleanBlastText(value='') {
    return String(value || '')
      .replace(/\{\{\s*first_name\s*\}\}/gi,'friends')
      .replace(/\{\{\s*name\s*\}\}/gi,'friends')
      .trim();
  }

  function injectStyles() {
    if (q('#flyerFirstStyles')) return;
    const style = document.createElement('style');
    style.id = 'flyerFirstStyles';
    style.textContent = `
      body.easy-mode .content-coach-card{display:none}
      body.easy-mode .flyer-extra-ideas{margin:0 0 14px;border:1px solid rgba(145,116,255,.18);border-radius:16px;background:#10131a;overflow:hidden}
      body.easy-mode .flyer-extra-ideas>summary{list-style:none;cursor:pointer;padding:14px 15px;font-size:15px;font-weight:850;color:#c9c1f7}
      body.easy-mode .flyer-extra-ideas>summary::-webkit-details-marker{display:none}
      body.easy-mode .flyer-extra-ideas>summary::after{content:'＋';float:right}
      body.easy-mode .flyer-extra-ideas[open]>summary::after{content:'−'}
      body.easy-mode .flyer-extra-ideas[open] .content-coach-card{display:block;margin:0 12px 12px}
      body.easy-mode .flyer-extra-ideas[open] .content-coach-grid,body.easy-mode .flyer-extra-ideas[open] .content-coach-caption,body.easy-mode .flyer-extra-ideas[open] .content-coach-foot{display:none!important}

      body.easy-mode #weeklyPlan{display:none}
      body.easy-mode .flyer-weekly-wrap{margin:14px 0;border:1px solid rgba(83,161,255,.16);border-radius:16px;background:#0e141d;overflow:hidden}
      body.easy-mode .flyer-weekly-wrap>summary{list-style:none;cursor:pointer;padding:14px 15px;font-size:15px;font-weight:850;color:#afd2ff}
      body.easy-mode .flyer-weekly-wrap>summary::-webkit-details-marker{display:none}
      body.easy-mode .flyer-weekly-wrap>summary::after{content:'＋';float:right}
      body.easy-mode .flyer-weekly-wrap[open]>summary::after{content:'−'}
      body.easy-mode .flyer-weekly-wrap[open] #weeklyPlan{display:block;margin:0 12px 12px!important;border:0!important}

      .blast-social-card{padding:16px!important;border:1px solid rgba(70,153,255,.28)!important;background:linear-gradient(145deg,#0d1725,#0d1118 62%,#171222)!important}
      .blast-social-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.blast-social-head strong{font-size:18px}.blast-social-head span{display:block;margin-top:4px;color:#aeb8c7;font-size:13px;line-height:1.4}.blast-social-badge{border-radius:999px;background:#12345b;color:#a8d3ff;padding:5px 8px;font-size:9px;font-weight:900;white-space:nowrap}
      .blast-social-connect{display:grid;gap:9px;margin-top:12px}.blast-social-connect input{margin:0!important}.blast-social-latest{margin-top:12px;padding:13px;border-radius:14px;background:#080d14;border:1px solid rgba(255,255,255,.06)}.blast-social-latest strong{display:block;font-size:14px}.blast-social-latest p{font-size:14px;line-height:1.45;color:#d7deea;margin:7px 0 0;white-space:pre-line}.blast-social-latest small{display:block;color:#8290a3;font-size:11px;margin-top:8px}.blast-social-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}.blast-social-actions button{min-height:48px}.blast-social-note{font-size:12px;line-height:1.4;color:#8490a0;margin-top:9px}
      .blast-social-disconnect{border:0;background:transparent;color:#7f8b9b;font-size:12px;padding:8px 0 0;text-align:left}

      body.easy-mode .gig-phase-picker{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}.gig-phase-select{min-height:44px;border-radius:11px;background:#101722;border:1px solid rgba(255,255,255,.10);color:#eef2f8;padding:0 10px;font-size:13px}.gig-phase-open{min-height:44px!important;font-size:13px!important}.gig-phase.is-picker-hidden{display:none!important}
      body.easy-mode .gig-group .gig-phase{padding:12px 0 0!important;margin-top:10px!important}.gig-group .gig-phase.gig-phase-selected{display:block!important}
      @media(max-width:430px){.blast-social-actions,.gig-phase-picker{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function wrapOptionalIdeas() {
    const coach = q('#contentCoach');
    if (coach && !q('#flyerExtraIdeas')) {
      const details = document.createElement('details');
      details.id = 'flyerExtraIdeas';
      details.className = 'flyer-extra-ideas';
      const summary = document.createElement('summary');
      summary.textContent = 'More post ideas · optional';
      coach.parentNode.insertBefore(details, coach);
      details.appendChild(summary);
      details.appendChild(coach);
    }

    const weekly = q('#weeklyPlan');
    if (weekly && !q('#flyerWeeklyWrap')) {
      const details = document.createElement('details');
      details.id = 'flyerWeeklyWrap';
      details.className = 'flyer-weekly-wrap';
      const summary = document.createElement('summary');
      summary.textContent = 'Extra content ideas for the week · optional';
      weekly.parentNode.insertBefore(details, weekly);
      details.appendChild(summary);
      details.appendChild(weekly);
    }
  }

  function simplifyCampaignGroups() {
    qa('.gig-group').forEach((group, groupIndex) => {
      if (q('.gig-phase-picker',group)) return;
      const phases = qa('.gig-phase',group);
      if (phases.length < 2) return;
      const picker = document.createElement('div');
      picker.className = 'gig-phase-picker';
      const select = document.createElement('select');
      select.className = 'gig-phase-select';
      select.setAttribute('aria-label','Choose campaign update');
      phases.forEach((phase,index) => {
        const title = q('.gig-phase-top strong',phase)?.textContent?.trim() || `Update ${index+1}`;
        const time = q('.gig-phase-time',phase)?.textContent?.trim() || '';
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = time ? `${title} · ${time}` : title;
        select.appendChild(option);
        phase.classList.toggle('gig-phase-selected',index === 0);
        phase.classList.toggle('is-picker-hidden',index !== 0);
      });
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'button secondary gig-phase-open';
      open.textContent = 'Show Update';
      const show = () => {
        const chosen = Number(select.value || 0);
        phases.forEach((phase,index) => {
          phase.classList.toggle('gig-phase-selected',index === chosen);
          phase.classList.toggle('is-picker-hidden',index !== chosen);
        });
      };
      select.addEventListener('change',show);
      open.addEventListener('click',show);
      picker.append(select,open);
      const head = q('.gig-group-head',group);
      if (head?.nextSibling) group.insertBefore(picker,head.nextSibling); else group.appendChild(picker);
    });
  }

  function injectTextBlastCard() {
    if (q('#blastSocialCard')) return;
    const create = q('#view-create .composer');
    if (!create) return;
    const card = document.createElement('div');
    card.id = 'blastSocialCard';
    card.className = 'card blast-social-card';
    card.innerHTML = `
      <div class="blast-social-head"><div><strong>Text Blast → Social 💬</strong><span>Your latest blast can become a ready-to-post message bubble image.</span></div><b id="blastSocialBadge" class="blast-social-badge">SYNC</b></div>
      <div id="blastSocialConnect" class="blast-social-connect hidden">
        <input id="blastSocialPassword" type="password" autocomplete="current-password" placeholder="Text Blast admin password" />
        <button id="blastSocialConnectBtn" class="button secondary full" type="button">Connect Text Blast</button>
      </div>
      <div id="blastSocialLatest" class="blast-social-latest hidden"></div>
      <div id="blastSocialActions" class="blast-social-actions hidden"><button id="blastSocialMakeBtn" class="button primary" type="button">Make Bubble Post</button><button id="blastSocialRefreshBtn" class="button secondary" type="button">Refresh</button></div>
      <div id="blastSocialNote" class="blast-social-note">Checking your Text Blast history…</div>
      <button id="blastSocialDisconnect" class="blast-social-disconnect hidden" type="button">Disconnect Text Blast</button>
    `;
    const maxReach = q('#maxReachCard');
    if (maxReach) create.insertBefore(card,maxReach);
    else create.appendChild(card);

    q('#blastSocialConnectBtn')?.addEventListener('click',connectTextBlast);
    q('#blastSocialRefreshBtn')?.addEventListener('click',() => syncTextBlast(true));
    q('#blastSocialMakeBtn')?.addEventListener('click',() => blastLog[0] && makeBubblePost(blastLog[0]));
    q('#blastSocialDisconnect')?.addEventListener('click',disconnectTextBlast);
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }
  function saveToken(value) {
    try { value ? localStorage.setItem(TOKEN_KEY,value) : localStorage.removeItem(TOKEN_KEY); } catch {}
  }

  async function connectTextBlast() {
    const input = q('#blastSocialPassword');
    const value = String(input?.value || '').trim();
    if (!value) return;
    const button = q('#blastSocialConnectBtn');
    button.disabled = true; button.textContent = 'Connecting…';
    saveToken(value);
    try {
      await syncTextBlast(true);
      if (input) input.value = '';
    } finally {
      button.disabled = false; button.textContent = 'Connect Text Blast';
    }
  }

  function disconnectTextBlast() {
    saveToken('');
    blastLog = [];
    renderTextBlast();
    const note = q('#blastSocialNote');
    if (note) note.textContent = 'Connect once to automatically see your newest blasts here.';
  }

  async function syncTextBlast(force=false) {
    injectTextBlastCard();
    const auth = token();
    if (!auth) {
      blastLog = [];
      renderTextBlast();
      return;
    }
    const note = q('#blastSocialNote');
    if (force && note) note.textContent = 'Refreshing Text Blast…';
    try {
      const response = await fetch('/api/text-blast/history', { headers:{ 'x-text-blast-token':auth, accept:'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) saveToken('');
        blastLog = [];
        renderTextBlast();
        if (note) note.textContent = data.error || 'Could not sync Text Blast.';
        return;
      }
      blastLog = Array.isArray(data.log) ? data.log : [];
      renderTextBlast();
    } catch {
      if (note) note.textContent = 'Could not sync Text Blast right now.';
    }
  }

  function formatBlastDate(value) {
    try { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)); }
    catch { return ''; }
  }

  function renderTextBlast() {
    const connected = Boolean(token());
    q('#blastSocialConnect')?.classList.toggle('hidden',connected);
    q('#blastSocialDisconnect')?.classList.toggle('hidden',!connected);
    const latest = blastLog[0];
    q('#blastSocialLatest')?.classList.toggle('hidden',!latest);
    q('#blastSocialActions')?.classList.toggle('hidden',!latest);
    const note = q('#blastSocialNote');
    const badge = q('#blastSocialBadge');

    if (!connected) {
      if (note) note.textContent = 'Connect once to automatically see your newest blasts here.';
      if (badge) badge.textContent = 'CONNECT';
      return;
    }
    if (!latest) {
      if (note) note.textContent = 'Connected. No sent blasts found yet.';
      if (badge) badge.textContent = 'CONNECTED';
      return;
    }
    const seen = (() => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } })();
    const key = latest.id || latest.at || latest.message;
    const isNew = key && key !== seen;
    if (badge) badge.textContent = isNew ? 'NEW BLAST' : 'CONNECTED';
    if (note) note.textContent = 'Text Blast syncs automatically. Tap Make Bubble Post when you want this message on social media.';
    const wrap = q('#blastSocialLatest');
    if (wrap) wrap.innerHTML = `<strong>${esc(latest.segmentLabel || 'Latest Text Blast')}</strong><p>${esc(cleanBlastText(latest.message) || '(media-only blast)')}</p><small>${esc(formatBlastDate(latest.at))} · sent to ${Number(latest.sent || 0)} recipient${Number(latest.sent || 0) === 1 ? '' : 's'}</small>`;
  }

  function roundedRect(ctx,x,y,w,h,r) {
    const radius = Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+radius,y);
    ctx.arcTo(x+w,y,x+w,y+h,radius);
    ctx.arcTo(x+w,y+h,x,y+h,radius);
    ctx.arcTo(x,y+h,x,y,radius);
    ctx.arcTo(x,y,x+w,y,radius);
    ctx.closePath();
  }

  function wrapCanvasText(ctx,text,maxWidth) {
    const paragraphs = String(text || '').split(/\n/);
    const lines = [];
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      const words = paragraph.split(/\s+/);
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  async function bubbleFile(entry) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0,0,1080,1350);
    gradient.addColorStop(0,'#090d16'); gradient.addColorStop(.55,'#151126'); gradient.addColorStop(1,'#071521');
    ctx.fillStyle = gradient; ctx.fillRect(0,0,1080,1350);

    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let i=0;i<8;i++) { ctx.beginPath(); ctx.arc(120+i*155,150+(i%2)*80,80,0,Math.PI*2); ctx.fill(); }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9cbcff'; ctx.font = '800 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('RICK PARMA',540,105);
    ctx.fillStyle = '#ffffff'; ctx.font = '800 52px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('A QUICK TEXT FROM ME',540,180);

    const message = cleanBlastText(entry.message) || 'Come hang with me!';
    let fontSize = message.length > 420 ? 36 : message.length > 250 ? 42 : 48;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    let lines = wrapCanvasText(ctx,message,760);
    while (lines.length > 11 && fontSize > 31) {
      fontSize -= 2;
      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      lines = wrapCanvasText(ctx,message,760);
    }
    const lineHeight = Math.round(fontSize*1.34);
    const bubbleHeight = Math.max(250,Math.min(850,lines.length*lineHeight+120));
    const bubbleY = 265 + Math.max(0,(780-bubbleHeight)/2);
    const bubbleX = 110, bubbleW = 860;

    ctx.shadowColor = 'rgba(0,0,0,.32)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14;
    const bubbleGradient = ctx.createLinearGradient(bubbleX,bubbleY,bubbleX+bubbleW,bubbleY+bubbleHeight);
    bubbleGradient.addColorStop(0,'#207cff'); bubbleGradient.addColorStop(1,'#6b55e8');
    ctx.fillStyle = bubbleGradient; roundedRect(ctx,bubbleX,bubbleY,bubbleW,bubbleHeight,54); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    let y = bubbleY + 67;
    for (const line of lines.slice(0,12)) {
      if (line) ctx.fillText(line,bubbleX+54,y);
      y += lineHeight;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#aab5c7'; ctx.font = '600 27px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('RickParma.com',540,1240);
    ctx.fillStyle = '#6f7a8c'; ctx.font = '500 22px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Text Blast → Social',540,1284);

    const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not make image.')),'image/jpeg',.94));
    return new File([blob],`rick-parma-text-blast-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
  }

  async function makeBubblePost(entry) {
    if (!entry) return;
    const button = q('#blastSocialMakeBtn');
    const old = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Making image…'; }
    try {
      const file = await bubbleFile(entry);
      if (typeof navigate === 'function') navigate('create');
      if (typeof handleMedia === 'function') await handleMedia(file);
      const cap = q('#caption');
      const text = cleanBlastText(entry.message);
      if (cap && !cap.value.trim() && text) { cap.value = text; cap.dispatchEvent(new Event('input',{bubbles:true})); }
      const igPost = q('input[name="igType"][value="post"]')?.closest('.segment');
      igPost?.click();
      const key = entry.id || entry.at || entry.message;
      try { localStorage.setItem(SEEN_KEY,key); } catch {}
      renderTextBlast();
      toast('Text Blast bubble created. Review it and post when ready.');
    } catch (error) {
      toast(error.message || 'Could not make the Text Blast image.');
    } finally {
      if (button) { button.disabled = false; button.textContent = old || 'Make Bubble Post'; }
    }
  }

  function refreshUi() {
    injectStyles();
    injectTextBlastCard();
    wrapOptionalIdeas();
    simplifyCampaignGroups();
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6';
  }

  refreshUi();
  setTimeout(() => { refreshUi(); syncTextBlast(); },350);
  const observer = new MutationObserver(() => refreshUi());
  const root = q('.main');
  if (root) observer.observe(root,{childList:true,subtree:true});
  q('.nav-item[data-view="calendar"]')?.addEventListener('click',() => setTimeout(refreshUi,200));
  window.addEventListener('focus',() => { refreshUi(); if (token()) syncTextBlast(); });
  document.addEventListener('visibilitychange',() => { if (!document.hidden && token()) syncTextBlast(); });
  setInterval(() => { if (token()) syncTextBlast(); },5*60*1000);
})();
