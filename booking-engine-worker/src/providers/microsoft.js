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
    senderUser: env.MS_SENDER_USER || null
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

  // Graph's sendMail endpoint sends as the mailbox in the URL. If Microsoft/GoDaddy
  // later supports the alias as a true Graph sender in this tenant, MS_SENDER_USER can
  // be changed accordingly. Until then, the app can still display booking@ as the
  // intended logistics identity while Graph uses the licensed mailbox.
  const mailbox = env.MS_SENDER_USER;
  const token = await accessToken(env);
  const payload = {
    message: {
      subject,
      body: { contentType: 'Text', content },
      toRecipients: [{ emailAddress: { address: to } }],
      internetMessageHeaders: [
        { name: 'X-Rick-Booking-Contact', value: sanitizeText(input.contactId, 180) || 'unknown' },
        { name: 'X-Rick-Booking-Campaign', value: sanitizeText(input.campaignId, 180) || 'unknown' }
      ]
    },
    saveToSentItems: true
  };

  const response = await fetch(`${GRAPH_ROOT}/users/${encodeURIComponent(mailbox)}/sendMail`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Microsoft send failed: ${detail}`);
  }

  return {
    ok: true,
    provider: 'microsoft-graph',
    sender: mailbox,
    requestedFrom: fromRequested || mailbox,
    recipient: to,
    providerMessageId: null,
    threadId: null
  };
}
