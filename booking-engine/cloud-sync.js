(() => {
  'use strict';

  const STORAGE_KEY = 'rick-booking-engine-v1';
  const SESSION_KEY = 'rick-booking-cloud-session';
  const VERSION_KEY = 'rick-booking-cloud-version';
  const DEFAULT_API = 'https://rick-booking-engine.saxmanrp.workers.dev';
  const STATUS_RANK = {
    'Not contacted': 0,
    'Queued': 10,
    'Drafted': 20,
    'Sent': 30,
    'Follow-up': 40,
    'Replied': 80,
    'Pass': 90,
    'Booked': 100,
    'Do not contact': 110
  };

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function writeState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function token() {
    return localStorage.getItem(SESSION_KEY)
      || sessionStorage.getItem(SESSION_KEY)
      || '';
  }
  function cloudVersion() { return Number(sessionStorage.getItem(VERSION_KEY) || 0); }
  function setCloudVersion(v) { sessionStorage.setItem(VERSION_KEY, String(Number(v) || 0)); }

  function apiBase() {
    const state = readState();
    return String(state.cloudApiUrl || DEFAULT_API).replace(/\/$/, '');
  }

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth) {
      const session = token();
      if (!session) throw new Error('Not logged in.');
      headers.authorization = `Bearer ${session}`;
    }
    const response = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function mergeObject(remote, local) {
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return local;
    if (!local || typeof local !== 'object' || Array.isArray(local)) return local === undefined ? remote : local;
    const out = { ...remote };
    Object.entries(local).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && remote[key] && typeof remote[key] === 'object' && !Array.isArray(remote[key])) {
        out[key] = mergeObject(remote[key], value);
      } else if (value !== undefined) {
        out[key] = value;
      }
    });
    return out;
  }

  function statusRank(value) { return STATUS_RANK[String(value || '')] ?? 0; }

  function mergeStates(remoteState = {}, localState = {}) {
    const merged = mergeObject(remoteState, localState) || {};
    merged.overrides ||= {};
    merged.campaigns ||= {};

    // Strong outcomes from the cloud must not be erased by an older browser state.
    // This is especially important for automatic reply detection.
    for (const [id, remoteOverride] of Object.entries(remoteState.overrides || {})) {
      const localOverride = localState.overrides?.[id] || {};
      const remoteRank = statusRank(remoteOverride?.Status);
      const localRank = statusRank(localOverride?.Status);
      const hasCloudReply = !!remoteOverride?.['Last Reply At'];
      if (remoteRank > localRank || (hasCloudReply && localRank < statusRank('Pass'))) {
        merged.overrides[id] = { ...(merged.overrides[id] || {}), ...remoteOverride };
      }
    }

    // A campaign stopped by a cloud-detected reply stays stopped unless this device has
    // already moved the lead into a stronger terminal outcome such as Booked or DNC.
    for (const [id, remoteCampaign] of Object.entries(remoteState.campaigns || {})) {
      if (!remoteCampaign?.repliedAt) continue;
      const localStatus = merged.overrides?.[id]?.Status;
      if (statusRank(localStatus) >= statusRank('Pass')) continue;
      merged.campaigns[id] = {
        ...(merged.campaigns[id] || {}),
        ...remoteCampaign,
        active: false,
        paused: false
      };
    }

    return merged;
  }

  function meaningful(state) {
    if (!state || typeof state !== 'object') return false;
    const keys = ['overrides', 'roomPrefs', 'contactPrefs', 'campaigns', 'relationships', 'textOk', 'currentVenueDetails'];
    return keys.some(key => state[key] && Object.keys(state[key]).length > 0) || (Array.isArray(state.queue) && state.queue.length > 0);
  }

  async function health() {
    try {
      const response = await fetch(`${apiBase()}/api/health`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      return response.ok && data.ok ? { ok: true, data } : { ok: false };
    } catch {
      return { ok: false };
    }
  }

  async function login(password) {
    const data = await api('/api/auth/login', { method: 'POST', body: { password }, auth: false });
    if (!data.token) throw new Error('Login did not return a session.');
    localStorage.setItem(SESSION_KEY, data.token);
    sessionStorage.removeItem(SESSION_KEY);
    setCloudVersion(0);
    return data;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(VERSION_KEY);
  }

  async function passkeyStatus() {
    try {
      return await api('/api/auth/passkey/status', { auth: false });
    } catch {
      return { configured: false };
    }
  }

  async function faceIdAvailable() {
    return !!(
      window.PublicKeyCredential &&
      window.SimpleWebAuthnBrowser?.startRegistration &&
      window.SimpleWebAuthnBrowser?.startAuthentication
    );
  }

  async function setupFaceId() {
    if (!window.SimpleWebAuthnBrowser?.startRegistration) {
      throw new Error('Face ID support is not ready in this browser.');
    }

    const start = await api('/api/auth/passkey/register/options', {
      method: 'POST'
    });

    const response = await window.SimpleWebAuthnBrowser.startRegistration({
      optionsJSON: start.options
    });

    return api('/api/auth/passkey/register/verify', {
      method: 'POST',
      body: {
        challenge: start.options.challenge,
        response
      }
    });
  }

  async function loginWithFaceId() {
    if (!window.SimpleWebAuthnBrowser?.startAuthentication) {
      throw new Error('Face ID support is not ready in this browser.');
    }

    const start = await api('/api/auth/passkey/login/options', {
      method: 'POST',
      auth: false
    });

    const response = await window.SimpleWebAuthnBrowser.startAuthentication({
      optionsJSON: start.options
    });

    const result = await api('/api/auth/passkey/login/verify', {
      method: 'POST',
      auth: false,
      body: {
        challenge: start.options.challenge,
        response
      }
    });

    if (!result.token) throw new Error('Face ID login did not return a session.');

    localStorage.setItem(SESSION_KEY, result.token);
    sessionStorage.removeItem(SESSION_KEY);
    setCloudVersion(0);

    return result;
  }

  async function providerStatus() {
    return api('/api/providers');
  }

  async function syncNow() {
    const local = readState();
    let remote = await api('/api/state');
    let merged;

    if (!meaningful(remote.state)) merged = local;
    else if (!meaningful(local)) merged = remote.state;
    else merged = mergeStates(remote.state, local);

    if (JSON.stringify(merged) !== JSON.stringify(local)) writeState(merged);

    try {
      const saved = await api('/api/state', {
        method: 'PUT',
        body: { state: merged, expectedVersion: Number(remote.version || 0) }
      });
      setCloudVersion(saved.version);
      return { ok: true, version: saved.version, pulled: JSON.stringify(merged) !== JSON.stringify(local) };
    } catch (error) {
      if (error.status !== 409) throw error;
      remote = await api('/api/state');
      const retryMerged = mergeStates(remote.state || {}, readState());
      writeState(retryMerged);
      const saved = await api('/api/state', {
        method: 'PUT',
        body: { state: retryMerged, expectedVersion: Number(remote.version || 0) }
      });
      setCloudVersion(saved.version);
      return { ok: true, version: saved.version, pulled: true, conflictResolved: true };
    }
  }

  function statusDot(label, value, cls = '') {
    return `<div class="cloud-status-row"><span>${label}</span><strong class="${cls}">${value}</strong></div>`;
  }

  async function renderCard() {
    const settings = document.querySelector('[data-view="settings"]');
    if (!settings) return;
    let card = settings.querySelector('[data-cloud-sync]');
    if (!card) {
      card = document.createElement('div');
      card.className = 'settings-card';
      card.dataset.cloudSync = 'true';
      settings.appendChild(card);
    }

    const check = await health();
    if (!check.ok) {
      card.innerHTML = `
        <h3>Cloud CRM</h3>
        <p>The Booking Engine is currently <strong>local-only</strong>. That is intentional until the secure Worker is deployed.</p>
        ${statusDot('This device', 'Working', 'cloud-good')}
        ${statusDot('Cloud backend', 'Not deployed', 'cloud-muted')}
        <div class="fine-print">Your room choices, campaigns and notes still save in this browser and can be exported from CRM Data.</div>`;
      return;
    }

    const passkeys = await passkeyStatus();
    const faceIdReady = await faceIdAvailable();

    if (!token()) {
      card.innerHTML = `
        <h3>Cloud CRM</h3>
        <p>Backend is online. Sign in once per browser session to sync CRM data and unlock configured send providers.</p>
        ${statusDot('Cloud backend', 'Online', 'cloud-good')}
        <label>Rick login<input type="password" data-cloud-password autocomplete="current-password" placeholder="Booking Engine password"></label>
        <button class="primary" data-cloud-login>Log In</button>
        ${passkeys.configured && faceIdReady ? '<button class="secondary" data-cloud-faceid-login>Sign in with Face ID</button>' : ''}
        <div class="cloud-message" data-cloud-message></div>`;
      card.querySelector('[data-cloud-login]').onclick = async () => {
        const btn = card.querySelector('[data-cloud-login]');
        const message = card.querySelector('[data-cloud-message]');
        btn.disabled = true;
        message.textContent = 'Signing in…';
        try {
          await login(card.querySelector('[data-cloud-password]').value);
          await syncNow();
          toast('Cloud CRM connected');
          renderCard();
        } catch (error) {
          message.textContent = error.message || 'Could not sign in.';
        } finally {
          btn.disabled = false;
        }
      };

      const faceLogin = card.querySelector('[data-cloud-faceid-login]');
      if (faceLogin) {
        faceLogin.onclick = async () => {
          const message = card.querySelector('[data-cloud-message]');
          faceLogin.disabled = true;
          message.textContent = 'Checking Face ID…';
          try {
            await loginWithFaceId();
            await syncNow();
            toast('Signed in with Face ID');
            renderCard();
          } catch (error) {
            message.textContent = error.message || 'Face ID sign-in failed.';
          } finally {
            faceLogin.disabled = false;
          }
        };
      }

      return;
    }

    let providers = null;
    try { providers = await providerStatus(); }
    catch (error) {
      if (error.status === 401) {
        logout();
        renderCard();
        return;
      }
    }

    const emailReady = !!providers?.email?.configured;
    const smsReady = !!providers?.sms?.configured;
    card.innerHTML = `
      <h3>Cloud CRM</h3>
      <p>Secure session is active. Local data remains the fallback even while cloud sync is connected.</p>
      ${statusDot('Cloud sync', 'Connected', 'cloud-good')}
      ${statusDot('Cloud version', String(cloudVersion() || '—'), '')}
      ${statusDot('Face ID', passkeys.configured ? 'Ready' : 'Not set up', passkeys.configured ? 'cloud-good' : 'cloud-muted')}
      ${statusDot('Microsoft email', emailReady ? 'Ready' : 'Needs setup', emailReady ? 'cloud-good' : 'cloud-warn')}
      ${statusDot('Twilio SMS', smsReady ? 'Ready' : 'Needs setup', smsReady ? 'cloud-good' : 'cloud-warn')}
      <div class="cloud-buttons">
        <button class="primary" data-cloud-sync-now>Sync Now</button>
        ${faceIdReady && !passkeys.configured ? '<button class="secondary" data-cloud-faceid-setup>Set Up Face ID</button>' : ''}
        <button class="secondary" data-cloud-logout>Log Out</button>
      </div>
      <div class="cloud-message" data-cloud-message></div>`;

    card.querySelector('[data-cloud-sync-now]').onclick = async () => {
      const message = card.querySelector('[data-cloud-message]');
      message.textContent = 'Syncing…';
      try {
        const result = await syncNow();
        message.textContent = `Synced • version ${result.version}${result.conflictResolved ? ' • conflict merged' : ''}`;
        toast('CRM synced');
      } catch (error) {
        message.textContent = error.message || 'Sync failed.';
      }
    };
    const faceSetup = card.querySelector('[data-cloud-faceid-setup]');
    if (faceSetup) {
      faceSetup.onclick = async () => {
        const message = card.querySelector('[data-cloud-message]');
        faceSetup.disabled = true;
        message.textContent = 'Setting up Face ID…';
        try {
          await setupFaceId();
          message.textContent = 'Face ID is ready.';
          toast('Face ID ready');
          renderCard();
        } catch (error) {
          message.textContent = error.message || 'Face ID setup failed.';
        } finally {
          faceSetup.disabled = false;
        }
      };
    }

    card.querySelector('[data-cloud-logout]').onclick = () => {
      logout();
      renderCard();
    };
  }

  function injectStyles() {
    if (document.querySelector('#cloud-sync-styles')) return;
    const style = document.createElement('style');
    style.id = 'cloud-sync-styles';
    style.textContent = `
      .cloud-status-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px}.cloud-status-row span{color:var(--muted)}.cloud-status-row strong{color:#cfe0ff}.cloud-status-row strong.cloud-good{color:#8ce1b2}.cloud-status-row strong.cloud-warn{color:#ffd37f}.cloud-status-row strong.cloud-muted{color:var(--muted)}.cloud-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.cloud-message{min-height:18px;color:var(--muted);font-size:11px;margin-top:9px}@media(max-width:520px){.cloud-buttons{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function toast(message) {
    const el = document.querySelector('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1700);
  }

  injectStyles();
  window.BookingCloud = { api, health, login, logout, syncNow, providerStatus, apiBase, mergeStates };

  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-view="settings"].active') && !document.querySelector('[data-cloud-sync]')) renderCard();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', renderCard);
  setTimeout(renderCard, 0);
})();
