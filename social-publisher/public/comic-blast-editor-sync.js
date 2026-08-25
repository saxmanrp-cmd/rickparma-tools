// Keep full-screen contenteditable typing synced without resetting the iPhone caret.
(() => {
  const q = selector => document.querySelector(selector);

  function updateFit(text) {
    const status = q('#comicFullscreenStatus');
    if (!status || !text) return;
    requestAnimationFrame(() => {
      const tooBig = text.scrollHeight > text.clientHeight + 2 || text.scrollWidth > text.clientWidth + 2;
      status.className = `comic-fullscreen-status ${tooBig ? 'warn' : 'good'}`;
      status.textContent = tooBig ? 'Text is outside the bubble. Pinch smaller or tap A−.' : '✓ Text fits inside the speech bubble.';
    });
  }

  document.addEventListener('input', event => {
    const target = event.target;
    if (target?.id !== 'comicFullscreenText') return;
    // The first enhancer listener mirrors through the textarea and can reset the
    // iPhone contenteditable caret. Handle this input directly instead.
    event.stopImmediatePropagation();
    const value = String(target.innerText || '').slice(0,2200);
    const inline = q('#comicBubbleText');
    if (inline) {
      inline.innerText = value;
      inline.dispatchEvent(new Event('input',{bubbles:true}));
    } else {
      const area = q('#comicMessage');
      if (area) {
        area.value = value;
        area.dispatchEvent(new Event('input',{bubbles:true}));
      }
    }
    updateFit(target);
  },true);
})();
