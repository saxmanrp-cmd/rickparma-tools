export const NEW_BUSINESS = Object.freeze({
  name: 'Parma Entertainment Group',
  email: 'contact@parmaentertainmentgroup.com',
  website: 'https://parmaentertainmentgroup.com'
});

export const LEGACY_BUSINESS = Object.freeze({
  name: 'Rick Parma',
  email: 'booking@rickparma.com',
  website: 'https://rickparma.com/'
});

export function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function legacyMailbox(env) {
  return normalizedEmail(env.MS_SENDER_USER);
}

export function newOutboundMailbox(env) {
  return normalizedEmail(env.MS_NEW_OUTBOUND_USER);
}

export function isNewMailboxEnabled(env) {
  return String(env.MS_NEW_OUTBOUND_ENABLED || '').toLowerCase() === 'true';
}

export function businessForMailbox(env, mailbox) {
  return normalizedEmail(mailbox) === legacyMailbox(env) ? LEGACY_BUSINESS : NEW_BUSINESS;
}

export function requireKnownMailbox(env, mailbox) {
  const address = normalizedEmail(mailbox);
  if (!address || ![legacyMailbox(env), newOutboundMailbox(env)].includes(address)) {
    throw new Error('The message mailbox is not configured for this Booking Engine.');
  }
  return address;
}
