export function normalizeVendorReceipt(prospect, message, classification) {
  if (!prospect || !['submission_redirect','positive_interest','question'].includes(classification?.category)) return classification;
  if (classification.extractedMoneyOrTerms || classification.requestedDates?.length || classification.mustEscalate) return classification;
  const text = [message?.body, classification.summary, classification.recommendedAction].filter(Boolean).join(' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const forwarded = /\b(forwarded|passed (?:it |this |your (?:information|details) )?(?:on|along)|shared your (?:information|details))\b/i.test(text);
  const vendorTeam = /\b(talent|vendor)\b.{0,100}\b(team|department)\b/i.test(text);
  const wait = /\b(reach out|contact you|be in touch)\b.{0,160}\b(interested|information|need|require)/i.test(text)
    || /\b(if|should)\b.{0,100}\b(interested|need|require)\b.{0,120}\b(reach out|contact|touch)/i.test(text)
    || /\b(do not|don't|no need to|avoid)\b.{0,100}\b(submit|submission|duplicate|duplication)/i.test(text);
  const noResubmit = /\b(do not|don't|no need to|avoid)\b.{0,100}\b(submit|submission|duplicate|duplication)/i.test(text);
  if (!forwarded || !vendorTeam || !wait || (classification.submissionUrl && !noResubmit)) return classification;
  return { ...classification, category: 'vendor_review_pending', mustEscalate: false, autoReplyAllowed: false,
    recommendedAction: 'Information has been forwarded to the talent/vendor team. Wait for their response; do not submit again or send another acknowledgement.',
    vendorReviewPending: true };
}

export async function escalationIdentity(message, messageId) {
  let metadata = {};
  try { metadata = JSON.parse(message?.metadata_json || '{}'); } catch {}
  const key = metadata.internetMessageId
    ? `${message?.provider || 'email'}:internet:${String(metadata.internetMessageId).trim()}`
    : message?.provider_message_id
    ? `${message.provider || 'unknown'}:provider:${message.provider_message_id}`
    : `message:${messageId}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return `ESC-${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
}
