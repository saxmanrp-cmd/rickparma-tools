// Login stability hotfix: keep authentication isolated from the app shell on iPhone/webviews.
(() => {
  const q = selector => document.querySelector(selector);
  const overlay = q('#loginOverlay');
  if (!overlay) return;

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
  `;
  document.head.appendChild(style);

  let passkeyTimer = null;

  function ensureHelp() {
    let help = q('#loginBrowserHelp');
    if (help) return help;
    help = document.createElement('div');
    help.id = 'loginBrowserHelp';
    help.className = 'login-browser-help hidden';
    help.innerHTML = '<strong>Face ID tip:</strong> if it is blocked in an in-app browser, open Social Publisher from Safari or your Home Screen. Your password will still work.';
    q('#loginForm')?.appendChild(help);
    return help;
  }

  function keepPasswordUsable() {
    const input = q('#appPassword');
    if (!input) return;
    input.disabled = false;
    input.readOnly = false;
    input.tabIndex = 0;
    input.setAttribute('inputmode','text');
  }

  async function checkPasskeyEnvironment() {
    const button = q('#passkeyLoginBtn');
    const divider = q('#passkeyDivider');
    const help = ensureHelp();
    if (!button || !window.PublicKeyCredential) return;

    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return;
    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        button.classList.add('hidden');
        divider?.classList.add('hidden');
        help?.classList.remove('hidden');
      }
    } catch {
      help?.classList.remove('hidden');
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
      passkeyTimer = setTimeout(() => {
        if (!overlay.classList.contains('hidden') && !button.disabled) help?.classList.remove('hidden');
      }, 2500);
    }, { capture:true });
  }

  function syncAuthState() {
    const open = !overlay.classList.contains('hidden');
    document.documentElement.classList.toggle('auth-open', open);
    document.body.classList.toggle('auth-open', open);
    if (!open) {
      clearTimeout(passkeyTimer);
      return;
    }
    keepPasswordUsable();
    window.scrollTo(0,0);
    requestAnimationFrame(() => window.scrollTo(0,0));
    setTimeout(() => {
      keepPasswordUsable();
      bindPasskeyFeedback();
      checkPasskeyEnvironment();
    }, 80);
  }

  new MutationObserver(syncAuthState).observe(overlay, { attributes:true, attributeFilter:['class'] });
  new MutationObserver(() => {
    if (!overlay.classList.contains('hidden')) {
      keepPasswordUsable();
      bindPasskeyFeedback();
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
