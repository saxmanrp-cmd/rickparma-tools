// Polish the destination preview carousel for iPhone: accurate platform frames, faster native swiping, and no duplicate generated-media preview.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];
  let settleTimer = 0;

  function injectStyles() {
    if (q('#destinationPreviewPolishStyles')) return;
    const style = document.createElement('style');
    style.id = 'destinationPreviewPolishStyles';
    style.textContent = `
      /* Generated comics already have the large mapped preview. Never show the compact duplicate. */
      body.stage15-comic-generated-media #dropZone.stage15-compact-media,
      body.stage15-comic-generated-media #mediaPreview,
      body.stage15-comic-generated-media #mediaActions{display:none!important}

      /* Use native iOS momentum. Avoid expensive per-frame smooth scrolling / forced compositing. */
      #previewSheet .destination-preview-track{
        gap:0!important;
        padding:6px 14px 12px!important;
        scroll-padding:14px!important;
        scroll-snap-type:x mandatory!important;
        scroll-behavior:auto!important;
        -webkit-overflow-scrolling:touch!important;
        touch-action:pan-x!important;
        overscroll-behavior-x:contain!important;
        contain:none!important;
      }
      #previewSheet .destination-preview-slide{
        flex:0 0 100%!important;
        width:100%!important;
        max-width:none!important;
        padding:0 3px!important;
        box-sizing:border-box!important;
        scroll-snap-align:center!important;
        scroll-snap-stop:normal!important;
        contain:none!important;
        transform:none!important;
      }
      #previewSheet .destination-device{transform:none!important;contain:none!important}
      #previewSheet .destination-preview-media-node{transform:none!important;backface-visibility:visible!important}

      /* The media viewport itself is the destination ratio. */
      #previewSheet .destination-preview-slide[data-ratio="9:16"] .destination-device.vertical{
        width:min(100%,320px)!important;
        aspect-ratio:9/16!important;
        height:auto!important;
        max-height:none!important;
        margin:0 auto!important;
      }
      #previewSheet .destination-preview-slide[data-ratio="4:5"] .destination-device.feed .destination-media-box{
        width:100%!important;
        aspect-ratio:4/5!important;
      }
      #previewSheet .destination-preview-slide[data-ratio="9:16"] .destination-media-box{
        position:absolute!important;
        inset:0!important;
        width:100%!important;
        height:100%!important;
        aspect-ratio:9/16!important;
      }

      /* Threads preserves the uploaded image's portrait ratio instead of forcing a 4:5 crop. */
      #previewSheet .destination-preview-slide[data-ratio="source"] .destination-threads-media{
        width:100%!important;
        aspect-ratio:var(--threads-source-ratio,4/5)!important;
        max-height:62vh!important;
        background:#111!important;
      }
      #previewSheet .destination-preview-slide[data-ratio="source"] .destination-threads-media img,
      #previewSheet .destination-preview-slide[data-ratio="source"] .destination-threads-media video{
        width:100%!important;
        height:100%!important;
        object-fit:contain!important;
        background:#111!important;
      }

      #previewSheet .destination-ratio-note{
        margin:7px 2px 0;
        color:#8f9bad;
        font-size:11px;
        line-height:1.35;
        text-align:center;
      }
    `;
    document.head.appendChild(style);
  }

  function finalMedia() {
    // For a generated comic, #mediaPreview contains the flattened final graphic with bubble text.
    // It can be CSS-hidden and still be the correct source for destination previews.
    return q('#mediaPreview img, #mediaPreview video') || q('#comicPreviewImg') || q('#previewMedia img, #previewMedia video');
  }

  function mediaRatio(media) {
    const width = Number(media?.naturalWidth || media?.videoWidth || 0);
    const height = Number(media?.naturalHeight || media?.videoHeight || 0);
    if (!width || !height) return 4/5;
    return width / height;
  }

  function sourceLabel(ratio) {
    if (Math.abs(ratio - 9/16) < 0.035) return '9:16 source';
    if (Math.abs(ratio - 4/5) < 0.05) return '4:5 source';
    return `${ratio.toFixed(2)}:1 source`;
  }

  function replacePreviewMedia() {
    const source = finalMedia();
    if (!source) return;
    const sourceSrc = source.currentSrc || source.src || '';
    if (!sourceSrc) return;

    qa('#destinationPreviewTrack .destination-preview-media-node').forEach((node,index) => {
      if (node.tagName !== source.tagName) return;
      if (node.tagName === 'IMG') {
        if (node.src !== sourceSrc) node.src = sourceSrc;
        node.loading = index === 0 ? 'eager' : 'lazy';
        node.decoding = 'async';
      } else if (node.tagName === 'VIDEO') {
        if (node.src !== sourceSrc) node.src = sourceSrc;
        node.preload = index === 0 ? 'metadata' : 'none';
        node.muted = true;
        node.playsInline = true;
      }
    });
  }

  function fixRatios() {
    const source = finalMedia();
    const ratio = mediaRatio(source);

    qa('#destinationPreviewTrack .destination-preview-slide').forEach(slide => {
      const label = slide.dataset.label || '';
      const hint = q('.destination-preview-label span:last-child',slide);
      const device = q('.destination-device',slide);
      if (!device) return;

      if (/Threads/i.test(label)) {
        slide.dataset.ratio = 'source';
        device.style.setProperty('--threads-source-ratio', String(ratio));
        if (hint) hint.textContent = `Original · ${sourceLabel(ratio)}`;
      } else if (/Story|Reel|TikTok/i.test(label)) {
        slide.dataset.ratio = '9:16';
        if (hint) hint.textContent = '9:16 · full-screen';
      } else {
        slide.dataset.ratio = '4:5';
        if (hint) hint.textContent = '4:5 · feed';
      }

      let note = q('.destination-ratio-note',slide);
      if (!note) {
        note = document.createElement('div');
        note.className = 'destination-ratio-note';
        slide.appendChild(note);
      }
      if (slide.dataset.ratio === '4:5' && ratio < 0.72) {
        note.textContent = 'A 9:16 upload is shown with the same 4:5 feed crop viewers would see.';
      } else if (slide.dataset.ratio === '9:16' && ratio > 0.72) {
        note.textContent = 'This destination uses a 9:16 full-screen frame, so a 4:5 upload may crop at the sides.';
      } else if (slide.dataset.ratio === 'source') {
        note.textContent = 'Threads keeps the uploaded image ratio rather than forcing a 4:5 frame.';
      } else {
        note.textContent = 'Preview frame matches this destination.';
      }
    });
  }

  function nearestIndex(track) {
    const slides = qa('.destination-preview-slide',track);
    if (!slides.length) return 0;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    slides.forEach((slide,index) => {
      const distance = Math.abs((slide.offsetLeft + slide.clientWidth / 2) - center);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  }

  function updateState(track) {
    const slides = qa('.destination-preview-slide',track);
    if (!slides.length) return;
    const index = nearestIndex(track);
    const counter = q('#destinationPreviewCounter');
    if (counter) counter.textContent = `${index+1} of ${slides.length} · ${slides[index].dataset.label || 'Preview'}`;
    qa('#destinationPreviewDots button').forEach((dot,dotIndex) => dot.classList.toggle('active',dotIndex === index));
    const prev = q('#destinationPreviewPrev');
    const next = q('#destinationPreviewNext');
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === slides.length-1;
  }

  function installLightweightScrollTracking() {
    const oldTrack = q('#destinationPreviewTrack');
    if (!oldTrack || oldTrack.dataset.polished === '1') return oldTrack;

    // Cloning drops the original per-scroll requestAnimationFrame listener. The carousel's
    // arrow/dot handlers still find this track by id, so navigation keeps working.
    const track = oldTrack.cloneNode(true);
    track.dataset.polished = '1';
    oldTrack.replaceWith(track);

    const settle = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => updateState(track),90);
    };
    if ('onscrollend' in window) track.addEventListener('scrollend',() => updateState(track),{passive:true});
    else track.addEventListener('scroll',settle,{passive:true});
    return track;
  }

  function polish() {
    injectStyles();
    const track = installLightweightScrollTracking();
    if (!track) return;
    replacePreviewMedia();
    fixRatios();
    updateState(track);
  }

  function keepGeneratedCompactPreviewHidden() {
    document.addEventListener('click',event => {
      if (!event.target.closest?.('#comicMakeBtn')) return;
      document.body.classList.add('stage15-comic-generated-media');
      setTimeout(() => document.body.classList.add('stage15-comic-generated-media'),120);
      setTimeout(() => document.body.classList.add('stage15-comic-generated-media'),600);
    },{capture:true});
  }

  function boot() {
    injectStyles();
    keepGeneratedCompactPreviewHidden();
    document.addEventListener('click',event => {
      if (!event.target.closest?.('#previewBtn')) return;
      // The original carousel renders in capture phase first. Polish after its DOM is ready.
      requestAnimationFrame(() => requestAnimationFrame(polish));
    },{capture:true});
    document.addEventListener('change',event => {
      if (!q('#previewSheet') || q('#previewSheet')?.classList.contains('hidden')) return;
      if (event.target?.matches?.('.platform-chip input,input[name="igType"],input[name="fbType"],#mediaInput')) {
        setTimeout(polish,40);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
