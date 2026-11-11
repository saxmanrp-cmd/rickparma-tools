export function normalizeVendorReceipt(prospect, message, classification) {
  if (!prospect || !['vendor_review_pending','submission_redirect','positive_interest','question','other','follow_up_later'].includes(classification?.category)) return classification;
  if (classification.extractedMoneyOrTerms || classification.requestedDates?.length || classification.mustEscalate) {
    return classification.category === 'vendor_review_pending' ? { ...classification, category: 'other', mustEscalate: true, autoReplyAllowed: false } : classification;
  }
  const text = [message?.body, classification.summary, classification.recommendedAction].filter(Boolean).join(' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  const concreteRequest = /\b(?:please|can you|could you|would you)\s+(?:also\s+)?(?:send|provide|submit|complete|confirm|quote|sign|call)\b/i.test(String(message?.body || '').replace(/<[^>]*>/g, ' '));
  if (concreteRequest) return classification.category === 'vendor_review_pending' ? { ...classification, category: 'other', mustEscalate: true, autoReplyAllowed: false } : classification;
  const forwarded = /\b(forwarded|passed (?:it |this |your (?:information|details) )?(?:on|along)|shared your (?:information|details))\b/i.test(text);
  const team = /\b(team|department|booking manager|talent buyer|event manager|colleagues)\b/i.test(text);
  const onList = /\b(?:we(?:'ll| will| have|'ve)?|you(?:'re| are| have been|'ve been)|your (?:name|information|details))\b.{0,100}\b(?:add(?:ed)?|put|keep|kept|retain|place(?:d)?|includ(?:e|ed))\b.{0,90}\b(?:list|roster|database|on file|records)\b/i.test(text)
    || /\b(?:keep|keeping|kept|have|retained)\b.{0,70}\byour (?:information|details|contact|name)\b.{0,50}\b(?:on file|in mind|in our (?:records|database))\b/i.test(text);
  const negative = /\b(?:cannot|can't|won't|will not|unable to|not able to|do not|don't|haven't|have not)\b.{0,45}\b(?:add|retain|include|keep|forward)\b/i.test(text);
  const noResubmit = /\b(do not|don't|no need to|avoid)\b.{0,100}\b(submit|submission|duplicate|duplication)/i.test(text);
  if (negative) return classification.category === 'vendor_review_pending' ? { ...classification, category: 'other', mustEscalate: true, autoReplyAllowed: false } : classification;
  if (!onList && !(forwarded && team) && classification.category !== 'vendor_review_pending') return classification;
  // A requested application, rate/date decision or other concrete task still needs handling.
  if (classification.submissionUrl && !noResubmit && !onList) return classification;
  return { ...classification, category: 'vendor_review_pending', mustEscalate: false, autoReplyAllowed: false,
    recommendedAction: 'Record the referral/list placement and hold automated outreach for 60 days. Do not send an acknowledgement or another submission.',
    vendorReviewPending: true, outreachHoldDays: 60 };
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
