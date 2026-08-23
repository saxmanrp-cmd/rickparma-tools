(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const supportsPasskeys = Boolean(window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get);
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent || '');

  const toB64 = value => {
    const bytes = new Uint8Array(value);
    let binary = '';
    for (let i=0; i<bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };
  const fromB64 = value => {
    const normalized = String(value || '').replace(/-/g,'+').replace(/_/g,'/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    const out = new Uint8Array(binary.length);
    for (let i=0; i<binary.length; i++) out[i] = binary.charCodeAt(i);
    return out.buffer;
  };
  const apiJson = async (url, options={}) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  };
  const showMessage = (message, bad=false) => {
    const el = $('#passkeyMessage');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('passkey-error', bad);
    el.classList.remove('hidden');
  };

  function injectStyles() {
    if ($('#passkeyStyles')) return;
    const style = document.createElement('style');
    style.id = 'passkeyStyles';
    style.textContent = `
      .passkey-login-button{border-color:#4b415f!important;background:#171421!important;display:flex!important;align-items:center;justify-content:center;gap:9px}
      .passkey-login-button strong{font-size:18px;line-height:1}.passkey-login-button.hidden{display:none!important}
      .passkey-divider{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;color:#687184;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.passkey-divider:before,.passkey-divider:after{content:'';height:1px;background:#272f3c}
      .passkey-mark{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#1b2735,#2d2148);display:grid;place-items:center;font-size:18px}
      .passkey-list{display:grid;gap:7px}.passkey-row{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#0c1017;border-radius:12px;padding:10px 11px}.passkey-row span{min-width:0}.passkey-row strong,.passkey-row small{display:block}.passkey-row strong{font-size:12px}.passkey-row small{font-size:10px;color:var(--muted);margin-top:2px}.passkey-remove{border:0;background:transparent;color:#d97d88;font-size:11px;font-weight:800;padding:7px;cursor:pointer}.passkey-note{font-size:11px;line-height:1.45;color:var(--muted)}.passkey-message{font-size:11px;color:#9be8bd;text-align:center}.passkey-error{color:var(--danger)}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    injectStyles();
    const form = $('#loginForm');
    if (form && !$('#passkeyLoginBtn')) {
      const button = document.createElement('button');
      button.id = 'passkeyLoginBtn';
      button.type = 'button';
      button.className = 'button secondary full passkey-login-button hidden';
      button.innerHTML = `<strong>◎</strong><span>${isAppleMobile ? 'Sign in with Face ID' : 'Sign in with Passkey'}</span>`;
      const divider = document.createElement('div');
      divider.id = 'passkeyDivider';
      divider.className = 'passkey-divider hidden';
      divider.textContent = 'or use password';
      const password = $('#appPassword');
      form.insertBefore(button, password);
      form.insertBefore(divider, password);
      button.addEventListener('click', loginWithPasskey);
      form.addEventListener('submit', () => setTimeout(refreshPasskeyUi, 700));
    }

    const settings = $('#view-settings');
    if (settings && !$('#passkeyCard')) {
      const card = document.createElement('div');
      card.id = 'passkeyCard';
      card.className = 'card account-card hidden';
      card.innerHTML = `
        <div class="account-heading">
          <div class="passkey-mark">◎</div>
          <div><strong>${isAppleMobile ? 'Face ID Login' : 'Passkey Login'}</strong><span id="passkeyStatusText">Checking…</span></div>
        </div>
        <div id="passkeyList" class="passkey-list hidden"></div>
        <button id="enablePasskeyBtn" class="button primary full" type="button">${isAppleMobile ? 'Enable Face ID' : 'Add Passkey'}</button>
        <div class="passkey-note">Your face or fingerprint stays on your device. Social Publisher stores only the passkey public key.</div>
        <div id="passkeyMessage" class="passkey-message hidden"></div>
      `;
      const install = $('#installCard');
      if (install) settings.insertBefore(card, install);
      else settings.appendChild(card);
      $('#enablePasskeyBtn')?.addEventListener('click', registerPasskey);
      $('#passkeyList')?.addEventListener('click', async event => {
        const button = event.target.closest('[data-remove-passkey]');
        if (!button) return;
        if (!confirm('Remove this passkey? Password login will still work.')) return;
        button.disabled = true;
        try {
          await apiJson(`/api/auth/passkeys/${encodeURIComponent(button.dataset.removePasskey)}`, { method:'DELETE' });
          showMessage('Passkey removed.');
          await refreshPasskeyUi();
        } catch (error) {
          showMessage(error.message || 'Could not remove passkey.', true);
          button.disabled = false;
        }
      });
    }
    const footer = $('.version-footer');
    if (footer) footer.textContent = 'Social Publisher v0.6.9';
  }

  async function loginWithPasskey() {
    const button = $('#passkeyLoginBtn');
    if (!supportsPasskeys || !button) return;
    const old = button.innerHTML;
    button.disabled = true;
    button.textContent = isAppleMobile ? 'Waiting for Face ID…' : 'Waiting for passkey…';
    try {
      const options = await apiJson('/api/auth/passkey/login/options', { method:'POST' });
      const credential = await navigator.credentials.get({
        publicKey:{
          challenge:fromB64(options.challenge),
          rpId:options.rpId,
          allowCredentials:(options.allowCredentials || []).map(item => ({
            type:'public-key',
            id:fromB64(item.id),
            ...(item.transports?.length ? { transports:item.transports } : {}),
          })),
          userVerification:'required',
          timeout:60000,
        },
      });
      if (!credential) throw new Error('No passkey was selected.');
      await apiJson('/api/auth/passkey/login/verify', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({
          state:options.state,
          credentialId:credential.id,
          clientDataJSON:toB64(credential.response.clientDataJSON),
          authenticatorData:toB64(credential.response.authenticatorData),
          signature:toB64(credential.response.signature),
          userHandle:credential.response.userHandle ? toB64(credential.response.userHandle) : null,
        }),
      });
      location.reload();
    } catch (error) {
      if (error?.name !== 'NotAllowedError') {
        const loginError = $('#loginError');
        if (loginError) {
          loginError.textContent = error.message || 'Face ID login failed.';
          loginError.classList.remove('hidden');
        }
      }
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  async function registerPasskey() {
    const button = $('#enablePasskeyBtn');
    if (!button) return;
    if (!supportsPasskeys) return showMessage('This browser does not support passkeys.', true);
    const old = button.textContent;
    button.disabled = true;
    button.textContent = isAppleMobile ? 'Waiting for Face ID…' : 'Creating passkey…';
    showMessage('');
    try {
      const options = await apiJson('/api/auth/passkey/register/options', { method:'POST' });
      const credential = await navigator.credentials.create({
        publicKey:{
          challenge:fromB64(options.challenge),
          rp:options.rp,
          user:{ ...options.user, id:fromB64(options.user.id) },
          pubKeyCredParams:[{ type:'public-key', alg:-7 }],
          excludeCredentials:(options.excludeCredentials || []).map(item => ({
            type:'public-key',
            id:fromB64(item.id),
            ...(item.transports?.length ? { transports:item.transports } : {}),
          })),
          authenticatorSelection:{
            authenticatorAttachment:'platform',
            residentKey:'required',
            requireResidentKey:true,
            userVerification:'required',
          },
          attestation:'none',
          timeout:60000,
        },
      });
      if (!credential) throw new Error('Passkey creation was cancelled.');
      const response = credential.response;
      if (typeof response.getPublicKey !== 'function' || typeof response.getAuthenticatorData !== 'function') {
        throw new Error('Update iOS/Safari before enabling Face ID login.');
      }
      const publicKey = response.getPublicKey();
      const algorithm = response.getPublicKeyAlgorithm?.();
      const authenticatorData = response.getAuthenticatorData();
      if (!publicKey || algorithm !== -7) throw new Error('This device did not create a supported Face ID passkey.');
      await apiJson('/api/auth/passkey/register/verify', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({
          state:options.state,
          credentialId:credential.id,
          clientDataJSON:toB64(response.clientDataJSON),
          authenticatorData:toB64(authenticatorData),
          publicKey:toB64(publicKey),
          algorithm,
          transports:typeof response.getTransports === 'function' ? response.getTransports() : [],
          label:isAppleMobile ? 'iPhone Face ID' : 'Passkey',
        }),
      });
      showMessage(isAppleMobile ? 'Face ID login is ready.' : 'Passkey login is ready.');
      await refreshPasskeyUi();
    } catch (error) {
      if (error?.name !== 'NotAllowedError') showMessage(error.message || 'Could not create passkey.', true);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function renderPasskeys(items) {
    const list = $('#passkeyList');
    const status = $('#passkeyStatusText');
    const button = $('#enablePasskeyBtn');
    if (!list || !status || !button) return;
    if (!items.length) {
      list.classList.add('hidden');
      list.innerHTML = '';
      status.textContent = supportsPasskeys ? 'Not enabled yet' : 'Passkeys are not supported in this browser';
      button.textContent = isAppleMobile ? 'Enable Face ID' : 'Add Passkey';
      return;
    }
    status.textContent = `${items.length} passkey${items.length === 1 ? '' : 's'} enrolled · ${isAppleMobile ? 'Face ID ready' : 'ready'}`;
    button.textContent = 'Add Another Passkey';
    list.innerHTML = items.map(item => `
      <div class="passkey-row">
        <span><strong>${escapeHtml(item.label || 'Passkey')}</strong><small>${item.lastUsedAt ? `Last used ${formatDate(item.lastUsedAt)}` : `Added ${formatDate(item.createdAt)}`}</small></span>
        <button class="passkey-remove" type="button" data-remove-passkey="${escapeHtml(item.credentialId)}">Remove</button>
      </div>
    `).join('');
    list.classList.remove('hidden');
  }

  async function refreshPasskeyUi() {
    injectUi();
    try {
      const status = await apiJson('/api/auth/status');
      const loginButton = $('#passkeyLoginBtn');
      const divider = $('#passkeyDivider');
      const canLogin = supportsPasskeys && status.passkeyAvailable;
      loginButton?.classList.toggle('hidden', !canLogin);
      divider?.classList.toggle('hidden', !canLogin);
      const card = $('#passkeyCard');
      card?.classList.toggle('hidden', !status.authenticated);
      if (status.authenticated && card) {
        try {
          const data = await apiJson('/api/auth/passkeys');
          renderPasskeys(data.passkeys || []);
        } catch (error) {
          $('#passkeyStatusText').textContent = error.message || 'Could not load passkeys.';
        }
      }
    } catch {}
  }

  function escapeHtml(value='') {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function formatDate(value) {
    try { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(value)); }
    catch { return ''; }
  }

  injectUi();
  refreshPasskeyUi();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPasskeyUi(); });
})();
