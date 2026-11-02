import { LEGACY_BUSINESS, NEW_BUSINESS, legacyMailbox, newOutboundMailbox, normalizedEmail } from './outbound-identity.js';

export const IDENTITY_TRANSITION_VERSION = 'parma-contact-v1';

export function identityTransitionText() {
  return `A quick contact update: my booking correspondence is now handled through ${NEW_BUSINESS.name}. The website is ${NEW_BUSINESS.website} and the email is ${NEW_BUSINESS.email}. You will no longer receive booking emails from ${LEGACY_BUSINESS.email}; future booking emails will come from ${NEW_BUSINESS.email}.`;
}

export async function prepareIdentityTransition(env, { contactId = '', to = '', body = '', force = false } = {}) {
  const recipient = normalizedEmail(to);
  if (!recipient || !env.DB) return { body: String(body || ''), identityTransitionNotice: false };
  if (String(body || '').includes(identityTransitionText())) {
    return {
      body: String(body),
      identityTransitionNotice: true,
      identityTransitionVersion: IDENTITY_TRANSITION_VERSION
    };
  }

  const [legacyOutbound, alreadyNotified] = await Promise.all([
    env.DB.prepare(`
      SELECT id FROM messages
      WHERE direction='outbound' AND channel='email' AND status='sent'
        AND lower(recipient)=? AND lower(sender) IN (?,?)
      LIMIT 1
    `).bind(recipient, legacyMailbox(env), normalizedEmail(env.MS_BOOKING_ALIAS)).first(),
    env.DB.prepare(`
      SELECT id FROM messages
      WHERE direction='outbound' AND channel='email' AND status='sent'
        AND lower(recipient)=? AND json_extract(metadata_json,'$.identityTransitionVersion')=?
      LIMIT 1
    `).bind(recipient, IDENTITY_TRANSITION_VERSION).first()
  ]);

  const shouldNotify = (force || !!legacyOutbound) && !alreadyNotified;
  if (!shouldNotify) return { body: String(body || ''), identityTransitionNotice: false };

  return {
    body: `${identityTransitionText()}\n\n${String(body || '').trim()}`.trim().slice(0, 20000),
    identityTransitionNotice: true,
    identityTransitionVersion: IDENTITY_TRANSITION_VERSION
  };
}

export function transitionMetadata(prepared = {}) {
  return prepared.identityTransitionNotice
    ? { identityTransitionNotice: true, identityTransitionVersion: prepared.identityTransitionVersion || IDENTITY_TRANSITION_VERSION }
    : {};
}

export function isNewSender(env, mailbox) {
  const address = newOutboundMailbox(env);
  return !!address && normalizedEmail(mailbox) === address;
}
