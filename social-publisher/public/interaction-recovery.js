// Mobile interaction recovery for iPhone Safari/Chrome.
// Keeps the app usable even if a stale/invisible overlay or pointer-events state survives login.
(() => {
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  let syntheticTap = false;
  let touchStart = null;

  const style = document.createElement('style');
  style.id = 'interactionRecoveryStyles';
  style.textContent = `
    body:not(.auth-open) .app-shell{visibility:visible!important;pointer-events:auto!important;user-select:auto!important;-webkit-user-select:auto!important}
    body:not(.auth-open) .app-shell button,
    body:not(.auth-open) .app-shell input,
    body:not(.auth-open) .app-shell textarea,
    body:not(.auth-open) .app-shell select,
    body:not(.auth-open) .app-shell label,
    body:not(.auth-open) .app-shell summary,
    body:not(.auth-open) .app-shell [data-view],
    body:not(.auth-open) .app-shell [data-jump]{pointer-events:auto!important}
    .sheet.hidden,.login-overlay.hidden{display:none!important;visibility:hidden!important;pointer-events:none!important}
    .bottom-nav{pointer-events:auto!important}
    .bottom-nav .nav-item{pointer-events:auto!important;touch-action:manipulation!important}
  `;
  document.head.appendChild(style);

  function cleanAuthResidue() {
    const login = q('#loginOverlay');
    if (!login || login.classList.contains('hidden')) {
      document.documentElement.classList.remove('auth-open');
      document.body?.classList.remove('auth-open');
    }
    qa('.sheet.hidden,.login-overlay.hidden').forEach(el => {
      el.style.pointerEvents = 'none';
      el.setAttribute('aria-hidden','true');
    });
    const shell = q('.app-shell');
    if (shell && !document.body?.classList.contains('auth-open')) {
      shell.style.pointerEvents = 'auto';
      shell.style.visibility = 'visible';
      shell.removeAttribute('inert');
    }
  }

  function activateView(view, button) {
    const panel = q(`#view-${view}`);
    if (!panel) return false;
    qa('.view').forEach(el => el.classList.remove('active'));
    qa('.nav-item').forEach(el => el.classList.toggle('active', el === button));
    panel.classList.add('active');
    const title = q('#pageTitle');
    const names = { create:'New Post', calendar:'Calendar', history:'Posts', media:'Media', settings:'Settings' };
    if (title && names[view]) title.textContent = names[view];
    window.scrollTo(0,0);
    try { localStorage.setItem('socialPublisherLastView', view); } catch {}
    return true;
  }

  function isVisible(el) {
    if (!el || el.disabled) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.bottom >= 0 && r.top <= innerHeight;
  }

  function containsPoint(el, x, y) {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function interactiveAt(x, y) {
    const selector = 'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),label[for],summary,[data-jump],.platform-chip,.segment';
    const candidates = qa(selector).filter(el => isVisible(el) && containsPoint(el, x, y));
    candidates.sort((a,b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    });
    return candidates[0] || null;
  }

  function invoke(el) {
    if (!el || syntheticTap) return false;
    const nav = el.closest?.('.nav-item[data-view]');
    if (nav) return activateView(nav.dataset.view, nav);

    if (el.matches?.('input,textarea,select')) {
      el.focus({ preventScroll:true });
      if (el.matches('input[type="checkbox"],input[type="radio"]')) el.click();
      return true;
    }

    const label = el.closest?.('label[for]');
    if (label) {
      const control = document.getElementById(label.htmlFor);
      if (control?.type === 'file') {
        syntheticTap = true;
        try { control.click(); } finally { setTimeout(() => syntheticTap = false, 0); }
        return true;
      }
    }

    syntheticTap = true;
    try { el.click(); } finally { setTimeout(() => syntheticTap = false, 0); }
    return true;
  }

  function recoverAt(x, y, originalTarget) {
    cleanAuthResidue();

    const direct = originalTarget?.closest?.('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),label[for],summary,[data-jump],.platform-chip,.segment,.nav-item[data-view]');
    if (direct && isVisible(direct)) return; // Normal browser event should handle it.

    // Bottom navigation gets a coordinate fallback that does not depend on hit-testing.
    const nav = q('.bottom-nav');
    if (nav && isVisible(nav) && containsPoint(nav, x, y)) {
      const items = qa('.bottom-nav .nav-item[data-view]').filter(isVisible);
      const item = items.find(el => containsPoint(el, x, y));
      if (item) { activateView(item.dataset.view, item); return; }
      if (items.length) {
        const index = Math.max(0, Math.min(items.length - 1, Math.floor((x / innerWidth) * items.length)));
        const fallback = items[index];
        activateView(fallback.dataset.view, fallback);
        return;
      }
    }

    const found = interactiveAt(x, y);
    if (found) invoke(found);
  }

  document.addEventListener('touchstart', event => {
    if (event.touches?.length !== 1) return;
    const t = event.touches[0];
    touchStart = { x:t.clientX, y:t.clientY };
  }, { capture:true, passive:true });

  document.addEventListener('touchend', event => {
    if (syntheticTap || !touchStart || event.changedTouches?.length !== 1) return;
    const t = event.changedTouches[0];
    const moved = Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y);
    touchStart = null;
    if (moved > 14) return; // It was a scroll, not a tap.
    setTimeout(() => recoverAt(t.clientX, t.clientY, event.target), 0);
  }, { capture:true, passive:true });

  document.addEventListener('pointerup', event => {
    if (syntheticTap || event.pointerType === 'touch') return;
    recoverAt(event.clientX, event.clientY, event.target);
  }, true);

  cleanAuthResidue();
  document.addEventListener('DOMContentLoaded', cleanAuthResidue, { once:true });
  window.addEventListener('pageshow', cleanAuthResidue);
  let passes = 0;
  const timer = setInterval(() => {
    cleanAuthResidue();
    if (++passes >= 10) clearInterval(timer);
  }, 1000);
})();
