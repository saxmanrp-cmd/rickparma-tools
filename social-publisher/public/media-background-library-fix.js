// Media Background Library hotfix: make the library full-width and harden iPhone uploads.
(() => {
  const q = (selector, root=document) => root.querySelector(selector);

  function injectStyles() {
    if (q('#mediaBackgroundLibraryFixStyles')) return;
    const style = document.createElement('style');
    style.id = 'mediaBackgroundLibraryFixStyles';
    style.textContent = `
      body.recovery-easy #view-media{width:100%!important;min-width:0!important}
      body.recovery-easy #view-media #mediaLibrary.media-library{
        display:block!important;
        grid-template-columns:none!important;
        width:100%!important;
        max-width:none!important;
        min-width:0!important;
      }
      body.recovery-easy #view-media #mediaLibrary>.bg-media-shell{
        width:100%!important;
        max-width:none!important;
        min-width:0!important;
      }
      body.recovery-easy #view-media .bg-media-toolbar,
      body.recovery-easy #view-media .bg-edit-panel,
      body.recovery-easy #view-media .bg-media-grid,
      body.recovery-easy #view-media .bg-upload-stage{
        width:100%!important;
        max-width:none!important;
        min-width:0!important;
      }
      body.recovery-easy #view-media .bg-upload-item{
        width:100%!important;
        grid-template-columns:76px minmax(0,1fr)!important;
      }
      body.recovery-easy #view-media .bg-upload-item img{
        width:76px!important;
        height:96px!important;
      }
      body.recovery-easy #view-media .bg-upload-item>div,
      body.recovery-easy #view-media .bg-media-toolbar-row>div,
      body.recovery-easy #view-media .bg-edit-fields>div{
        min-width:0!important;
      }
      body.recovery-easy #view-media .bg-upload-item input,
      body.recovery-easy #view-media .bg-media-input,
      body.recovery-easy #view-media .bg-media-select{
        min-width:0!important;
        max-width:100%!important;
      }
      @media(max-width:430px){
        body.recovery-easy #view-media .bg-media-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      }
    `;
    document.head.appendChild(style);
  }

  function safeHeaderValue(value='') {
    const source = String(value || '');
    let clean = '';
    for (const char of source) {
      const code = char.codePointAt(0);
      if (code >= 32 && code <= 126) clean += char;
      else if (char === '’' || char === '‘') clean += "'";
      else if (char === '“' || char === '”') clean += '"';
      else if (char === '–' || char === '—') clean += '-';
      else clean += ' ';
    }
    return clean.replace(/\s+/g,' ').trim().slice(0,120) || 'Background';
  }

  function getHeader(headers, name) {
    if (!headers) return '';
    if (headers instanceof Headers) return headers.get(name) || '';
    if (Array.isArray(headers)) {
      const match = headers.find(([key]) => String(key).toLowerCase() === name.toLowerCase());
      return match ? String(match[1] || '') : '';
    }
    const key = Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key] || '') : '';
  }

  function setSafeHeaders(headers, replacements) {
    if (headers instanceof Headers) {
      const next = new Headers(headers);
      for (const [key,value] of Object.entries(replacements)) next.set(key,value);
      return next;
    }
    if (Array.isArray(headers)) {
      const map = new Map(headers.map(([key,value]) => [String(key).toLowerCase(),[key,value]]));
      for (const [key,value] of Object.entries(replacements)) map.set(key.toLowerCase(),[key,value]);
      return [...map.values()];
    }
    return {...(headers || {}),...replacements};
  }

  function patchFetchForTemplateUploads() {
    if (window.fetch.__mediaBackgroundUploadSafe) return;
    const nativeFetch = window.fetch.bind(window);

    const wrapped = async (input, init={}) => {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      const isTemplatePut = method === 'PUT' && /\/api\/comic-templates\//.test(url);
      if (!isTemplatePut || !init?.headers) return nativeFetch(input,init);

      const exactName = getHeader(init.headers,'x-template-name');
      const exactCategory = getHeader(init.headers,'x-template-category');
      const safeName = safeHeaderValue(exactName);
      const safeCategory = safeHeaderValue(exactCategory || 'Rick Parma Comics').slice(0,80);
      const nextInit = {
        ...init,
        headers:setSafeHeaders(init.headers,{
          'x-template-name':safeName,
          'x-template-category':safeCategory,
        }),
      };

      const response = await nativeFetch(input,nextInit);
      if (!response.ok || (safeName === exactName && safeCategory === exactCategory)) return response;

      try {
        const data = await response.clone().json();
        const id = data?.template?.id;
        if (id) {
          await nativeFetch(`/api/comic-templates/${encodeURIComponent(id)}`,{
            method:'PATCH',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({
              name:exactName || safeName,
              category:exactCategory || safeCategory,
            }),
          });
        }
      } catch {}
      return response;
    };

    wrapped.__mediaBackgroundUploadSafe = true;
    window.fetch = wrapped;
  }

  function addRandomUuidFallback() {
    if (!window.crypto || typeof window.crypto.randomUUID === 'function') return;
    const fallback = () => {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map(value => value.toString(16).padStart(2,'0'));
      return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10).join('')}`;
    };
    try { window.crypto.randomUUID = fallback; }
    catch {
      try { Object.defineProperty(window.crypto,'randomUUID',{value:fallback,configurable:true}); } catch {}
    }
  }

  function improveUploadMessage() {
    const view = q('#view-media');
    if (!view) return;
    const observer = new MutationObserver(() => {
      const status = q('#bgMediaStatus',view);
      if (status && status.textContent.trim() === 'Type error') {
        status.textContent = 'Upload hit an iPhone compatibility error. Please try Upload Backgrounds again.';
      }
    });
    observer.observe(view,{childList:true,subtree:true,characterData:true});
  }

  function boot() {
    injectStyles();
    addRandomUuidFallback();
    patchFetchForTemplateUploads();
    improveUploadMessage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
