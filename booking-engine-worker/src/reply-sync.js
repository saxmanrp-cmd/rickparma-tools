import { microsoftStatus, syncMicrosoftInbox } from './providers/microsoft.js';

const encoder = new TextEncoder();

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

async function addEvent(env, { contactId = null, eventType, channel = null, payload = null }) {
  await env.DB.prepare(`
    INSERT INTO crm_events (contact_id, event_type, channel, payload_json)
    VALUES (?, ?, ?, ?)
  `).bind(contactId, eventType, channel, payload == null ? null : JSON.stringify(payload)).run();
}

async function updateContactReplied(env, contactId, { channel, preview = '', receivedAt = null, sender = null } = {}) {
  if (!contactId) return;
  const row = await env.DB.prepare('SELECT state_json, version FROM app_state WHERE id = ?').bind('rick').first();
  let state = {};
  try { state = JSON.parse(row?.state_json || '{}'); } catch {}
  state.overrides ||= {};
  state.campaigns ||= {};

  const current = state.overrides[contactId] || {};
  const protectedStatus = ['Booked', 'Pass', 'Do not contact'].includes(current.Status);
  if (!protectedStatus) {
    state.overrides[contactId] = {
      ...current,
      Status: 'Replied',
      'Next Follow-up': null,
      'Last Reply At': receivedAt || new Date().toISOString(),
      'Last Reply Channel': channel || null,
      'Last Reply From': sender || null,
      'Last Reply Preview': String(preview || '').slice(0, 500)
    };
  }

  if (state.campaigns[contactId]) {
    state.campaigns[contactId] = {
      ...state.campaigns[contactId],
      active: false,
      paused: false,
      repliedAt: receivedAt || new Date().toISOString()
    };
  }

  const nextVersion = Number(row?.version || 0) + 1;
  await env.DB.prepare(`
    INSERT INTO app_state (id, state_json, version, updated_at)
    VALUES ('rick', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      state_json = excluded.state_json,
      version = excluded.version,
      updated_at = CURRENT_TIMESTAMP
  `).bind(JSON.stringify(state), nextVersion).run();
}

async function getSyncCursor(env, provider) {
  const row = await env.DB.prepare('SELECT cursor FROM sync_state WHERE provider = ?').bind(provider).first();
  return row?.cursor || '';
}

async function setSyncCursor(env, provider, cursor, metadata = null) {
  await env.DB.prepare(`
    INSERT INTO sync_state (provider, cursor, metadata_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(provider) DO UPDATE SET
      cursor = excluded.cursor,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(provider, cursor || null, metadata == null ? null : JSON.stringify(metadata)).run();
}

async function alreadyStored(env, provider, providerMessageId) {
  if (!providerMessageId) return false;
  const row = await env.DB.prepare('SELECT id FROM messages WHERE provider = ? AND provider_message_id = ? LIMIT 1')
    .bind(provider, providerMessageId).first();
  return !!row;
}

async function storeInbound(env, input) {
  if (await alreadyStored(env, input.provider, input.providerMessageId)) return null;
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO messages (
      id, contact_id, direction, channel, provider, sender, recipient, subject, body,
      status, provider_message_id, thread_id, metadata_json, received_at
    ) VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?)
  `).bind(
    id,
    input.contactId || null,
    input.channel,
    input.provider,
    input.sender || null,
    input.recipient || null,
    input.subject || null,
    input.body || null,
    input.providerMessageId || null,
    input.threadId || null,
    input.metadata == null ? null : JSON.stringify(input.metadata),
    input.receivedAt || new Date().toISOString()
  ).run();
  return id;
}

async function matchMicrosoftOutbound(env, message, sender) {
  if (message.conversationId) {
    const byThread = await env.DB.prepare(`
      SELECT id, contact_id, sent_at, thread_id
      FROM messages
      WHERE direction='outbound' AND channel='email' AND thread_id=?
      ORDER BY sent_at DESC, created_at DESC LIMIT 1
    `).bind(message.conversationId).first();
    if (byThread?.contact_id) return { ...byThread, matchedBy: 'thread' };
  }

  // Some buyers start a brand-new message rather than pressing Reply. If we previously
  // emailed that exact address, attach the new message to the most recent relationship.
  if (sender) {
    const byRecipient = await env.DB.prepare(`
      SELECT id, contact_id, sent_at, thread_id
      FROM messages
      WHERE direction='outbound' AND channel='email' AND lower(recipient)=?
      ORDER BY sent_at DESC, created_at DESC LIMIT 1
    `).bind(sender).first();
    if (byRecipient?.contact_id) return { ...byRecipient, matchedBy: 'sender' };
  }
  return null;
}

export async function syncMicrosoftReplies(env) {
  if (!env.DB || !microsoftStatus(env).configured) return { ok: true, skipped: true, reason: 'Microsoft or DB not configured.' };

  const providerKey = 'microsoft-inbox';
  const cursor = await getSyncCursor(env, providerKey);
  const result = await syncMicrosoftInbox(env, cursor);
  let matched = 0;
  let stored = 0;
  let matchedByThread = 0;
  let matchedBySender = 0;
  const selfAddresses = new Set([env.MS_SENDER_USER, env.MS_BOOKING_ALIAS].map(normalizeEmail).filter(Boolean));

  for (const message of result.messages) {
    const sender = normalizeEmail(message.from);
    if (!sender || selfAddresses.has(sender)) continue;

    const outbound = await matchMicrosoftOutbound(env, message, sender);
    if (!outbound?.contact_id) continue;
    if (outbound.sent_at && message.receivedDateTime && String(message.receivedDateTime) <= String(outbound.sent_at)) continue;
    matched++;
    if (outbound.matchedBy === 'thread') matchedByThread++;
    if (outbound.matchedBy === 'sender') matchedBySender++;

    const body = message.body || message.bodyPreview || '';
    const inboundId = await storeInbound(env, {
      contactId: outbound.contact_id,
      channel: 'email',
      provider: 'microsoft-graph',
      sender: message.from,
      recipient: env.MS_SENDER_USER,
      subject: message.subject,
      body,
      providerMessageId: message.id,
      threadId: message.conversationId || outbound.thread_id || null,
      receivedAt: message.receivedDateTime,
      metadata: {
        internetMessageId: message.internetMessageId || null,
        matchedBy: outbound.matchedBy
      }
    });
    if (!inboundId) continue;
    stored++;

    await addEvent(env, {
      contactId: outbound.contact_id,
      eventType: 'message_received',
      channel: 'email',
      payload: {
        messageId: inboundId,
        providerMessageId: message.id,
        threadId: message.conversationId || outbound.thread_id || null,
        matchedBy: outbound.matchedBy
      }
    });
    await updateContactReplied(env, outbound.contact_id, {
      channel: 'email',
      preview: body,
      receivedAt: message.receivedDateTime,
      sender: message.from
    });
  }

  if (result.deltaLink) {
    await setSyncCursor(env, providerKey, result.deltaLink, {
      lastMatched: matched,
      lastStored: stored,
      matchedByThread,
      matchedBySender,
      pages: result.pages
    });
  }
  return { ok: true, checked: result.messages.length, matched, stored, matchedByThread, matchedBySender, pages: result.pages };
}

async function twilioSignature(env, url, params) {
  let data = url;
  for (const key of [...params.keys()].sort()) {
    const values = params.getAll(key);
    for (const value of values) data += `${key}${value}`;
  }
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(env.TWILIO_AUTH_TOKEN),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
  let binary = '';
  signed.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function secureEqual(a, b) {
  const aa = encoder.encode(String(a || ''));
  const bb = encoder.encode(String(b || ''));
  const max = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < max; i++) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

export async function handleTwilioWebhook(request, env) {
  if (!env.DB || !env.TWILIO_AUTH_TOKEN) return new Response('Not configured', { status: 503 });
  const params = new URLSearchParams(await request.text());
  const supplied = request.headers.get('x-twilio-signature') || '';
  const expected = await twilioSignature(env, request.url, params);
  if (!secureEqual(supplied, expected)) return new Response('Invalid signature', { status: 403 });

  const from = normalizePhone(params.get('From'));
  const to = normalizePhone(params.get('To'));
  const body = params.get('Body') || '';
  const sid = params.get('MessageSid') || params.get('SmsMessageSid') || '';
  const receivedAt = new Date().toISOString();

  let outbound = null;
  if (from) {
    outbound = await env.DB.prepare(`
      SELECT id, contact_id
      FROM messages
      WHERE direction='outbound' AND channel='sms' AND recipient=?
      ORDER BY sent_at DESC, created_at DESC LIMIT 1
    `).bind(from).first();
  }

  const inboundId = await storeInbound(env, {
    contactId: outbound?.contact_id || null,
    channel: 'sms',
    provider: 'twilio',
    sender: from,
    recipient: to,
    body,
    providerMessageId: sid || null,
    receivedAt,
    metadata: {
      accountSid: params.get('AccountSid') || null,
      messagingServiceSid: params.get('MessagingServiceSid') || null,
      numMedia: params.get('NumMedia') || '0'
    }
  });

  if (outbound?.contact_id && inboundId) {
    await addEvent(env, {
      contactId: outbound.contact_id,
      eventType: 'message_received',
      channel: 'sms',
      payload: { messageId: inboundId, providerMessageId: sid || null }
    });
    await updateContactReplied(env, outbound.contact_id, {
      channel: 'sms',
      preview: body,
      receivedAt,
      sender: from
    });
  }

  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' }
  });
}
