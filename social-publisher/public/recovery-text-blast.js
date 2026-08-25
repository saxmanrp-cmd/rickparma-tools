// Recovery Stage 4: restore Text Blast -> Social as a small isolated layer.
(() => {
  const q = (selector, root = document) => root.querySelector(selector);
  const TOKEN_KEY = 'socialPublisherTextBlastToken';
  const SEEN_KEY = 'socialPublisherTextBlastSeen';
  let blastLog = [];

  function esc(value='') {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function cleanBlastText(value='') {
    return String(value || '')
      .replace(/\{\{\s*first_name\s*\}\}/gi, 'friends')
      .replace(/\{\{\s*name\s*\}\}/gi, 'friends')
      .trim();
  }
  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }
  function saveToken(value) {
    try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); } catch {}
  }
  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function injectStyles() {
    if (q('#recoveryTextBlastStyles')) return;
    const style = document.createElement('style');
    style.id = 'recoveryTextBlastStyles';
    style.textContent = `
      body.recovery-easy .text-blast-social{margin:0 0 14px;border:1px solid rgba(82,153,255,.28);border-radius:18px;background:linear-gradient(145deg,#0d1725,#0c1118 62%,#171222);overflow:hidden}
      body.recovery-easy .text-blast-social>summary{list-style:none;cursor:pointer;padding:16px 17px;font-size:18px;font-weight:900;color:#eef4ff;display:flex;align-items:center;justify-content:space-between;gap:10px}
      body.recovery-easy .text-blast-social>summary::-webkit-details-marker{display:none}
      body.recovery-easy .text-blast-social>summary::after{content:'＋';color:#9cbcff;font-size:21px}
      body.recovery-easy .text-blast-social[open]>summary::after{content:'−'}
      body.recovery-easy .text-blast-inner{padding:0 16px 16px}
      body.recovery-easy .text-blast-copy{font-size:15px;line-height:1.45;color:#b7c1d0;margin:-2px 0 12px}
      body.recovery-easy .text-blast-connect{display:grid;gap:10px}
      body.recovery-easy .text-blast-connect input{width:100%;min-height:54px;border-radius:14px;background:#0a1019;border:1px solid rgba(255,255,255,.14);color:#fff;padding:0 14px;font-size:17px}
      body.recovery-easy .text-blast-latest{padding:14px;border-radius:15px;background:#080d14;border:1px solid rgba(255,255,255,.07)}
      body.recovery-easy .text-blast-latest label{display:block;font-size:15px;font-weight:850;color:#d9e6ff;margin-bottom:8px}
      body.recovery-easy .text-blast-latest select{width:100%;min-height:52px;border-radius:13px;background:#101722;border:1px solid rgba(255,255,255,.12);color:#fff;padding:0 12px;font-size:16px;font-weight:750}
      body.recovery-easy .text-blast-preview{font-size:16px;line-height:1.5;color:#eef2f8;white-space:pre-line;margin:13px 0 0}
      body.recovery-easy .text-blast-meta{display:block;color:#8895a8;font-size:13px;line-height:1.35;margin-top:10px}
      body.recovery-easy .text-blast-actions{display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:11px}
      body.recovery-easy .text-blast-actions .button{min-height:52px!important;font-size:16px!important}
      body.recovery-easy .text-blast-note{font-size:14px;line-height:1.4;color:#8d99aa;margin-top:10px}
      body.recovery-easy .text-blast-disconnect{border:0;background:transparent;color:#8b96a7;font-size:14px;padding:11px 0 0;text-align:left}
      @media(max-width:430px){body.recovery-easy .text-blast-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if (q('#textBlastSocial')) return;
    const composer = q('#view-create .composer');
    if (!composer) return;
    injectStyles();
    const details = document.createElement('details');
    details.id = 'textBlastSocial';
    details.className = 'text-blast-social';
    details.innerHTML = `
      <summary>💬 Turn a Text Blast into a post</summary>
      <div class="text-blast-inner">
        <div class="text-blast-copy">Use the same message you already sent and turn it into a social-ready bubble image.</div>
        <div id="textBlastConnect" class="text-blast-connect hidden">
          <input id="textBlastPassword" type="password" autocomplete="current-password" placeholder="Text Blast admin password" />
          <button id="textBlastConnectBtn" class="button secondary full" type="button">Connect Text Blast</button>
        </div>
        <div id="textBlastLatest" class="text-blast-latest hidden">
          <label for="textBlastPicker">Choose a sent blast</label>
          <select id="textBlastPicker"></select>
          <div id="textBlastPreview" class="text-blast-preview"></div>
          <small id="textBlastMeta" class="text-blast-meta"></small>
        </div>
        <div id="textBlastActions" class="text-blast-actions hidden">
          <button id="textBlastMakeBtn" class="button primary" type="button">Make Social Bubble</button>
          <button id="textBlastRefreshBtn" class="button secondary" type="button">Refresh</button>
        </div>
        <div id="textBlastNote" class="text-blast-note">Connect once, then your recent sent blasts will appear here.</div>
        <button id="textBlastDisconnect" class="text-blast-disconnect hidden" type="button">Disconnect Text Blast</button>
      </div>`;
    const mediaStep = q('#easyMediaStep');
    const hero = q('#easyCreateIntro');
    if (mediaStep?.parentNode) mediaStep.parentNode.insertBefore(details, mediaStep);
    else if (hero?.parentNode) hero.after(details);
    else composer.insertBefore(details, composer.firstChild);

    q('#textBlastConnectBtn')?.addEventListener('click', connect);
    q('#textBlastRefreshBtn')?.addEventListener('click', () => sync(true));
    q('#textBlastMakeBtn')?.addEventListener('click', makeSelectedBubble);
    q('#textBlastDisconnect')?.addEventListener('click', disconnect);
    q('#textBlastPicker')?.addEventListener('change', renderSelected);
  }

  function selectedBlast() {
    const select = q('#textBlastPicker');
    const index = Number(select?.value || 0);
    return blastLog[index] || blastLog[0] || null;
  }

  function formatBlastDate(value) {
    try { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)); }
    catch { return ''; }
  }

  function renderSelected() {
    const entry = selectedBlast();
    const preview = q('#textBlastPreview');
    const meta = q('#textBlastMeta');
    if (!entry) {
      if (preview) preview.textContent = '';
      if (meta) meta.textContent = '';
      return;
    }
    if (preview) preview.textContent = cleanBlastText(entry.message) || '(media-only blast)';
    if (meta) {
      const sent = Number(entry.sent || 0);
      meta.textContent = `${formatBlastDate(entry.at)} · sent to ${sent} recipient${sent === 1 ? '' : 's'}`;
    }
  }

  function render() {
    const connected = Boolean(token());
    q('#textBlastConnect')?.classList.toggle('hidden', connected);
    q('#textBlastDisconnect')?.classList.toggle('hidden', !connected);
    q('#textBlastLatest')?.classList.toggle('hidden', !blastLog.length);
    q('#textBlastActions')?.classList.toggle('hidden', !blastLog.length);
    const note = q('#textBlastNote');
    const picker = q('#textBlastPicker');

    if (!connected) {
      if (note) note.textContent = 'Connect once, then your recent sent blasts will appear here.';
      return;
    }
    if (!blastLog.length) {
      if (note) note.textContent = 'Connected. No sent blasts were found yet.';
      return;
    }

    if (picker) {
      const old = picker.value;
      picker.innerHTML = blastLog.slice(0,10).map((entry,index) => {
        const text = cleanBlastText(entry.message).replace(/\s+/g,' ').slice(0,56) || 'Media-only blast';
        const date = formatBlastDate(entry.at);
        return `<option value="${index}">${esc(date ? `${date} — ${text}` : text)}</option>`;
      }).join('');
      if (blastLog[Number(old)]) picker.value = old;
    }
    if (note) note.textContent = 'Pick a blast and tap Make Social Bubble. I’ll load the image and caption into Create for you.';
    renderSelected();
  }

  async function connect() {
    const input = q('#textBlastPassword');
    const value = String(input?.value || '').trim();
    if (!value) return toastSafe('Enter your Text Blast admin password here.');
    const button = q('#textBlastConnectBtn');
    if (button) { button.disabled = true; button.textContent = 'Connecting…'; }
    saveToken(value);
    try {
      await sync(true);
      if (input) input.value = '';
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Connect Text Blast'; }
    }
  }

  function disconnect() {
    saveToken('');
    blastLog = [];
    render();
  }

  async function sync(showStatus=false) {
    injectUi();
    const auth = token();
    if (!auth) { blastLog = []; render(); return; }
    const note = q('#textBlastNote');
    if (showStatus && note) note.textContent = 'Refreshing Text Blast…';
    try {
      const response = await fetch('/api/text-blast/history', {
        headers:{ 'x-text-blast-token':auth, accept:'application/json' },
        cache:'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) saveToken('');
        blastLog = [];
        render();
        if (note) note.textContent = data.error || 'Could not sync Text Blast.';
        return;
      }
      blastLog = Array.isArray(data.log) ? data.log : [];
      render();
    } catch {
      if (note) note.textContent = 'Could not reach Text Blast right now.';
    }
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
    const lines = [];
    for (const paragraph of String(text || '').split(/\n/)) {
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

  async function makeBubbleFile(entry) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0,0,1080,1350);
    bg.addColorStop(0,'#080d16');
    bg.addColorStop(.58,'#171128');
    bg.addColorStop(1,'#071521');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,1080,1350);

    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for (let i=0;i<7;i++) {
      ctx.beginPath();
      ctx.arc(95+i*170,130+(i%2)*90,88,0,Math.PI*2);
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ebcff';
    ctx.font = '800 30px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('RICK PARMA',540,105);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 54px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('A QUICK MESSAGE',540,180);

    const message = cleanBlastText(entry.message) || 'Come hang with me!';
    let fontSize = message.length > 430 ? 34 : message.length > 260 ? 40 : 48;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    let lines = wrapCanvasText(ctx,message,750);
    while (lines.length > 12 && fontSize > 29) {
      fontSize -= 2;
      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      lines = wrapCanvasText(ctx,message,750);
    }
    const lineHeight = Math.round(fontSize * 1.34);
    const bubbleHeight = Math.max(260, Math.min(870, lines.length * lineHeight + 125));
    const bubbleX = 105;
    const bubbleW = 870;
    const bubbleY = 250 + Math.max(0,(820-bubbleHeight)/2);

    ctx.shadowColor = 'rgba(0,0,0,.34)';
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 14;
    const bubble = ctx.createLinearGradient(bubbleX,bubbleY,bubbleX+bubbleW,bubbleY+bubbleHeight);
    bubble.addColorStop(0,'#2080ff');
    bubble.addColorStop(1,'#7655ed');
    ctx.fillStyle = bubble;
    roundedRect(ctx,bubbleX,bubbleY,bubbleW,bubbleHeight,56);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    let y = bubbleY + 70;
    for (const line of lines.slice(0,13)) {
      if (line) ctx.fillText(line,bubbleX+56,y);
      y += lineHeight;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#b4bed0';
    ctx.font = '650 29px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('RickParma.com',540,1240);
    ctx.fillStyle = '#758196';
    ctx.font = '500 23px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Text Blast → Social',540,1285);

    const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not make image.')), 'image/jpeg', .94));
    return new File([blob], `rick-parma-text-blast-${Date.now()}.jpg`, { type:'image/jpeg', lastModified:Date.now() });
  }

  async function makeSelectedBubble() {
    const entry = selectedBlast();
    if (!entry) return toastSafe('Choose a sent blast first.');
    const button = q('#textBlastMakeBtn');
    const old = button?.textContent || 'Make Social Bubble';
    if (button) { button.disabled = true; button.textContent = 'Making image…'; }
    try {
      const file = await makeBubbleFile(entry);
      if (typeof navigate === 'function') navigate('create');
      if (typeof handleMedia === 'function') await handleMedia(file);
      const cap = q('#caption');
      const text = cleanBlastText(entry.message);
      if (cap && text) {
        cap.value = text;
        cap.dispatchEvent(new Event('input',{bubbles:true}));
      }
      q('input[name="igType"][value="post"]')?.closest('.segment')?.click();
      try { localStorage.setItem(SEEN_KEY, entry.id || entry.at || entry.message || 'seen'); } catch {}
      toastSafe('Bubble image is ready. Review it and post when you want.');
      q('#dropZone')?.scrollIntoView({behavior:'smooth',block:'center'});
    } catch (error) {
      toastSafe(error?.message || 'Could not make the Text Blast image.');
    } finally {
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  function boot() {
    injectUi();
    if (token()) sync(false);
    const footer = q('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.7.6 · Recovery Stage 4';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  // Deliberately no MutationObserver or repeating timer here. This layer refreshes only on user action
  // so it cannot interfere with the proven working navigation/render loop.
})();
