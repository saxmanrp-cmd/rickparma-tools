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
    senderUser: env.MS_SENDER_USER || null,
    bookingAlias: env.MS_BOOKING_ALIAS || null
  };
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

export async function sendMicrosoftEmail(env, input = {}) {
  if (input.approved !== true) throw new Error('Explicit approval is required before sending.');
  const to = normalizeAddress(input.to);
  const subject = sanitizeText(input.subject, 500).trim();
  const content = sanitizeText(input.body, 20000);
  if (!subject) throw new Error('Email subject is required.');
  if (!content.trim()) throw new Error('Email body is required.');

  const fromRequested = String(input.from || '').trim().toLowerCase();
  const allowedSenders = [env.MS_SENDER_USER, env.MS_BOOKING_ALIAS]
    .map(v => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  if (fromRequested && !allowedSenders.includes(fromRequested)) throw new Error('Requested From address is not allowed.');

  // GoDaddy/Microsoft 365 may still rewrite an alias to the licensed mailbox even when
  // alias sending is enabled. We preserve the requested identity in our CRM, but Graph
  // sends through the mailbox configured in MS_SENDER_USER unless/until the tenant
  // permits the alias as a true Graph sender.
  const mailbox = env.MS_SENDER_USER;
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
    requestedFrom: fromRequested || mailbox,
    recipient: to,
    providerMessageId: draft.id,
    threadId: draft.conversationId || null,
    internetMessageId: draft.internetMessageId || null
  };
}

export async function replyMicrosoftEmail(env, input = {}) {
  if (input.approved !== true) throw new Error('Explicit approval is required before replying.');
  const sourceMessageId = String(input.sourceMessageId || '').trim();
  const content = sanitizeText(input.body, 20000).trim();
  if (!sourceMessageId) throw new Error('A source Microsoft message id is required for a threaded reply.');
  if (!content) throw new Error('Reply body is required.');

  const mailbox = env.MS_SENDER_USER;
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
    providerMessageId: replyDraft.id,
    threadId: updated.conversationId || replyDraft.conversationId || null,
    internetMessageId: updated.internetMessageId || replyDraft.internetMessageId || null
  };
}

export async function syncMicrosoftInbox(env, deltaLink = '') {
  const token = await accessToken(env);
  const mailbox = env.MS_SENDER_USER;
  let url = deltaLink || `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta?$select=id,conversationId,internetMessageId,from,toRecipients,subject,bodyPreview,receivedDateTime`;
  const messages = [];
  let finalDeltaLink = deltaLink || '';
  let pages = 0;

  while (url && pages < 10) {
    pages++;
    const data = await graphJson(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
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
        bodyPreview: message.bodyPreview || '',
        receivedDateTime: message.receivedDateTime || null
      });
    }
    if (data['@odata.deltaLink']) finalDeltaLink = data['@odata.deltaLink'];
    url = data['@odata.nextLink'] || '';
  }

  return { messages, deltaLink: finalDeltaLink, pages };
}
