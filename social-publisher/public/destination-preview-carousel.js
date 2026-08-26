// Destination-aware post preview carousel for Create.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  let currentIndex = 0;
  let touch = null;
  let scrollFrame = 0;

  const DESTINATIONS = {
    instagram_post:{platform:'instagram',type:'post',label:'Instagram Post',short:'IG Post',tone:'instagram'},
    instagram_story:{platform:'instagram',type:'story',label:'Instagram Story',short:'IG Story',tone:'instagram'},
    instagram_reel:{platform:'instagram',type:'reel',label:'Instagram Reel',short:'IG Reel',tone:'instagram'},
    facebook_post:{platform:'facebook',type:'post',label:'Facebook Post / Video',short:'Facebook',tone:'facebook'},
    facebook_reel:{platform:'facebook',type:'reel',label:'Facebook Reel',short:'FB Reel',tone:'facebook'},
    tiktok:{platform:'tiktok',type:'video',label:'TikTok',short:'TikTok',tone:'tiktok'},
    threads:{platform:'threads',type:'post',label:'Threads',short:'Threads',tone:'threads'},
  };

  function injectStyles() {
    if (q('#destinationPreviewCarouselStyles')) return;
    const style = document.createElement('style');
    style.id = 'destinationPreviewCarouselStyles';
    style.textContent = `
      #previewSheet .sheet-panel.destination-preview-panel{max-height:92vh;overflow-y:auto;overflow-x:hidden;padding-bottom:max(16px,env(safe-area-inset-bottom))}
      #previewSheet .destination-preview-legacy{display:none!important}
      #previewSheet .destination-preview-wrap{width:100%;min-width:0;overflow:hidden}
      #previewSheet .destination-preview-intro{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 16px 8px;color:#9da8b8;font-size:13px}
      #previewSheet .destination-preview-intro strong{color:#fff;font-size:14px}
      #previewSheet .destination-preview-nav{display:flex;align-items:center;gap:8px}
      #previewSheet .destination-preview-nav button{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:#151b25;color:#fff;font-size:22px;font-weight:800;padding:0;display:grid;place-items:center}
      #previewSheet .destination-preview-track{display:flex;gap:14px;width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;padding:6px 20px 12px;box-sizing:border-box;scroll-snap-type:x mandatory;scroll-padding:20px;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scrollbar-width:none}
      #previewSheet .destination-preview-track::-webkit-scrollbar{display:none}
      #previewSheet .destination-preview-slide{flex:0 0 calc(100% - 40px);max-width:390px;min-width:0;scroll-snap-align:center;scroll-snap-stop:always}
      #previewSheet .destination-preview-label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 8px;color:#fff;font-weight:900;font-size:15px}
      #previewSheet .destination-preview-label span:last-child{font-size:11px;color:#96a2b4;font-weight:750;letter-spacing:.04em;text-transform:uppercase}
      #previewSheet .destination-device{position:relative;width:100%;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:#05070a;color:#fff;box-shadow:0 14px 38px rgba(0,0,0,.28)}
      #previewSheet .destination-device.feed{background:#0b0d12}
      #previewSheet .destination-device.vertical{height:min(60vh,560px);min-height:430px;background:#000}
      #previewSheet .destination-media-box{position:relative;width:100%;overflow:hidden;background:#111}
      #previewSheet .destination-device.feed .destination-media-box{aspect-ratio:4/5}
      #previewSheet .destination-device.vertical .destination-media-box{position:absolute;inset:0;height:100%}
      #previewSheet .destination-media-box img,#previewSheet .destination-media-box video{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;display:block;object-fit:cover!important;background:#111}
      #previewSheet .destination-media-placeholder{width:100%;height:100%;min-height:220px;display:grid;place-items:center;background:linear-gradient(145deg,#121721,#090c12);color:#7f8b9d;font-weight:800}
      #previewSheet .destination-profile{display:flex;align-items:center;gap:9px;padding:11px 12px;position:relative;z-index:3}
      #previewSheet .destination-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6d5df1,#a56cf6);font-size:12px;font-weight:950;color:#fff;flex:0 0 34px}
      #previewSheet .destination-profile-copy{min-width:0;flex:1}
      #previewSheet .destination-profile-copy strong{display:block;font-size:13px;line-height:1.1;color:#fff}
      #previewSheet .destination-profile-copy span{display:block;margin-top:3px;font-size:11px;color:#aab3c1}
      #previewSheet .destination-more{font-size:16px;letter-spacing:2px;color:#d8dde6}
      #previewSheet .destination-actions{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 4px;font-size:22px;line-height:1}
      #previewSheet .destination-actions-left{display:flex;gap:15px;align-items:center}
      #previewSheet .destination-caption{padding:5px 12px 13px;color:#eef1f5;font-size:13px;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere}
      #previewSheet .destination-caption strong{font-weight:900;margin-right:5px}
      #previewSheet .destination-facebook-caption{padding:0 12px 10px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;color:#f1f3f6}
      #previewSheet .destination-facebook-actions{display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1px solid rgba(255,255,255,.09);margin:8px 12px 0;padding:9px 0 12px;text-align:center;color:#c7ced8;font-size:12px;font-weight:800}
      #previewSheet .destination-vertical-overlay{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(to bottom,rgba(0,0,0,.30) 0,transparent 22%,transparent 57%,rgba(0,0,0,.72) 100%)}
      #previewSheet .destination-story-bars{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:10px 10px 0;position:relative;z-index:3}
      #previewSheet .destination-story-bars i{height:2px;background:rgba(255,255,255,.48);border-radius:99px}
      #previewSheet .destination-story-bars i:first-child{background:#fff}
      #previewSheet .destination-vertical-head{position:relative;z-index:3;display:flex;align-items:center;gap:8px;padding:8px 11px;color:#fff}
      #previewSheet .destination-vertical-head .destination-avatar{width:30px;height:30px;flex-basis:30px;font-size:10px}
      #previewSheet .destination-vertical-head strong{font-size:12px;flex:1}
      #previewSheet .destination-vertical-bottom{position:absolute;left:12px;right:58px;bottom:16px;z-index:3;color:#fff;text-shadow:0 1px 3px #000}
      #previewSheet .destination-vertical-bottom strong{display:block;font-size:14px;margin-bottom:6px}
      #previewSheet .destination-vertical-caption{font-size:12px;line-height:1.35;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      #previewSheet .destination-action-rail{position:absolute;right:10px;bottom:18px;z-index:3;display:grid;gap:14px;text-align:center;color:#fff;text-shadow:0 1px 3px #000;font-size:22px}
      #previewSheet .destination-action-rail span{display:grid;gap:2px;place-items:center}
      #previewSheet .destination-action-rail small{font-size:9px;font-weight:800}
      #previewSheet .destination-story-reply{position:absolute;left:12px;right:12px;bottom:14px;z-index:3;height:42px;border:1px solid rgba(255,255,255,.82);border-radius:22px;display:flex;align-items:center;padding:0 15px;color:#fff;font-size:12px}
      #previewSheet .destination-story-note{position:absolute;left:12px;right:12px;bottom:64px;z-index:3;text-align:center;font-size:10px;color:rgba(255,255,255,.72)}
      #previewSheet .destination-tiktok-tabs{position:absolute;top:13px;left:0;right:0;z-index:3;text-align:center;color:#fff;font-size:12px;font-weight:850;text-shadow:0 1px 3px #000}
      #previewSheet .destination-threads{padding:13px;background:#0b0c0f}
      #previewSheet .destination-threads-row{display:grid;grid-template-columns:40px 1fr;gap:10px}
      #previewSheet .destination-threads-content{min-width:0}
      #previewSheet .destination-threads-head{display:flex;align-items:center;gap:7px;font-size:13px}.destination-threads-head strong{flex:1}
      #previewSheet .destination-threads-caption{margin:7px 0 10px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;color:#f2f3f5}
      #previewSheet .destination-threads-media{border-radius:13px;overflow:hidden;aspect-ratio:4/5;background:#111}
      #previewSheet .destination-threads-media img,#previewSheet .destination-threads-media video{width:100%!important;height:100%!important;object-fit:cover!important;display:block}
      #previewSheet .destination-threads-actions{display:flex;gap:18px;margin-top:11px;color:#d1d5dc;font-size:17px}
      #previewSheet .destination-preview-dots{display:flex;justify-content:center;gap:7px;padding:0 16px 5px}
      #previewSheet .destination-preview-dots button{width:8px;height:8px;border:0;border-radius:50%;padding:0;background:#475061}
      #previewSheet .destination-preview-dots button.active{width:20px;border-radius:8px;background:#9b84ff}
      #previewSheet .destination-preview-empty{margin:12px 18px 18px;padding:18px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:#0d121a;color:#aab4c2;text-align:center;line-height:1.45}
    `;
    document.head.appendChild(style);
  }

  function selectedDestinations() {
    const result = [];
    const instagram = q('.platform-chip[data-platform="instagram"] input');
    if (instagram?.checked) {
      const type = q('input[name="igType"]:checked')?.value || 'post';
      result.push(DESTINATIONS[`instagram_${type}`] || DESTINATIONS.instagram_post);
    }
    const facebook = q('.platform-chip[data-platform="facebook"] input');
    if (facebook?.checked) {
      const type = q('input[name="fbType"]:checked')?.value || 'post';
      result.push(DESTINATIONS[`facebook_${type}`] || DESTINATIONS.facebook_post);
    }
    const tiktok = q('.platform-chip[data-platform="tiktok"] input');
    if (tiktok?.checked) result.push(DESTINATIONS.tiktok);
    const threads = q('.platform-chip[data-platform="threads"] input');
    if (threads?.checked) result.push(DESTINATIONS.threads);
    return result;
  }

  function currentCaption() {
    return String(q('#caption')?.value || '').trim();
  }

  function sourceMedia() {
    return q('#previewMedia img, #previewMedia video') || q('#mediaPreview img, #mediaPreview video') || q('#comicPreviewImg');
  }

  function makeMediaBox(className='destination-media-box') {
    const box = document.createElement('div');
    box.className = className;
    const source = sourceMedia();
    if (!source) {
      const placeholder = document.createElement('div');
      placeholder.className = 'destination-media-placeholder';
      placeholder.textContent = 'Your media';
      box.appendChild(placeholder);
      return box;
    }
    const media = source.cloneNode(true);
    media.removeAttribute('id');
    media.removeAttribute('style');
    media.className = 'destination-preview-media-node';
    if (media.tagName === 'VIDEO') {
      media.autoplay = false;
      media.muted = true;
      media.playsInline = true;
      media.preload = 'metadata';
      media.controls = true;
    }
    box.appendChild(media);
    return box;
  }

  function avatar() {
    const el = document.createElement('div');
    el.className = 'destination-avatar';
    el.textContent = 'RP';
    return el;
  }

  function profileHeader(subtitle='Sponsored preview') {
    const row = document.createElement('div');
    row.className = 'destination-profile';
    row.appendChild(avatar());
    const copy = document.createElement('div');
    copy.className = 'destination-profile-copy';
    const strong = document.createElement('strong');
    strong.textContent = 'Rick Parma';
    const span = document.createElement('span');
    span.textContent = subtitle;
    copy.append(strong,span);
    const more = document.createElement('div');
    more.className = 'destination-more';
    more.textContent = '•••';
    row.append(copy,more);
    return row;
  }

  function captionBlock(text, instagram=false) {
    const div = document.createElement('div');
    div.className = instagram ? 'destination-caption' : 'destination-facebook-caption';
    if (instagram) {
      const strong = document.createElement('strong');
      strong.textContent = 'rickparma';
      div.appendChild(strong);
      div.appendChild(document.createTextNode(text || 'Your caption will appear here.'));
    } else {
      div.textContent = text || 'Your caption will appear here.';
    }
    return div;
  }

  function buildInstagramPost(text) {
    const device = document.createElement('div');
    device.className = 'destination-device feed destination-instagram-post';
    device.appendChild(profileHeader('Instagram'));
    device.appendChild(makeMediaBox());
    const actions = document.createElement('div');
    actions.className = 'destination-actions';
    actions.innerHTML = '<div class="destination-actions-left"><span>♡</span><span>◯</span><span>➤</span></div><span>▢</span>';
    device.append(actions,captionBlock(text,true));
    return device;
  }

  function buildFacebookPost(text) {
    const device = document.createElement('div');
    device.className = 'destination-device feed destination-facebook-post';
    device.appendChild(profileHeader('Facebook · Just now'));
    device.appendChild(captionBlock(text,false));
    device.appendChild(makeMediaBox());
    const meta = document.createElement('div');
    meta.className = 'destination-facebook-actions';
    meta.innerHTML = '<span>Like</span><span>Comment</span><span>Share</span>';
    device.appendChild(meta);
    return device;
  }

  function verticalBase(kind,text) {
    const device = document.createElement('div');
    device.className = `destination-device vertical destination-${kind}`;
    device.appendChild(makeMediaBox());
    const shade = document.createElement('div');
    shade.className = 'destination-vertical-overlay';
    device.appendChild(shade);

    if (kind === 'instagram-story') {
      const bars = document.createElement('div');
      bars.className = 'destination-story-bars';
      bars.innerHTML = '<i></i><i></i><i></i>';
      const head = document.createElement('div');
      head.className = 'destination-vertical-head';
      head.appendChild(avatar());
      const name = document.createElement('strong'); name.textContent = 'rickparma · now';
      const more = document.createElement('span'); more.textContent = '•••';
      head.append(name,more);
      const note = document.createElement('div');
      note.className = 'destination-story-note';
      note.textContent = text ? 'Story captions are not displayed like feed captions.' : '';
      const reply = document.createElement('div');
      reply.className = 'destination-story-reply';
      reply.textContent = 'Send message';
      device.append(bars,head,note,reply);
      return device;
    }

    if (kind === 'tiktok') {
      const tabs = document.createElement('div');
      tabs.className = 'destination-tiktok-tabs';
      tabs.textContent = 'Following   For You';
      device.appendChild(tabs);
    } else {
      const head = document.createElement('div');
      head.className = 'destination-vertical-head';
      head.appendChild(avatar());
      const name = document.createElement('strong');
      name.textContent = kind === 'facebook-reel' ? 'Rick Parma · Facebook Reels' : 'rickparma · Instagram Reels';
      const more = document.createElement('span'); more.textContent = '•••';
      head.append(name,more);
      device.appendChild(head);
    }

    const bottom = document.createElement('div');
    bottom.className = 'destination-vertical-bottom';
    const user = document.createElement('strong');
    user.textContent = kind === 'tiktok' ? '@rickparma' : 'Rick Parma';
    const caption = document.createElement('div');
    caption.className = 'destination-vertical-caption';
    caption.textContent = text || 'Your caption will appear here.';
    bottom.append(user,caption);

    const rail = document.createElement('div');
    rail.className = 'destination-action-rail';
    rail.innerHTML = kind === 'tiktok'
      ? '<span>♡<small>Like</small></span><span>◯<small>Comment</small></span><span>↗<small>Share</small></span><span>♫</span>'
      : '<span>♡<small>Like</small></span><span>◯<small>Comment</small></span><span>➤<small>Share</small></span>';
    device.append(bottom,rail);
    return device;
  }

  function buildThreads(text) {
    const device = document.createElement('div');
    device.className = 'destination-device destination-threads';
    const row = document.createElement('div');
    row.className = 'destination-threads-row';
    row.appendChild(avatar());
    const content = document.createElement('div');
    content.className = 'destination-threads-content';
    const head = document.createElement('div');
    head.className = 'destination-threads-head';
    const name = document.createElement('strong'); name.textContent = 'rickparma';
    const age = document.createElement('span'); age.textContent = 'now';
    const more = document.createElement('span'); more.textContent = '•••';
    head.append(name,age,more);
    const caption = document.createElement('div');
    caption.className = 'destination-threads-caption';
    caption.textContent = text || 'Your caption will appear here.';
    const media = makeMediaBox('destination-threads-media');
    const actions = document.createElement('div');
    actions.className = 'destination-threads-actions';
    actions.innerHTML = '<span>♡</span><span>◯</span><span>↻</span><span>➤</span>';
    content.append(head,caption,media,actions);
    row.appendChild(content);
    device.appendChild(row);
    return device;
  }

  function deviceFor(destination,text) {
    if (destination.platform === 'instagram' && destination.type === 'post') return buildInstagramPost(text);
    if (destination.platform === 'instagram' && destination.type === 'story') return verticalBase('instagram-story',text);
    if (destination.platform === 'instagram' && destination.type === 'reel') return verticalBase('instagram-reel',text);
    if (destination.platform === 'facebook' && destination.type === 'reel') return verticalBase('facebook-reel',text);
    if (destination.platform === 'facebook') return buildFacebookPost(text);
    if (destination.platform === 'tiktok') return verticalBase('tiktok',text);
    if (destination.platform === 'threads') return buildThreads(text);
    return buildInstagramPost(text);
  }

  function ensureShell() {
    injectStyles();
    const sheet = q('#previewSheet');
    const panel = q('.sheet-panel',sheet);
    if (!sheet || !panel) return null;
    panel.classList.add('destination-preview-panel');
    const heading = q('.sheet-header strong',panel);
    if (heading) heading.textContent = 'Destination Previews';
    q('.phone-preview',panel)?.classList.add('destination-preview-legacy');

    let wrap = q('#destinationPreviewWrap',panel);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'destinationPreviewWrap';
      wrap.className = 'destination-preview-wrap';
      wrap.innerHTML = `
        <div class="destination-preview-intro"><strong id="destinationPreviewCounter">1 of 1</strong><div class="destination-preview-nav"><button id="destinationPreviewPrev" type="button" aria-label="Previous destination">‹</button><button id="destinationPreviewNext" type="button" aria-label="Next destination">›</button></div></div>
        <div id="destinationPreviewTrack" class="destination-preview-track" role="region" aria-label="Destination previews"></div>
        <div id="destinationPreviewDots" class="destination-preview-dots"></div>`;
      q('.phone-preview',panel)?.after(wrap) || panel.appendChild(wrap);
      wireCarousel(wrap);
    }
    return wrap;
  }

  function slideTo(index,behavior='smooth') {
    const track = q('#destinationPreviewTrack');
    const slides = qa('.destination-preview-slide',track);
    if (!track || !slides.length) return;
    currentIndex = Math.max(0,Math.min(slides.length-1,index));
    const slide = slides[currentIndex];
    const left = Math.max(0,slide.offsetLeft - (track.clientWidth - slide.clientWidth)/2);
    track.scrollTo({left,behavior});
    updateCarouselState();
  }

  function nearestIndex() {
    const track = q('#destinationPreviewTrack');
    const slides = qa('.destination-preview-slide',track);
    if (!track || !slides.length) return 0;
    const center = track.scrollLeft + track.clientWidth/2;
    let best = 0;
    let distance = Infinity;
    slides.forEach((slide,index) => {
      const candidate = slide.offsetLeft + slide.clientWidth/2;
      const delta = Math.abs(candidate-center);
      if (delta < distance) { distance = delta; best = index; }
    });
    return best;
  }

  function updateCarouselState() {
    const slides = qa('.destination-preview-slide',q('#destinationPreviewTrack'));
    if (!slides.length) return;
    currentIndex = Math.max(0,Math.min(slides.length-1,currentIndex));
    const counter = q('#destinationPreviewCounter');
    if (counter) counter.textContent = `${currentIndex+1} of ${slides.length} · ${slides[currentIndex].dataset.label || 'Preview'}`;
    qa('#destinationPreviewDots button').forEach((dot,index) => dot.classList.toggle('active',index === currentIndex));
    const prev = q('#destinationPreviewPrev');
    const next = q('#destinationPreviewNext');
    if (prev) prev.disabled = currentIndex <= 0;
    if (next) next.disabled = currentIndex >= slides.length-1;
  }

  function wireCarousel(wrap) {
    const track = q('#destinationPreviewTrack',wrap);
    q('#destinationPreviewPrev',wrap)?.addEventListener('click',() => slideTo(currentIndex-1));
    q('#destinationPreviewNext',wrap)?.addEventListener('click',() => slideTo(currentIndex+1));
    q('#destinationPreviewDots',wrap)?.addEventListener('click',event => {
      const dot = event.target.closest?.('[data-preview-index]');
      if (dot) slideTo(Number(dot.dataset.previewIndex));
    });
    track?.addEventListener('scroll',() => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        currentIndex = nearestIndex();
        updateCarouselState();
      });
    },{passive:true});

    // The app intentionally locks page gestures to vertical. Handle horizontal swipes
    // inside this one carousel ourselves without re-enabling horizontal page movement.
    track?.addEventListener('touchstart',event => {
      if (event.touches.length !== 1) return;
      const point = event.touches[0];
      touch = {x:point.clientX,y:point.clientY,scrollLeft:track.scrollLeft,horizontal:false};
    },{passive:true});
    track?.addEventListener('touchmove',event => {
      if (!touch || event.touches.length !== 1) return;
      const point = event.touches[0];
      const dx = point.clientX-touch.x;
      const dy = point.clientY-touch.y;
      if (!touch.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)*1.15) touch.horizontal = true;
      if (!touch.horizontal) return;
      event.preventDefault();
      track.scrollLeft = touch.scrollLeft-dx;
    },{passive:false});
    const finishTouch = () => {
      if (!touch) return;
      const wasHorizontal = touch.horizontal;
      touch = null;
      if (wasHorizontal) slideTo(nearestIndex());
    };
    track?.addEventListener('touchend',finishTouch,{passive:true});
    track?.addEventListener('touchcancel',finishTouch,{passive:true});
  }

  function renderDestinationPreviews() {
    const wrap = ensureShell();
    if (!wrap) return;
    const track = q('#destinationPreviewTrack',wrap);
    const dots = q('#destinationPreviewDots',wrap);
    if (!track || !dots) return;
    track.innerHTML = '';
    dots.innerHTML = '';
    const destinations = selectedDestinations();
    const text = currentCaption();

    if (!destinations.length) {
      const empty = document.createElement('div');
      empty.className = 'destination-preview-empty';
      empty.textContent = 'Choose at least one destination under Post To, then tap Preview again.';
      track.appendChild(empty);
      const counter = q('#destinationPreviewCounter');
      if (counter) counter.textContent = 'No destinations selected';
      q('#destinationPreviewPrev').disabled = true;
      q('#destinationPreviewNext').disabled = true;
      return;
    }

    destinations.forEach((destination,index) => {
      const slide = document.createElement('article');
      slide.className = 'destination-preview-slide';
      slide.dataset.label = destination.short;
      const label = document.createElement('div');
      label.className = 'destination-preview-label';
      const name = document.createElement('span'); name.textContent = destination.label;
      const hint = document.createElement('span'); hint.textContent = index === 0 ? 'Swipe left / right' : 'Destination preview';
      label.append(name,hint);
      slide.append(label,deviceFor(destination,text));
      track.appendChild(slide);

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.dataset.previewIndex = String(index);
      dot.setAttribute('aria-label',`Show ${destination.label}`);
      dots.appendChild(dot);
    });

    currentIndex = 0;
    requestAnimationFrame(() => {
      track.scrollLeft = 0;
      updateCarouselState();
    });
  }

  function liveRefresh(event) {
    const sheet = q('#previewSheet');
    if (!sheet || sheet.classList.contains('hidden')) return;
    const target = event?.target;
    if (target && !target.matches?.('#caption,.platform-chip input,input[name="igType"],input[name="fbType"],#mediaInput')) return;
    renderDestinationPreviews();
  }

  function boot() {
    ensureShell();
    document.addEventListener('click',event => {
      if (event.target.closest?.('#previewBtn')) renderDestinationPreviews();
    },{capture:true});
    document.addEventListener('change',liveRefresh);
    q('#caption')?.addEventListener('input',liveRefresh);
    q('#mediaInput')?.addEventListener('change',() => setTimeout(() => {
      if (!q('#previewSheet')?.classList.contains('hidden')) renderDestinationPreviews();
    },120));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
