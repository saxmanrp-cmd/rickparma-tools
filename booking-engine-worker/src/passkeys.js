import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';

import { createAuthenticatedSession } from './auth.js';

const encoder = new TextEncoder();

function b64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function transports(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function requestIdentity(request, env) {
  const origin = String(request.headers.get('origin') || '').trim();

  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

  if (!origin || (!allowed.includes(origin) && !local)) {
    throw new Error('Passkey request origin is not allowed.');
  }

  const url = new URL(origin);

  return {
    origin,
    rpID: url.hostname
  };
}

async function clearExpiredChallenges(env) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    'DELETE FROM auth_challenges WHERE expires_at <= ?'
  ).bind(now).run();
}

async function saveChallenge(env, {
  challenge,
  purpose,
  rpID,
  origin
}) {
  await clearExpiredChallenges(env);

  await env.DB.prepare(`
    INSERT INTO auth_challenges
      (challenge,purpose,user_id,rp_id,origin,expires_at)
    VALUES
      (?,?,'rick',?,?,?)
  `).bind(
    challenge,
    purpose,
    rpID,
    origin,
    new Date(Date.now() + 5 * 60 * 1000).toISOString()
  ).run();
}

async function consumeChallenge(env, challenge, purpose) {
  const row = await env.DB.prepare(`
    SELECT challenge,purpose,user_id,rp_id,origin,expires_at
    FROM auth_challenges
    WHERE challenge=? AND purpose=? AND user_id='rick'
    LIMIT 1
  `).bind(challenge, purpose).first();

  if (!row) throw new Error('Passkey challenge is missing or expired.');

  await env.DB.prepare(
    'DELETE FROM auth_challenges WHERE challenge=?'
  ).bind(challenge).run();

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new Error('Passkey challenge has expired.');
  }

  return row;
}

export async function passkeyStatus(env) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM passkey_credentials
    WHERE user_id='rick'
  `).first();

  return {
    configured: Number(row?.count || 0) > 0,
    count: Number(row?.count || 0)
  };
}

export async function registrationOptions(request, env) {
  const { origin, rpID } = requestIdentity(request, env);

  const rows = await env.DB.prepare(`
    SELECT credential_id,transports_json
    FROM passkey_credentials
    WHERE user_id='rick'
  `).all();

  const options = await generateRegistrationOptions({
    rpName: 'Rick Parma Booking Engine',
    rpID,
    userName: 'rick',
    userID: encoder.encode('rick'),
    userDisplayName: 'Rick Parma',
    attestationType: 'none',
    excludeCredentials: (rows.results || []).map(row => ({
      id: row.credential_id,
      transports: transports(row.transports_json)
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required'
    },
    preferredAuthenticatorType: 'localDevice'
  });

  await saveChallenge(env, {
    challenge: options.challenge,
    purpose: 'registration',
    rpID,
    origin
  });

  return options;
}

export async function completeRegistration(request, env, body = {}) {
  const { origin, rpID } = requestIdentity(request, env);

  const challenge = String(body.challenge || '');
  const response = body.response;

  if (!challenge || !response) {
    throw new Error('Missing passkey registration response.');
  }

  const stored = await consumeChallenge(env, challenge, 'registration');

  if (stored.origin !== origin || stored.rp_id !== rpID) {
    throw new Error('Passkey registration origin does not match.');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: stored.origin,
    expectedRPID: stored.rp_id,
    requireUserPresence: true,
    requireUserVerification: true
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration could not be verified.');
  }

  const info = verification.registrationInfo;
  const credential = info.credential;

  await env.DB.prepare(`
    INSERT INTO passkey_credentials (
      credential_id,
      user_id,
      public_key_b64url,
      counter,
      device_type,
      backed_up,
      rp_id,
      origin,
      transports_json,
      last_used_at
    )
    VALUES (?,'rick',?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(credential_id) DO UPDATE SET
      public_key_b64url=excluded.public_key_b64url,
      counter=excluded.counter,
      device_type=excluded.device_type,
      backed_up=excluded.backed_up,
      rp_id=excluded.rp_id,
      origin=excluded.origin,
      transports_json=excluded.transports_json
  `).bind(
    credential.id,
    b64urlEncode(credential.publicKey),
    Number(credential.counter || 0),
    String(info.credentialDeviceType || ''),
    info.credentialBackedUp ? 1 : 0,
    stored.rp_id,
    stored.origin,
    JSON.stringify(credential.transports || response.response?.transports || [])
  ).run();

  return {
    ok: true,
    credentialId: credential.id
  };
}

export async function authenticationOptions(request, env) {
  const { origin, rpID } = requestIdentity(request, env);

  const rows = await env.DB.prepare(`
    SELECT credential_id,transports_json
    FROM passkey_credentials
    WHERE user_id='rick'
      AND rp_id=?
      AND origin=?
  `).bind(rpID, origin).all();

  if (!(rows.results || []).length) {
    throw new Error('Face ID has not been set up on this Booking Engine address yet.');
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: rows.results.map(row => ({
      id: row.credential_id,
      transports: transports(row.transports_json)
    })),
    userVerification: 'required'
  });

  await saveChallenge(env, {
    challenge: options.challenge,
    purpose: 'authentication',
    rpID,
    origin
  });

  return options;
}

export async function completeAuthentication(request, env, body = {}) {
  const { origin, rpID } = requestIdentity(request, env);

  const challenge = String(body.challenge || '');
  const response = body.response;

  if (!challenge || !response?.id) {
    throw new Error('Missing passkey authentication response.');
  }

  const stored = await consumeChallenge(env, challenge, 'authentication');

  if (stored.origin !== origin || stored.rp_id !== rpID) {
    throw new Error('Passkey authentication origin does not match.');
  }

  const row = await env.DB.prepare(`
    SELECT
      credential_id,
      public_key_b64url,
      counter,
      transports_json
    FROM passkey_credentials
    WHERE credential_id=?
      AND user_id='rick'
      AND rp_id=?
      AND origin=?
    LIMIT 1
  `).bind(
    response.id,
    stored.rp_id,
    stored.origin
  ).first();

  if (!row) throw new Error('Passkey credential was not recognized.');

  const credential = {
    id: row.credential_id,
    publicKey: b64urlDecode(row.public_key_b64url),
    counter: Number(row.counter || 0),
    transports: transports(row.transports_json)
  };

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: stored.origin,
    expectedRPID: stored.rp_id,
    credential,
    requireUserVerification: true
  });

  if (!verification.verified) {
    throw new Error('Face ID authentication could not be verified.');
  }

  await env.DB.prepare(`
    UPDATE passkey_credentials
    SET counter=?, last_used_at=CURRENT_TIMESTAMP
    WHERE credential_id=?
  `).bind(
    Number(verification.authenticationInfo.newCounter || 0),
    row.credential_id
  ).run();

  return {
    ok: true,
    ...(await createAuthenticatedSession(env))
  };
}
