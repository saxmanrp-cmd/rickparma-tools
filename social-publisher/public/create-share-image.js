// Share/save the final image from the bottom of the Create page.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);
  const BUTTON_ID = 'createShareImageBtn';

  function toastSafe(message) {
    if (typeof toast === 'function') toast(message);
  }

  function currentMediaValue() {
    try { return typeof state !== 'undefined' ? state?.currentMedia : null; }
    catch { return null; }
  }

  function currentImageFile() {
    try {
      if (typeof currentFile !== 'undefined' && currentFile instanceof Blob && String(currentFile.type || '').startsWith('image/')) {
        if (currentFile instanceof File) return currentFile;
        return new File([currentFile], `social-publisher-${Date.now()}.jpg`, { type:currentFile.type || 'image/jpeg', lastModified:Date.now() });
      }
    } catch {}
    return null;
  }

  function mediaLooksLikeImage(media=currentMediaValue()) {
    if (currentImageFile()) return true;
    return Boolean(media && String(media.type || '').startsWith('image/') && (media.dataUrl || media.url || media.mediaKey));
  }

  function safeFileName(media, type='image/jpeg') {
    const fromMedia = String(media?.name || '').trim().replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'');
    if (fromMedia && /\.[a-z0-9]{2,5}$/i.test(fromMedia)) return fromMedia;
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    return `${fromMedia || 'social-publisher-image'}-${Date.now()}.${ext}`;
  }

  async function fileFromCurrentMedia() {
    const direct = currentImageFile();
    if (direct) return direct;

    const media = currentMediaValue();
    if (!media || !String(media.type || '').startsWith('image/')) throw new Error('Choose or make an image first.');
    const source = media.dataUrl || media.url || (media.mediaKey ? `/media/${encodeURIComponent(media.mediaKey)}` : '');
    if (!source) throw new Error('That image is not available to share yet.');

    const response = await fetch(source);
    if (!response.ok) throw new Error('Could not load the image for sharing.');
    const blob = await response.blob();
    const type = blob.type || media.type || 'image/jpeg';
    if (!String(type).startsWith('image/')) throw new Error('The selected media is not an image.');
    return new File([blob], safeFileName(media,type), { type, lastModified:Date.now() });
  }

  function downloadFallback(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name || `social-publisher-image-${Date.now()}.jpg`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1500);
    toastSafe('Image ready to save.');
  }

  async function shareFile(file) {
    const payload = { files:[file], title:'Social Publisher Image' };
    let canShareFiles = Boolean(navigator.share);
    if (canShareFiles && typeof navigator.canShare === 'function') {
      try { canShareFiles = navigator.canShare(payload); }
      catch { canShareFiles = false; }
    }

    if (canShareFiles) {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    downloadFallback(file);
  }

  async function shareCurrentImage(event) {
    event?.preventDefault?.();
    const button = q(`#${BUTTON_ID}`);
    if (!button || button.disabled) return;
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing Image…';
    try {
      const direct = currentImageFile();
      const file = direct || await fileFromCurrentMedia();
      await shareFile(file);
    } catch (error) {
      toastSafe(error?.message || 'Could not share this image.');
    } finally {
      button.textContent = old;
      refreshButton();
    }
  }

  function refreshButton() {
    const button = q(`#${BUTTON_ID}`);
    if (!button) return;
    const ready = mediaLooksLikeImage();
    button.disabled = !ready;
    button.setAttribute('aria-disabled',ready ? 'false' : 'true');
    button.title = ready ? 'Open the iPhone share sheet to save or share this finished image.' : 'Choose or make an image first.';
  }

  function injectButton() {
    if (q(`#${BUTTON_ID}`)) return refreshButton();
    const composer = q('#view-create .composer');
    if (!composer) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.className = 'button secondary full create-share-image-button';
    button.type = 'button';
    button.textContent = '↗ Share / Save Image';
    button.addEventListener('click',shareCurrentImage);
    composer.appendChild(button);
    refreshButton();
  }

  function injectStyles() {
    if (q('#createShareImageStyles')) return;
    const style = document.createElement('style');
    style.id = 'createShareImageStyles';
    style.textContent = `
      body.recovery-easy #createShareImageBtn{margin-top:10px;min-height:52px!important;font-size:16px!important;font-weight:900!important}
      body.recovery-easy #createShareImageBtn:disabled{opacity:.42}
    `;
    document.head.appendChild(style);
  }

  function wrapMediaRenderer() {
    try {
      if (typeof renderCurrentMedia !== 'function' || renderCurrentMedia.__shareSaveWrapped) return;
      const base = renderCurrentMedia;
      const wrapped = function(...args) {
        const result = base.apply(this,args);
        queueMicrotask(refreshButton);
        return result;
      };
      wrapped.__shareSaveWrapped = true;
      renderCurrentMedia = wrapped;
    } catch {}
  }

  function boot() {
    injectStyles();
    injectButton();
    wrapMediaRenderer();
    document.addEventListener('change',event => {
      if (event.target?.matches?.('#mediaInput,#comicScenePicker,#comicFormatPicker')) setTimeout(refreshButton,50);
    },true);
    document.addEventListener('click',event => {
      if (event.target.closest?.('#comicMakeBtn,#removeMediaBtn,#changeMediaBtn')) {
        [80,250,700].forEach(delay => setTimeout(refreshButton,delay));
      }
    },true);
    const create = q('#view-create');
    if (create) new MutationObserver(() => {
      if (!q(`#${BUTTON_ID}`)) injectButton();
    }).observe(create,{childList:true,subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
