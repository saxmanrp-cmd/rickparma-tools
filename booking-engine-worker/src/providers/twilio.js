function missing(env) {
  const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'];
  return keys.filter(key => !String(env[key] || '').trim());
}

export function twilioStatus(env) {
  const absent = missing(env);
  return {
    provider: 'twilio',
    configured: absent.length === 0,
    missing: absent,
    fromNumber: env.TWILIO_FROM_NUMBER || null
  };
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('A valid phone number is required.');
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

function sanitizeText(value, max = 1600) {
  return String(value || '').slice(0, max);
}

export async function sendTwilioText(env, input = {}) {
  if (input.approved !== true) throw new Error('Explicit approval is required before sending.');
  if (input.textOk !== true) throw new Error('Text OK must be enabled for this contact.');
  const absent = missing(env);
  if (absent.length) throw new Error(`Twilio is not configured: ${absent.join(', ')}`);

  const to = normalizePhone(input.to);
  const from = normalizePhone(env.TWILIO_FROM_NUMBER);
  const bodyText = sanitizeText(input.body, 1600).trim();
  if (!bodyText) throw new Error('SMS body is required.');

  const form = new URLSearchParams({ To: to, From: from, Body: bodyText });
  const credentials = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: form
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.sid) {
    const detail = data.message || data.code || `HTTP ${response.status}`;
    throw new Error(`Twilio send failed: ${detail}`);
  }

  return {
    ok: true,
    provider: 'twilio',
    sender: from,
    recipient: to,
    providerMessageId: data.sid,
    status: data.status || 'queued'
  };
}
