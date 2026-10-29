import {
  legacyMailbox, newOutboundMailbox, isNewMailboxEnabled,
  normalizedEmail, requireKnownMailbox
} from '../outbound-identity.js';
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

function missing(env) {
  const keys = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_SENDER_USER'];
  return keys.filter(key => !String(env[key] || '').trim());
}

export function microsoftStatus(env) {
  const absent = missing(env);
  return {
    provider: 'microsoft-graph',
    configured: absent.length === 0,
    missing: absent,
    legacyMailbox: legacyMailbox(env) || null,
    newOutboundMailbox: newOutboundMailbox(env) || null,
    newOutboundEnabled: isNewMailboxEnabled(env),
    bookingAlias: env.MS_BOOKING_ALIAS || null
  };
}

export async function resolveOutboundMailbox(env, { contactId = '', to = '' } = {}) {
  const recipient = normalizedEmail(to);
  const id = String(contactId || '').trim();
  if (env.DB && (id || recipient)) {
    const prior = await env.DB.prepare(`
      SELECT direction,sender,recipient FROM messages
      WHERE channel='email' AND status!='draft'
        AND ((?!='' AND contact_id=?) OR (?!='' AND lower(recipient)=?) OR (?!='' AND lower(sender)=?))
      ORDER BY CASE WHEN ?!='' AND contact_id=? THEN 0 ELSE 1 END,
               COALESCE(sent_at,received_at,created_at) ASC
      LIMIT 1
    `).bind(id, id, recipient, recipient, recipient, recipient, id, id).first();
    if (prior) {
      const address = normalizedEmail(prior.direction === 'inbound' ? prior.recipient : prior.sender);
      if (address === newOutboundMailbox(env)) return newOutboundMailbox(env);
      // Existing records predate this change and belong to the original mailbox.
      return legacyMailbox(env);
    }
  }
  return newOutboundMailbox(env);
}

async function accessToken(env) {
  const absent = missing(env);
  if (absent.length) throw new Error(`Microsoft Graph is not configured: ${absent.join(', ')}`);

  const body = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    client_secret: env.MS_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${response.status}`;
    throw new Error(`Microsoft token request failed: ${detail}`);
  }
  return data.access_token;
}

function normalizeAddress(value) {
  const address = String(value || '').trim();
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('A valid email address is required.');
  return address;
}

function sanitizeText(value, max = 10000) {
  return String(value || '').slice(0, max);
}

async function graphJson(url, init, label) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${label}: ${detail}`);
  }
  return data;
}

export async function sendMicrosoftEmail(env, input = {}, { verification = false } = {}) {
  if (input.approved !== true) throw new Error('Explicit approval is required before sending.');
  const to = normalizeAddress(input.to);
  const subject = sanitizeText(input.subject, 500).trim();
  const content = sanitizeText(input.body, 20000);
  if (!subject) throw new Error('Email subject is required.');
  if (!content.trim()) throw new Error('Email body is required.');

  // The CRM history owns the sender identity. Caller-supplied From values cannot
  // switch an established conversation to a different mailbox.
  const mailbox = requireKnownMailbox(env, verification
    ? newOutboundMailbox(env)
    : await resolveOutboundMailbox(env, { contactId: input.contactId, to }));
  if (mailbox === newOutboundMailbox(env) && !verification && !isNewMailboxEnabled(env)) {
    throw new Error('New Parma Entertainment Group outreach is paused until its Microsoft mailbox is verified.');
  }
  const replyTo = mailbox;
  const token = await accessToken(env);
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  };

  // Create a draft first so Graph gives us both a message id and conversation id.
  // Those identifiers are what the reply watcher uses to connect inbound responses
  // to the right CRM campaign.
  const draft = await graphJson(
    `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/messages`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        subject,
        replyTo: [{ emailAddress: { address: replyTo } }],
        body: { contentType: 'Text', content },
        toRecipients: [{ emailAddress: { address: to } }],
        internetMessageHeaders: [
          { name: 'X-Rick-Booking-Contact', value: sanitizeText(input.contactId, 180) || 'unknown' },
          { name: 'X-Rick-Booking-Campaign', value: sanitizeText(input.campaignId, 180) || 'unknown' }
        ]
      })
    },
    'Microsoft draft creation failed'
  );

  if (!draft.id) throw new Error('Microsoft draft did not return a message id.');
  const draftFrom = normalizedEmail(draft.from?.emailAddress?.address);
  if (draftFrom && draftFrom !== mailbox) {
    throw new Error(`Microsoft created the draft from ${draftFrom}, not the selected mailbox.`);
  }

  const sendResponse = await fetch(`${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(draft.id)}/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` }
  });
  if (!sendResponse.ok) {
    const data = await sendResponse.json().catch(() => ({}));
    const detail = data?.error?.message || `HTTP ${sendResponse.status}`;
    throw new Error(`Microsoft send failed: ${detail}`);
  }

  return {
    ok: true,
    provider: 'microsoft-graph',
    sender: mailbox,
    requestedFrom: mailbox,
    replyTo,
    recipient: to,
    providerMessageId: draft.id,
    threadId: draft.conversationId || null,
    internetMessageId: draft.internetMessageId || null
  };
}

export async function sendMicrosoftMailboxVerification(env) {
  const mailbox = newOutboundMailbox(env);
  if (!mailbox) throw new Error('MS_NEW_OUTBOUND_USER is not configured.');
  const subject = `Booking Engine mailbox verification ${crypto.randomUUID()}`;
  const sent = await sendMicrosoftEmail(env, {
    approved: true,
    contactId: 'mailbox-verification',
    campaignId: 'mailbox-verification',
    to: mailbox,
    subject,
    body: `This is an automated sender verification for ${mailbox}. It was sent only to the same mailbox to confirm Microsoft Graph From and Reply-To settings.`
  }, { verification: true });

  const token = await accessToken(env);
  const url = `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/mailFolders/sentitems/messages?$top=25&$orderby=sentDateTime%20desc&$select=id,subject,from,replyTo,toRecipients,conversationId,internetMessageId,sentDateTime`;
  let match = null;
  for (let attempt = 0; attempt < 4 && !match; attempt++) {
    const data = await graphJson(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } }, 'Microsoft Sent Items verification failed');
    match = (data.value || []).find(message => message.subject === subject) || null;
    if (!match && attempt < 3) await new Promise(resolve => setTimeout(resolve, 1500));
  }
  if (!match) throw new Error('Graph accepted the test send, but the message is not visible in the new mailbox Sent Items yet.');

  const from = normalizedEmail(match.from?.emailAddress?.address);
  const replyTo = normalizedEmail(match.replyTo?.[0]?.emailAddress?.address);
  const recipients = (match.toRecipients || []).map(item => normalizedEmail(item.emailAddress?.address));
  if (from !== mailbox || replyTo !== mailbox || !recipients.includes(mailbox)) {
    throw new Error(`Sent item identity mismatch: From=${from || 'missing'}, Reply-To=${replyTo || 'missing'}, expected ${mailbox}.`);
  }
  return {
    mailbox,
    from,
    replyTo,
    testRecipient: recipients[0] || mailbox,
    internetMessageId: match.internetMessageId || sent.internetMessageId || null,
    conversationId: match.conversationId || sent.threadId || null,
    verifiedAt: match.sentDateTime || new Date().toISOString()
  };
}

export async function replyMicrosoftEmail(env, input = {}) {
  if (input.approved !== true) throw new Error('Explicit approval is required before replying.');
  const sourceMessageId = String(input.sourceMessageId || '').trim();
  const content = sanitizeText(input.body, 20000).trim();
  if (!sourceMessageId) throw new Error('A source Microsoft message id is required for a threaded reply.');
  if (!content) throw new Error('Reply body is required.');

  const mailbox = requireKnownMailbox(env, input.mailbox || legacyMailbox(env));
  const token = await accessToken(env);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const replyDraft = await graphJson(
    `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(sourceMessageId)}/createReply`,
    { method: 'POST', headers, body: '{}' },
    'Microsoft createReply failed'
  );
  if (!replyDraft.id) throw new Error('Microsoft createReply did not return a draft id.');

  const updated = await graphJson(
    `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(replyDraft.id)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body: { contentType: 'Text', content } })
    },
    'Microsoft reply draft update failed'
  );

  const sendResponse = await fetch(`${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(replyDraft.id)}/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` }
  });
  if (!sendResponse.ok) {
    const data = await sendResponse.json().catch(() => ({}));
    const detail = data?.error?.message || `HTTP ${sendResponse.status}`;
    throw new Error(`Microsoft reply send failed: ${detail}`);
  }

  const recipient = (updated.toRecipients || replyDraft.toRecipients || [])[0]?.emailAddress?.address || null;
  return {
    ok: true,
    provider: 'microsoft-graph',
    sender: mailbox,
    recipient,
    subject: updated.subject || replyDraft.subject || null,
    providerMessageId: replyDraft.id,
    threadId: updated.conversationId || replyDraft.conversationId || null,
    internetMessageId: updated.internetMessageId || replyDraft.internetMessageId || null
  };
}

export async function syncMicrosoftDeletedBounces(env, limit = 25, selectedMailbox = '') {
  const token = await accessToken(env);
  const mailbox = requireKnownMailbox(env, selectedMailbox || legacyMailbox(env));
  const cap = Math.max(1, Math.min(100, Number(limit) || 25));
  const url = `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/mailFolders/deleteditems/messages?$top=${cap}&$orderby=receivedDateTime%20desc&$select=id,conversationId,internetMessageId,from,toRecipients,subject,body,bodyPreview,receivedDateTime`;

  const data = await graphJson(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      prefer: 'outlook.body-content-type="text"'
    }
  }, 'Microsoft Deleted Items bounce sync failed');

  const bouncePattern = /(undeliverable|delivery has failed|delivery status notification|couldn['’]?t be delivered|unknown to address|recipient address rejected|mail delivery failed|failure notice)/i;

  const messages = (data.value || [])
    .filter(message => !message?.['@removed'])
    .map(message => ({
      id: message.id || null,
      conversationId: message.conversationId || null,
      internetMessageId: message.internetMessageId || null,
      from: message.from?.emailAddress?.address || null,
      to: (message.toRecipients || []).map(r => r?.emailAddress?.address).filter(Boolean),
      subject: message.subject || '',
      body: String(message.body?.content || message.bodyPreview || '').slice(0, 30000),
      bodyPreview: message.bodyPreview || '',
      receivedDateTime: message.receivedDateTime || null
    }))
    .filter(message => bouncePattern.test(`${message.subject}\n${message.body}\n${message.bodyPreview}`));

  return { messages };
}

export async function syncMicrosoftInbox(env, deltaLink = '', selectedMailbox = '') {
  const token = await accessToken(env);
  const mailbox = requireKnownMailbox(env, selectedMailbox || legacyMailbox(env));
  let url = deltaLink || `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta?$select=id,conversationId,internetMessageId,from,toRecipients,subject,body,bodyPreview,receivedDateTime`;
  const messages = [];
  let finalDeltaLink = deltaLink || '';
  let pages = 0;

  while (url && pages < 10) {
    pages++;
    const data = await graphJson(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        prefer: 'outlook.body-content-type="text"'
      }
    }, 'Microsoft inbox sync failed');
    for (const message of (data.value || [])) {
      if (message?.['@removed']) continue;
      messages.push({
        id: message.id || null,
        conversationId: message.conversationId || null,
        internetMessageId: message.internetMessageId || null,
        from: message.from?.emailAddress?.address || null,
        to: (message.toRecipients || []).map(r => r?.emailAddress?.address).filter(Boolean),
        subject: message.subject || '',
        body: String(message.body?.content || message.bodyPreview || '').slice(0, 30000),
        bodyPreview: message.bodyPreview || '',
        receivedDateTime: message.receivedDateTime || null
      });
    }
    if (data['@odata.deltaLink']) finalDeltaLink = data['@odata.deltaLink'];
    url = data['@odata.nextLink'] || '';
  }

  return { messages, deltaLink: finalDeltaLink, pages };
}
