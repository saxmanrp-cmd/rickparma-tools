const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function isLegacySessionAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/(?:^|;\s*)sp_session=([^;]+)/);
  if (!match) return false;
  return verifySessionToken(match[1], env.SESSION_SECRET);
}

export async function createLegacySessionCookie(env) {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${expires}:${crypto.randomUUID()}`;
  const sig = await hmac(payload, env.SESSION_SECRET);
  const token = `${base64Url(encoder.encode(payload))}.${sig}`;
  return `sp_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`;
}

export async function getPasskeyAvailability(env) {
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys').first();
    return Number(row?.n || 0) > 0;
  } catch {
    return false;
  }
}

export async function handlePasskeyRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const rpId = url.hostname;
  const origin = url.origin;

  if (path === '/api/auth/passkeys' && request.method === 'GET') {
    const denied = await requireExistingSession(request, env);
    if (denied) return denied;
    if (!env.DB) return json({ error:'D1 is not configured.' }, { status:503 });
    try {
      const { results } = await env.DB.prepare(`
        SELECT credential_id, label, transports, created_at, last_used_at
        FROM passkeys ORDER BY created_at DESC
      `).all();
      return json({ passkeys:(results || []).map(row => ({
        credentialId:row.credential_id,
        label:row.label || 'Passkey',
        transports:parseJsonArray(row.transports),
        createdAt:row.created_at,
        lastUsedAt:row.last_used_at,
      })) });
    } catch {
      return json({ passkeys:[], schemaNeeded:true, error:'Passkey database update is required.' }, { status:503 });
    }
  }

  const deleteMatch = path.match(/^\/api\/auth\/passkeys\/([^/]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    const denied = await requireExistingSession(request, env);
    if (denied) return denied;
    if (!env.DB) return json({ error:'D1 is not configured.' }, { status:503 });
    await env.DB.prepare('DELETE FROM passkeys WHERE credential_id = ?').bind(decodeURIComponent(deleteMatch[1])).run();
    return json({ ok:true });
  }

  if (path === '/api/auth/passkey/register/options' && request.method === 'POST') {
    const denied = await requireExistingSession(request, env);
    if (denied) return denied;
    if (!env.DB || !env.SESSION_SECRET) return json({ error:'Passkey setup is not configured.' }, { status:503 });
    let existing = [];
    try {
      const { results } = await env.DB.prepare('SELECT credential_id, transports FROM passkeys').all();
      existing = results || [];
    } catch {
      return json({ error:'Passkey database update is required.' }, { status:503 });
    }
    const challenge = randomChallenge();
    const state = await createChallengeState('register', challenge, env.SESSION_SECRET);
    const userHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${origin}|social-publisher-owner`)));
    return json({
      challenge,
      state,
      rp:{ id:rpId, name:'Social Publisher' },
      user:{ id:base64Url(userHash), name:'owner', displayName:'Social Publisher Owner' },
      excludeCredentials:existing.map(row => ({
        type:'public-key',
        id:row.credential_id,
        transports:parseJsonArray(row.transports),
      })),
    });
  }

  if (path === '/api/auth/passkey/register/verify' && request.method === 'POST') {
    const denied = await requireExistingSession(request, env);
    if (denied) return denied;
    if (!env.DB || !env.SESSION_SECRET) return json({ error:'Passkey setup is not configured.' }, { status:503 });
    const body = await request.json().catch(() => ({}));
    try {
      validateCredentialId(body.credentialId);
      if (Number(body.algorithm) !== -7) throw new Error('Only ES256 passkeys are supported.');
      const client = parseClientData(body.clientDataJSON);
      await verifyChallengeState(body.state, 'register', client.challenge, env.SESSION_SECRET);
      verifyClientData(client, 'webauthn.create', origin);
      const auth = await inspectAuthenticatorData(body.authenticatorData, rpId);
      const publicKeyBytes = base64UrlDecode(String(body.publicKey || ''));
      if (!publicKeyBytes.length) throw new Error('Missing passkey public key.');
      await crypto.subtle.importKey('spki', toArrayBuffer(publicKeyBytes), { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO passkeys (credential_id, public_key, algorithm, sign_count, transports, label, created_at, last_used_at)
        VALUES (?, ?, -7, ?, ?, ?, ?, NULL)
      `).bind(
        body.credentialId,
        body.publicKey,
        auth.signCount,
        JSON.stringify(Array.isArray(body.transports) ? body.transports.slice(0,8) : []),
        String(body.label || 'iPhone Face ID').slice(0,80),
        now,
      ).run();
      return json({ ok:true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not register passkey.';
      const status = /UNIQUE|constraint/i.test(message) ? 409 : 400;
      return json({ error:message }, { status });
    }
  }

  if (path === '/api/auth/passkey/login/options' && request.method === 'POST') {
    if (!env.DB || !env.SESSION_SECRET) return json({ error:'Passkey login is not configured.' }, { status:503 });
    try {
      const { results } = await env.DB.prepare('SELECT credential_id, transports FROM passkeys ORDER BY created_at DESC').all();
      if (!results?.length) return json({ error:'No passkey is enrolled yet.' }, { status:404 });
      const challenge = randomChallenge();
      const state = await createChallengeState('login', challenge, env.SESSION_SECRET);
      return json({
        challenge,
        state,
        rpId,
        allowCredentials:results.map(row => ({
          type:'public-key',
          id:row.credential_id,
          transports:parseJsonArray(row.transports),
        })),
      });
    } catch {
      return json({ error:'Passkey database update is required.' }, { status:503 });
    }
  }

  if (path === '/api/auth/passkey/login/verify' && request.method === 'POST') {
    if (!env.DB || !env.SESSION_SECRET) return json({ error:'Passkey login is not configured.' }, { status:503 });
    const body = await request.json().catch(() => ({}));
    try {
      validateCredentialId(body.credentialId);
      const row = await env.DB.prepare(`
        SELECT credential_id, public_key, algorithm, sign_count
        FROM passkeys WHERE credential_id = ?
      `).bind(body.credentialId).first();
      if (!row) throw new Error('Passkey was not recognized.');
      if (Number(row.algorithm) !== -7) throw new Error('Unsupported passkey algorithm.');
      const clientBytes = base64UrlDecode(String(body.clientDataJSON || ''));
      const client = parseClientDataBytes(clientBytes);
      await verifyChallengeState(body.state, 'login', client.challenge, env.SESSION_SECRET);
      verifyClientData(client, 'webauthn.get', origin);
      const authBytes = base64UrlDecode(String(body.authenticatorData || ''));
      const auth = await inspectAuthenticatorDataBytes(authBytes, rpId);
      const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(clientBytes)));
      const signedData = concatBytes(authBytes, clientHash);
      const spki = base64UrlDecode(String(row.public_key || ''));
      const key = await crypto.subtle.importKey('spki', toArrayBuffer(spki), { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
      const derSignature = base64UrlDecode(String(body.signature || ''));
      const rawSignature = derEcdsaToRaw(derSignature, 32);
      const valid = await crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, key, toArrayBuffer(rawSignature), toArrayBuffer(signedData));
      if (!valid) throw new Error('Face ID signature could not be verified.');

      const previousCount = Number(row.sign_count || 0);
      if (previousCount > 0 && auth.signCount > 0 && auth.signCount <= previousCount) {
        throw new Error('Passkey counter check failed.');
      }
      const now = new Date().toISOString();
      await env.DB.prepare('UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE credential_id = ?')
        .bind(Math.max(previousCount, auth.signCount), now, body.credentialId).run();
      const cookie = await createLegacySessionCookie(env);
      return json({ ok:true }, { headers:{ 'set-cookie':cookie } });
    } catch (error) {
      return json({ error:error instanceof Error ? error.message : 'Passkey login failed.' }, { status:401 });
    }
  }

  return null;
}

async function requireExistingSession(request, env) {
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) return json({ error:'App login is not configured.' }, { status:503 });
  return (await isLegacySessionAuthenticated(request, env)) ? null : json({ error:'Unauthorized' }, { status:401 });
}

function randomChallenge() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createChallengeState(purpose, challenge, secret) {
  const payload = { p:purpose, c:challenge, e:Date.now() + CHALLENGE_TTL_MS };
  const payload64 = base64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmac(payload64, secret);
  return `${payload64}.${sig}`;
}

async function verifyChallengeState(state, purpose, challenge, secret) {
  const [payload64, supplied] = String(state || '').split('.');
  if (!payload64 || !supplied) throw new Error('Invalid authentication challenge.');
  const expected = await hmac(payload64, secret);
  if (!constantTimeEqual(expected, supplied)) throw new Error('Invalid authentication challenge.');
  const payload = JSON.parse(decoder.decode(base64UrlDecode(payload64)));
  if (payload.p !== purpose || payload.c !== challenge || !Number.isFinite(Number(payload.e)) || Number(payload.e) < Date.now()) {
    throw new Error('Authentication challenge expired or does not match.');
  }
}

function parseClientData(encoded) {
  return parseClientDataBytes(base64UrlDecode(String(encoded || '')));
}

function parseClientDataBytes(bytes) {
  if (!bytes.length) throw new Error('Missing WebAuthn client data.');
  const data = JSON.parse(decoder.decode(bytes));
  if (!data || typeof data !== 'object') throw new Error('Invalid WebAuthn client data.');
  return data;
}

function verifyClientData(client, expectedType, origin) {
  if (client.type !== expectedType) throw new Error('Unexpected WebAuthn ceremony type.');
  if (client.origin !== origin) throw new Error('WebAuthn origin did not match this app.');
  if (client.crossOrigin === true) throw new Error('Cross-origin WebAuthn is not allowed.');
  if (!client.challenge) throw new Error('Missing WebAuthn challenge.');
}

async function inspectAuthenticatorData(encoded, rpId) {
  return inspectAuthenticatorDataBytes(base64UrlDecode(String(encoded || '')), rpId);
}

async function inspectAuthenticatorDataBytes(bytes, rpId) {
  if (bytes.length < 37) throw new Error('Authenticator data is incomplete.');
  const expectedRpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(rpId)));
  if (!bytesEqual(bytes.slice(0,32), expectedRpHash)) throw new Error('Passkey belongs to a different site.');
  const flags = bytes[32];
  if ((flags & 0x01) === 0) throw new Error('User presence was not confirmed.');
  if ((flags & 0x04) === 0) throw new Error('Face ID or device verification is required.');
  const signCount = (((bytes[33] << 24) >>> 0) | (bytes[34] << 16) | (bytes[35] << 8) | bytes[36]) >>> 0;
  return { flags, signCount };
}

async function verifySessionToken(value, secret) {
  try {
    const [payload64, supplied] = String(value || '').split('.');
    if (!payload64 || !supplied) return false;
    const payload = decoder.decode(base64UrlDecode(payload64));
    const [expires] = payload.split(':');
    if (!expires || Number(expires) <= Date.now()) return false;
    const expected = await hmac(payload, secret);
    return constantTimeEqual(expected, supplied);
  } catch {
    return false;
  }
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(secret)), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(String(text)));
  return base64Url(new Uint8Array(sig));
}

function validateCredentialId(value) {
  const id = String(value || '');
  if (!id || id.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid passkey credential ID.');
}

function derEcdsaToRaw(signature, size) {
  let offset = 0;
  if (signature[offset++] !== 0x30) throw new Error('Invalid ECDSA signature.');
  const seq = readDerLength(signature, offset); offset = seq.offset;
  if (offset + seq.length !== signature.length) throw new Error('Invalid ECDSA signature length.');
  if (signature[offset++] !== 0x02) throw new Error('Invalid ECDSA signature.');
  const rInfo = readDerLength(signature, offset); offset = rInfo.offset;
  let r = signature.slice(offset, offset + rInfo.length); offset += rInfo.length;
  if (signature[offset++] !== 0x02) throw new Error('Invalid ECDSA signature.');
  const sInfo = readDerLength(signature, offset); offset = sInfo.offset;
  let s = signature.slice(offset, offset + sInfo.length); offset += sInfo.length;
  if (offset !== signature.length) throw new Error('Invalid ECDSA signature.');
  while (r.length > 1 && r[0] === 0) r = r.slice(1);
  while (s.length > 1 && s[0] === 0) s = s.slice(1);
  if (r.length > size || s.length > size) throw new Error('Invalid ECDSA signature size.');
  const out = new Uint8Array(size * 2);
  out.set(r, size - r.length);
  out.set(s, size * 2 - s.length);
  return out;
}

function readDerLength(bytes, offset) {
  if (offset >= bytes.length) throw new Error('Invalid DER length.');
  let first = bytes[offset++];
  if ((first & 0x80) === 0) return { length:first, offset };
  const count = first & 0x7f;
  if (!count || count > 2 || offset + count > bytes.length) throw new Error('Invalid DER length.');
  let length = 0;
  for (let i=0; i<count; i++) length = (length << 8) | bytes[offset++];
  return { length, offset };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string').slice(0,8) : [];
  } catch {
    return [];
  }
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0; i<a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function constantTimeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0; i<a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64Url(bytes) {
  let binary = '';
  for (let i=0; i<bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g,'+').replace(/_/g,'/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i=0; i<binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers:{ 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}
