const encoder = new TextEncoder();

function b64urlEncode(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(secret, value) {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return b64urlEncode(new Uint8Array(signature));
}

function constantTimeStringEqual(a, b) {
  const aa = encoder.encode(String(a || ''));
  const bb = encoder.encode(String(b || ''));
  const max = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < max; i++) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

export function authStatus(env) {
  const missing = ['APP_PASSWORD', 'SESSION_SECRET'].filter(key => !String(env[key] || '').trim());
  return { configured: missing.length === 0, missing };
}

export async function createAuthenticatedSession(env, ttlSeconds = 2592000) {

  if (!String(env.SESSION_SECRET || '').trim()) {
    throw new Error('Booking session signing is not configured: SESSION_SECRET');
  }

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: 'rick',
    iat: now,
    exp: now + Math.max(900, Math.min(Number(ttlSeconds) || 2592000, 2592000)),
    nonce: crypto.randomUUID()
  };

  const payloadEncoded = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `booking_v1.${payloadEncoded}`;
  const signature = await sign(env.SESSION_SECRET, signingInput);

  return {
    token: `${signingInput}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };

}

export async function createSession(env, password, ttlSeconds = 2592000) {

  const status = authStatus(env);

  if (!status.configured) throw new Error(`Booking login is not configured: ${status.missing.join(', ')}`);

  if (!constantTimeStringEqual(password, env.APP_PASSWORD)) return null;

  return createAuthenticatedSession(env, ttlSeconds);

}

export async function verifySession(env, token) {
  const status = authStatus(env);
  if (!status.configured || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3 || parts[0] !== 'booking_v1') return null;

  const signingInput = `${parts[0]}.${parts[1]}`;
  const expected = await sign(env.SESSION_SECRET, signingInput);
  if (!constantTimeStringEqual(expected, parts[2])) return null;

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); }
  catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (payload.sub !== 'rick' || !payload.exp || payload.exp <= now) return null;
  return payload;
}

export function bearerToken(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}
