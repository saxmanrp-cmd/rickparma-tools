import { microsoftStatus, sendMicrosoftEmail } from './providers/microsoft.js';
import { twilioStatus, sendTwilioText } from './providers/twilio.js';
import { authStatus, bearerToken, createSession, verifySession } from './auth.js';

const json = (data, { status = 200, headers = {} } = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
});

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const allowOrigin = allowed.includes(origin) || local ? origin : '';
  return {
    ...(allowOrigin ? { 'access-control-allow-origin': allowOrigin } : {}),
    'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,if-match',
    'access-control-expose-headers': 'etag',
    'vary': 'Origin'
  };
}

async function authorized(request, env) {
  const supplied = bearerToken(request);
  if (!supplied) return { ok: false, status: 401, error: 'Unauthorized.' };

  // Server/CLI fallback. Never embed BOOKING_API_TOKEN in the browser app.
  const adminToken = String(env.BOOKING_API_TOKEN || '').trim();
  if (adminToken && supplied === adminToken) return { ok: true, subject: 'admin-token' };

  const session = await verifySession(env, supplied);
  if (session) return { ok: true, subject: session.sub, session };
  return { ok: false, status: 401, error: 'Session expired or invalid.' };
}

async function readJson(request) {
  try { return await request.json(); }
  catch { return null; }
}

function clampLimit(value, fallback = 50, max = 250) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function safeError(error) {
  return String(error?.message || error || 'Server error.').slice(0, 1000);
}

async function getState(env) {
  const row = await env.DB.prepare('SELECT state_json, version, updated_at FROM app_state WHERE id = ?')
    .bind('rick').first();
  if (!row) return { state: {}, version: 0, updatedAt: null };
  let state = {};
  try { state = JSON.parse(row.state_json || '{}'); } catch {}
  return { state, version: Number(row.version || 0), updatedAt: row.updated_at || null };
}

async function putState(request, env) {
  const body = await readJson(request);
  if (!body || typeof body.state !== 'object' || Array.isArray(body.state)) {
    return { error: 'Body must contain a state object.', status: 400 };
  }

  const serialized = JSON.stringify(body.state);
  if (serialized.length > 900000) return { error: 'CRM state is too large.', status: 413 };

  const current = await env.DB.prepare('SELECT version FROM app_state WHERE id = ?').bind('rick').first();
  const currentVersion = Number(current?.version || 0);
  const expectedVersion = body.expectedVersion == null ? null : Number(body.expectedVersion);
  if (expectedVersion != null && Number.isFinite(expectedVersion) && expectedVersion !== currentVersion) {
    return { error: 'Version conflict.', status: 409, currentVersion };
  }

  const nextVersion = currentVersion + 1;
  await env.DB.prepare(`
    INSERT INTO app_state (id, state_json, version, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      state_json = excluded.state_json,
      version = excluded.version,
      updated_at = CURRENT_TIMESTAMP
  `).bind('rick', serialized, nextVersion).run();

  return { ok: true, version: nextVersion, updatedAt: new Date().toISOString() };
}

async function addEventData(env, body = {}) {
  if (!body.eventType) throw new Error('eventType is required.');
  const payload = body.payload == null ? null : JSON.stringify(body.payload);
  await env.DB.prepare(`
    INSERT INTO crm_events (contact_id, event_type, channel, payload_json)
    VALUES (?, ?, ?, ?)
  `).bind(body.contactId || null, String(body.eventType).slice(0, 120), body.channel || null, payload).run();
  return { ok: true };
}

async function addEvent(request, env) {
  const body = await readJson(request);
  if (!body || !body.eventType) return { error: 'eventType is required.', status: 400 };
  return addEventData(env, body);
}

async function listEvents(url, env) {
  const limit = clampLimit(url.searchParams.get('limit'));
  const contactId = url.searchParams.get('contactId');
  const query = contactId
    ? env.DB.prepare(`SELECT id, contact_id, event_type, channel, payload_json, created_at FROM crm_events WHERE contact_id = ? ORDER BY id DESC LIMIT ?`).bind(contactId, limit)
    : env.DB.prepare(`SELECT id, contact_id, event_type, channel, payload_json, created_at FROM crm_events ORDER BY id DESC LIMIT ?`).bind(limit);
  const result = await query.all();
  const events = (result.results || []).map(row => {
    let payload = null;
    try { payload = row.payload_json ? JSON.parse(row.payload_json) : null; } catch {}
    return {
      id: row.id,
      contactId: row.contact_id,
      eventType: row.event_type,
      channel: row.channel,
      payload,
      createdAt: row.created_at
    };
  });
  return { events };
}

async function addMessageData(env, body = {}) {
  if (!body.direction || !body.channel) throw new Error('direction and channel are required.');
  if (!['outbound', 'inbound'].includes(body.direction)) throw new Error('Invalid direction.');
  const id = body.id || crypto.randomUUID();
  const metadata = body.metadata == null ? null : JSON.stringify(body.metadata);
  await env.DB.prepare(`
    INSERT INTO messages (
      id, contact_id, direction, channel, provider, sender, recipient, subject, body,
      status, provider_message_id, thread_id, metadata_json, sent_at, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      provider_message_id = COALESCE(excluded.provider_message_id, messages.provider_message_id),
      thread_id = COALESCE(excluded.thread_id, messages.thread_id),
      metadata_json = COALESCE(excluded.metadata_json, messages.metadata_json),
      sent_at = COALESCE(excluded.sent_at, messages.sent_at),
      received_at = COALESCE(excluded.received_at, messages.received_at)
  `).bind(
    id,
    body.contactId || null,
    body.direction,
    String(body.channel).slice(0, 40),
    body.provider || null,
    body.sender || null,
    body.recipient || null,
    body.subject || null,
    body.body || null,
    body.status || (body.direction === 'outbound' ? 'prepared' : 'received'),
    body.providerMessageId || null,
    body.threadId || null,
    metadata,
    body.sentAt || null,
    body.receivedAt || (body.direction === 'inbound' ? new Date().toISOString() : null)
  ).run();
  return { ok: true, id };
}

async function addMessage(request, env) {
  const body = await readJson(request);
  if (!body || !body.direction || !body.channel) {
    return { error: 'direction and channel are required.', status: 400 };
  }
  try {
    return await addMessageData(env, body);
  } catch (error) {
    return { error: safeError(error), status: 400 };
  }
}

async function listMessages(url, env) {
  const limit = clampLimit(url.searchParams.get('limit'));
  const contactId = url.searchParams.get('contactId');
  const query = contactId
    ? env.DB.prepare(`SELECT * FROM messages WHERE contact_id = ? ORDER BY created_at DESC LIMIT ?`).bind(contactId, limit)
    : env.DB.prepare(`SELECT * FROM messages ORDER BY created_at DESC LIMIT ?`).bind(limit);
  const result = await query.all();
  return {
    messages: (result.results || []).map(row => {
      let metadata = null;
      try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : null; } catch {}
      return {
        id: row.id,
        contactId: row.contact_id,
        direction: row.direction,
        channel: row.channel,
        provider: row.provider,
        sender: row.sender,
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
        status: row.status,
        providerMessageId: row.provider_message_id,
        threadId: row.thread_id,
        metadata,
        createdAt: row.created_at,
        sentAt: row.sent_at,
        receivedAt: row.received_at
      };
    })
  };
}

async function sendEmail(request, env) {
  const body = await readJson(request);
  if (!body) return { error: 'Invalid JSON body.', status: 400 };
  if (body.complianceOk !== true) return { error: 'Compliance approval is required.', status: 400 };

  const result = await sendMicrosoftEmail(env, body);
  const sentAt = new Date().toISOString();
  const message = await addMessageData(env, {
    contactId: body.contactId || null,
    direction: 'outbound',
    channel: 'email',
    provider: result.provider,
    sender: result.sender,
    recipient: result.recipient,
    subject: body.subject,
    body: body.body,
    status: 'sent',
    providerMessageId: result.providerMessageId,
    threadId: result.threadId,
    metadata: {
      requestedFrom: result.requestedFrom,
      internetMessageId: result.internetMessageId || null,
      campaignId: body.campaignId || null
    },
    sentAt
  });
  await addEventData(env, {
    contactId: body.contactId || null,
    eventType: 'message_sent',
    channel: 'email',
    payload: { messageId: message.id, providerMessageId: result.providerMessageId, threadId: result.threadId }
  });
  return { ...result, crmMessageId: message.id, sentAt };
}

async function sendSms(request, env) {
  const body = await readJson(request);
  if (!body) return { error: 'Invalid JSON body.', status: 400 };
  if (body.complianceOk !== true) return { error: 'Compliance approval is required.', status: 400 };

  const result = await sendTwilioText(env, body);
  const sentAt = new Date().toISOString();
  const message = await addMessageData(env, {
    contactId: body.contactId || null,
    direction: 'outbound',
    channel: 'sms',
    provider: result.provider,
    sender: result.sender,
    recipient: result.recipient,
    body: body.body,
    status: result.status || 'queued',
    providerMessageId: result.providerMessageId,
    metadata: { campaignId: body.campaignId || null },
    sentAt
  });
  await addEventData(env, {
    contactId: body.contactId || null,
    eventType: 'message_sent',
    channel: 'sms',
    payload: { messageId: message.id, providerMessageId: result.providerMessageId }
  });
  return { ...result, crmMessageId: message.id, sentAt };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, service: 'rick-booking-engine', version: '0.3.0', time: new Date().toISOString() }, { headers: cors });
    }

    if (url.pathname === '/api/auth/config' && request.method === 'GET') {
      return json({ auth: authStatus(env) }, { headers: cors });
    }

    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      try {
        const body = await readJson(request);
        const session = await createSession(env, body?.password || '');
        if (!session) return json({ error: 'Incorrect password.' }, { status: 401, headers: cors });
        return json({ ok: true, ...session }, { headers: cors });
      } catch (error) {
        return json({ error: safeError(error) }, { status: 503, headers: cors });
      }
    }

    if (!url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, { status: 404, headers: cors });

    const auth = await authorized(request, env);
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status, headers: cors });

    if (url.pathname === '/api/auth/status' && request.method === 'GET') {
      return json({ ok: true, subject: auth.subject, expiresAt: auth.session?.exp ? new Date(auth.session.exp * 1000).toISOString() : null }, { headers: cors });
    }

    if (url.pathname === '/api/providers' && request.method === 'GET') {
      return json({ email: microsoftStatus(env), sms: twilioStatus(env) }, { headers: cors });
    }

    if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, { status: 503, headers: cors });

    try {
      if (url.pathname === '/api/state' && request.method === 'GET') {
        const result = await getState(env);
        return json(result, { headers: { ...cors, etag: `W/\"${result.version}\"` } });
      }
      if (url.pathname === '/api/state' && request.method === 'PUT') {
        const result = await putState(request, env);
        return json(result, { status: result.status || 200, headers: cors });
      }
      if (url.pathname === '/api/events' && request.method === 'POST') {
        const result = await addEvent(request, env);
        return json(result, { status: result.status || 200, headers: cors });
      }
      if (url.pathname === '/api/events' && request.method === 'GET') {
        return json(await listEvents(url, env), { headers: cors });
      }
      if (url.pathname === '/api/messages' && request.method === 'POST') {
        const result = await addMessage(request, env);
        return json(result, { status: result.status || 200, headers: cors });
      }
      if (url.pathname === '/api/messages' && request.method === 'GET') {
        return json(await listMessages(url, env), { headers: cors });
      }
      if (url.pathname === '/api/send/email' && request.method === 'POST') {
        const result = await sendEmail(request, env);
        return json(result, { status: result.status || 200, headers: cors });
      }
      if (url.pathname === '/api/send/sms' && request.method === 'POST') {
        const result = await sendSms(request, env);
        return json(result, { status: result.status || 200, headers: cors });
      }
      return json({ error: 'Not found.' }, { status: 404, headers: cors });
    } catch (error) {
      console.error(error);
      return json({ error: safeError(error) }, { status: 502, headers: cors });
    }
  }
};
