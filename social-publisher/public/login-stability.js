// Login stability hotfix: keep authentication isolated from the app shell on iPhone/webviews.
(() => {
  const q = selector => document.querySelector(selector);
  const overlay = q('#loginOverlay');
  if (!overlay) return;

  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const fromChatGPT = /chatgpt\.com|openai\.com/i.test(document.referrer || '');
  let passwordTouched = false;
  let wasOpen = false;
  let passkeyTimer = null;

  const style = document.createElement('style');
  style.id = 'loginStabilityStyles';
  style.textContent = `
    html.auth-open, body.auth-open{overflow:hidden!important;overscroll-behavior:none!important;height:100%!important}
    body.auth-open .app-shell{visibility:hidden!important;pointer-events:none!important;user-select:none!important;-webkit-user-select:none!important}
    body.auth-open .login-overlay{visibility:visible!important;pointer-events:auto!important;position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;min-height:-webkit-fill-available!important;overflow:auto!important;overscroll-behavior:none!important;display:grid!important;place-items:center!important;padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))!important;z-index:1000!important}
    body.auth-open .login-card{position:relative!important;z-index:1001!important;width:min(100%,360px)!important;margin:auto!important;padding:8px 0!important}
    body.auth-open #appPassword{display:block!important;visibility:visible!important;pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;opacity:1!important}
    body.auth-open #loginForm button{pointer-events:auto!important;touch-action:manipulation!important}
    .login-browser-help{font-size:12px;line-height:1.45;color:#9aa5b5;text-align:center;margin-top:-2px}
    .login-browser-help strong{color:#d8def0}
    .login-browser-help.visible{display:block!important}
  `;
  document.head.appendChild(style);

  function ensureHelp() {
    let help = q('#loginBrowserHelp');
    if (help) return help;
    help = document.createElement('div');
    help.id = 'loginBrowserHelp';
    help.className = 'login-browser-help hidden';
    help.innerHTML = '<strong>Face ID tip:</strong> if you opened this from ChatGPT or another in-app browser, use Safari or your Home Screen for Face ID. Password login works here too.';
    q('#loginForm')?.appendChild(help);
    return help;
  }

  function showHelp() {
    const help = ensureHelp();
    help?.classList.remove('hidden');
    help?.classList.add('visible');
  }

  function keepPasswordUsable() {
    const input = q('#appPassword');
    if (!input) return;
    input.disabled = false;
    input.readOnly = false;
    input.tabIndex = 0;
    input.setAttribute('inputmode','text');
    if (!input.dataset.touchBound) {
      input.dataset.touchBound = 'true';
      input.addEventListener('pointerdown', () => { passwordTouched = true; }, { passive:true });
      input.addEventListener('touchstart', () => { passwordTouched = true; }, { passive:true });
    }
  }

  function releaseProgrammaticFocus() {
    if (!isIOS || passwordTouched) return;
    const input = q('#appPassword');
    if (input && document.activeElement === input) input.blur();
  }

  async function checkPasskeyEnvironment() {
    const button = q('#passkeyLoginBtn');
    const divider = q('#passkeyDivider');
    if (!button || !window.PublicKeyCredential) return;

    if (fromChatGPT) {
      button.classList.add('hidden');
      divider?.classList.add('hidden');
      showHelp();
      return;
    }

    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return;
    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        button.classList.add('hidden');
        divider?.classList.add('hidden');
        showHelp();
      }
    } catch {
      showHelp();
    }
  }

  function bindPasskeyFeedback() {
    const button = q('#passkeyLoginBtn');
    if (!button || button.dataset.stabilityBound) return;
    button.dataset.stabilityBound = 'true';
    button.addEventListener('click', () => {
      clearTimeout(passkeyTimer);
      const help = ensureHelp();
      help?.classList.add('hidden');
      help?.classList.remove('visible');
      passkeyTimer = setTimeout(() => {
        if (!overlay.classList.contains('hidden')) showHelp();
      }, 5000);
    }, { capture:true });
  }

  function bindPasswordFallback() {
    const form = q('#loginForm');
    const input = q('#appPassword');
    if (!form || !input || form.dataset.passwordFallbackBound) return;
    form.dataset.passwordFallbackBound = 'true';

    form.addEventListener('submit', async event => {
      if (overlay.classList.contains('hidden')) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const password = String(input.value || '');
      const error = q('#loginError');
      const button = form.querySelector('button[type="submit"]');
      if (!password) {
        error.textContent = 'Enter your password.';
        error.classList.remove('hidden');
        passwordTouched = true;
        input.focus();
        return;
      }

      const oldText = button?.textContent || 'Open App';
      if (button) { button.disabled = true; button.textContent = 'Opening…'; }
      error.classList.add('hidden');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch('/api/auth/login', {
          method:'POST',
          cache:'no-store',
          headers:{ 'content-type':'application/json', accept:'application/json' },
          body:JSON.stringify({ password }),
          signal:controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          error.textContent = data.error || 'Incorrect password.';
          error.classList.remove('hidden');
          return;
        }
        location.reload();
      } catch (err) {
        error.textContent = err?.name === 'AbortError'
          ? 'Login timed out. Try again, or open this page in Safari.'
          : 'Could not sign in. Try again.';
        error.classList.remove('hidden');
      } finally {
        clearTimeout(timeout);
        if (button) { button.disabled = false; button.textContent = oldText; }
      }
    }, { capture:true });
  }

  function syncAuthState() {
    const open = !overlay.classList.contains('hidden');
    document.documentElement.classList.toggle('auth-open', open);
    document.body.classList.toggle('auth-open', open);

    if (!open) {
      clearTimeout(passkeyTimer);
      wasOpen = false;
      return;
    }

    if (!wasOpen) {
      passwordTouched = false;
      wasOpen = true;
    }

    keepPasswordUsable();
    bindPasswordFallback();
    window.scrollTo(0,0);
    requestAnimationFrame(() => window.scrollTo(0,0));
    setTimeout(() => {
      keepPasswordUsable();
      releaseProgrammaticFocus();
      bindPasskeyFeedback();
      bindPasswordFallback();
      checkPasskeyEnvironment();
    }, 140);
  }

  new MutationObserver(syncAuthState).observe(overlay, { attributes:true, attributeFilter:['class'] });
  new MutationObserver(() => {
    if (!overlay.classList.contains('hidden')) {
      keepPasswordUsable();
      bindPasskeyFeedback();
      bindPasswordFallback();
      checkPasskeyEnvironment();
    }
  }).observe(q('#loginForm') || overlay, { childList:true, subtree:true });

  window.addEventListener('pageshow', syncAuthState);
  window.addEventListener('orientationchange', () => setTimeout(syncAuthState,100));
  window.visualViewport?.addEventListener('resize', () => {
    if (!overlay.classList.contains('hidden')) overlay.scrollTop = 0;
  });

  syncAuthState();
})();
