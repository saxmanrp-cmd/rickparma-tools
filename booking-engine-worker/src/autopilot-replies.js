import { replyMicrosoftEmail, microsoftStatus } from './providers/microsoft.js';
import { sendTwilioText, twilioStatus } from './providers/twilio.js';
import { classifyBookingReply, draftBookingReply } from './providers/openai.js';
import { categoryPolicy, canAutonomouslySend, withinSendWindow, appendComplianceFooter } from './autopilot-policy.js';
import { getProspect, suppressProspect } from './prospects.js';
import { learnContactsFromReply } from './contacts.js';
import { checkRickAvailability } from './calendar-availability.js';
import {
  safeJson, daysFromNow, event, artistContext, assetText, priorThread,
  todayEventCount, storeOutbound, storeDraft, mirrorOverride, nowIso
} from './autopilot-common.js';

async function createEscalation(env, contactId, messageId, classification) {
  const existing = await env.DB.prepare("SELECT id FROM escalations WHERE message_id=? AND status='open' LIMIT 1")
    .bind(messageId).first();
  if (existing?.id) return existing.id;
  const id = crypto.randomUUID();
  const high = ['availability_request', 'rate_request', 'offer_or_hold'].includes(classification.category);
  const availabilityNote = classification.calendarAvailability?.summary
    ? ` Calendar: ${classification.calendarAvailability.summary}`
    : '';
  await env.DB.prepare(`
    INSERT INTO escalations (id,contact_id,message_id,category,priority,summary,proposed_action,metadata_json)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id,
    contactId || null,
    messageId || null,
    classification.category,
    high ? 'high' : 'normal',
    `${classification.summary || 'Booking reply needs review.'}${availabilityNote}`.slice(0, 4000),
    classification.recommendedAction || '',
    JSON.stringify(classification)
  ).run();
  await event(env, contactId, 'autopilot_escalation_created', classification.channel || null, {
    escalationId: id,
    category: classification.category,
    calendarAvailability: classification.calendarAvailability || null
  });
  return id;
}

async function saveClassification(env, message, classification, status = 'classified') {
  const metadata = safeJson(message.metadata_json, {});
  metadata.classification = classification;
  await env.DB.prepare('UPDATE messages SET status=?,metadata_json=? WHERE id=?')
    .bind(status, JSON.stringify(metadata), message.id).run();
}

async function enrichAvailability(classification) {
  const dates = Array.isArray(classification?.requestedDates) ? classification.requestedDates : [];
  const shouldCheck = dates.length > 0 || ['availability_request', 'offer_or_hold'].includes(classification?.category);
  if (!shouldCheck) return classification;
  try {
    const calendarAvailability = await checkRickAvailability(dates.length ? dates : [classification.extractedDateOrWindow || '']);
    return { ...classification, calendarAvailability };
  } catch (error) {
    return {
      ...classification,
      calendarAvailability: {
        source: 'rick-parma-shows-calendar',
        dates: [],
        summary: 'Calendar check unavailable; Rick must confirm manually.',
        error: String(error?.message || error).slice(0, 500)
      }
    };
  }
}


const CONTACT_LEARNING_VERSION = 'reply-contacts-v1';

async function ensureReplyContactLearning(env, message, classification = {}) {
  if (classification?.contactLearning?.version === CONTACT_LEARNING_VERSION) return classification;
  if (!message?.contact_id) {
    return {
      ...classification,
      contactLearning: { version: CONTACT_LEARNING_VERSION, learned: 0, primaryUpdated: false }
    };
  }

  let extraction = classification;
  if (!Array.isArray(extraction.discoveredContacts)) {
    const refreshed = await classifyBookingReply(env, {
      sender: message.sender,
      subject: message.subject,
      body: message.body,
      context: await priorThread(env, message.contact_id)
    });
    extraction = refreshed.data || {};
  }

  const prospect = await getProspect(env, message.contact_id);
  if (!prospect) {
    return {
      ...classification,
      discoveredContacts: extraction.discoveredContacts || [],
      organizationWebsite: extraction.organizationWebsite || '',
      organizationSocialUrls: extraction.organizationSocialUrls || [],
      organizationMarkets: extraction.organizationMarkets || [],
      contactLearning: { version: CONTACT_LEARNING_VERSION, learned: 0, primaryUpdated: false }
    };
  }

  const learning = await learnContactsFromReply(env, prospect, message, extraction);
  if (learning.learned || learning.primaryUpdated) {
    await event(env, prospect.id, 'autopilot_contacts_learned', message.channel, {
      messageId: message.id,
      learned: learning.learned,
      primaryUpdated: learning.primaryUpdated,
      primaryContact: learning.primaryContact || null
    });
  }

  return {
    ...classification,
    discoveredContacts: extraction.discoveredContacts || [],
    organizationWebsite: extraction.organizationWebsite || '',
    organizationSocialUrls: extraction.organizationSocialUrls || [],
    organizationMarkets: extraction.organizationMarkets || [],
    contactLearning: learning
  };
}

async function backfillReplyContacts(env, limit = 4) {
  const rows = await env.DB.prepare(`
    SELECT * FROM messages
    WHERE direction='inbound'
      AND channel='email'
      AND contact_id IS NOT NULL
      AND status='processed'
    ORDER BY COALESCE(received_at,created_at) DESC
    LIMIT 30
  `).all();

  let scanned = 0;
  let enriched = 0;

  for (const message of rows.results || []) {
    if (scanned >= limit) break;
    const metadata = safeJson(message.metadata_json, {});
    const existing = metadata.classification || {};
    if (existing?.contactLearning?.version === CONTACT_LEARNING_VERSION) continue;
    scanned++;

    try {
      const refreshed = await classifyBookingReply(env, {
        sender: message.sender,
        subject: message.subject,
        body: message.body,
        context: await priorThread(env, message.contact_id)
      });

      const classification = await ensureReplyContactLearning(env, message, {
        ...existing,
        discoveredContacts: refreshed.data?.discoveredContacts || [],
        organizationWebsite: refreshed.data?.organizationWebsite || '',
        organizationSocialUrls: refreshed.data?.organizationSocialUrls || [],
        organizationMarkets: refreshed.data?.organizationMarkets || []
      });

      metadata.classification = classification;
      await env.DB.prepare('UPDATE messages SET metadata_json=? WHERE id=?')
        .bind(JSON.stringify(metadata), message.id).run();
      enriched++;
    } catch (error) {
      console.error('reply-contact-backfill-failed', message.id, error);
    }
  }

  return { scanned, enriched };
}

async function applyClassification(env, message, classification) {
  const id = message.contact_id;
  if (!id) return;
  const category = classification.category;

  if (category === 'opt_out') {
    await suppressProspect(env, id, 'Recipient opted out of booking outreach.');
    await mirrorOverride(env, id, { Status: 'Do not contact', 'Next Follow-up': null });
    await event(env, id, 'autopilot_opt_out', message.channel, { messageId: message.id });
    return;
  }

  if (category === 'not_interested') {
    await env.DB.prepare("UPDATE prospects SET status='Pass',campaign_active=0,next_action_at=NULL WHERE id=?").bind(id).run();
    await mirrorOverride(env, id, { Status: 'Pass', 'Next Follow-up': null });
    return;
  }

  if (category === 'bounce') {
    await env.DB.prepare("UPDATE prospects SET status='Research Needed',automation_safe='MANUAL',campaign_active=0,next_action_at=NULL WHERE id=?")
      .bind(id).run();
    await mirrorOverride(env, id, { Status: 'Research', 'Next Follow-up': null });
    return;
  }

  if (category === 'out_of_office') {
    const next = daysFromNow(7);
    await env.DB.prepare("UPDATE prospects SET status='Contacted',campaign_active=1,next_action_at=? WHERE id=?")
      .bind(next, id).run();
    await mirrorOverride(env, id, { Status: 'Sent', 'Next Follow-up': next });
    return;
  }

  if (category === 'follow_up_later') {
    let follow = new Date(classification.followUpDate || '');
    if (Number.isNaN(follow.getTime()) || follow <= new Date()) follow = new Date(Date.now() + 30 * 86400000);
    await env.DB.prepare("UPDATE prospects SET status='Follow Up Later',campaign_active=1,next_action_at=? WHERE id=?")
      .bind(follow.toISOString(), id).run();
    await mirrorOverride(env, id, { Status: 'Follow Up Later', 'Next Follow-up': follow.toISOString() });
    return;
  }

  if (category === 'submission_redirect') {
    await env.DB.prepare("UPDATE prospects SET status='Submission Needed',campaign_active=0,next_action_at=NULL,booking_url=COALESCE(NULLIF(?,''),booking_url) WHERE id=?")
      .bind(classification.submissionUrl || '', id).run();
    await createEscalation(env, id, message.id, {
      ...classification,
      summary: classification.summary || 'Contact redirected Rick to an official artist submission route.'
    });
    await mirrorOverride(env, id, { Status: 'Replied', 'Next Follow-up': null });
    return;
  }

  await env.DB.prepare("UPDATE prospects SET status='Replied',campaign_active=0,next_action_at=NULL WHERE id=?").bind(id).run();
  await mirrorOverride(env, id, { Status: 'Replied', 'Next Follow-up': null });
}

async function draftReplyForMessage(env, config, message, classification) {
  const prospect = await getProspect(env, message.contact_id);
  if (!prospect) return null;
  const profile = prospect.profile || prospect.campaign_type || 'room';
  const draft = await draftBookingReply(env, {
    classification,
    inbound: { channel: message.channel, from: message.sender, subject: message.subject, body: message.body },
    artistContext: artistContext(profile),
    assets: assetText(profile),
    priorMessages: await priorThread(env, prospect.id),
    calendarAvailability: classification.calendarAvailability || null
  });
  return {
    prospect,
    subject: draft.data.subject || `Re: ${message.subject || 'Booking'}`,
    body: message.channel === 'sms' ? String(draft.data.body || '').slice(0, 1500) : appendComplianceFooter(draft.data.body, config),
    responseId: draft.responseId || null
  };
}

async function storeOutboundSms(env, prospect, message, body, sent, classification, draft) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO messages (
      id,contact_id,direction,channel,provider,sender,recipient,body,status,
      provider_message_id,metadata_json,sent_at
    ) VALUES (?,?,'outbound','sms','twilio',?,?,?,'sent',?,?,?)
  `).bind(
    id,
    prospect.id,
    sent.sender,
    sent.recipient,
    body,
    sent.providerMessageId || null,
    JSON.stringify({
      purpose: 'auto-reply',
      replyingTo: message.id,
      replyCategory: classification.category,
      calendarAvailability: classification.calendarAvailability || null,
      aiResponseId: draft.responseId
    }),
    nowIso()
  ).run();
  return id;
}

async function sendReply(env, message, classification, draft) {
  if (message.channel === 'sms') {
    if (!Number(draft.prospect.text_ok || 0)) throw new Error('Text OK is not enabled for this contact.');
    const sent = await sendTwilioText(env, {
      approved: true,
      textOk: true,
      to: message.sender,
      body: draft.body
    });
    const outId = await storeOutboundSms(env, draft.prospect, message, draft.body, sent, classification, draft);
    await event(env, draft.prospect.id, 'autopilot_reply_sent', 'sms', {
      messageId: outId,
      replyingTo: message.id,
      category: classification.category,
      calendarAvailability: classification.calendarAvailability || null
    });
    return outId;
  }

  const sent = await replyMicrosoftEmail(env, {
    approved: true,
    sourceMessageId: message.provider_message_id,
    body: draft.body
  });
  const outId = await storeOutbound(env, {
    contactId: draft.prospect.id,
    sender: sent.sender,
    recipient: sent.recipient || message.sender,
    subject: draft.subject,
    body: draft.body,
    providerMessageId: sent.providerMessageId,
    threadId: sent.threadId || message.thread_id,
    internetMessageId: sent.internetMessageId,
    metadata: {
      purpose: 'auto-reply',
      replyingTo: message.id,
      replyCategory: classification.category,
      calendarAvailability: classification.calendarAvailability || null,
      aiResponseId: draft.responseId
    }
  });
  await event(env, draft.prospect.id, 'autopilot_reply_sent', 'email', {
    messageId: outId,
    replyingTo: message.id,
    category: classification.category,
    calendarAvailability: classification.calendarAvailability || null
  });
  return outId;
}

export async function processInboundCycle(env, config) {
  const contactBackfill = await backfillReplyContacts(env);

  const rows = await env.DB.prepare(`
    SELECT * FROM messages
    WHERE direction='inbound' AND channel IN ('email','sms') AND status IN ('received','classified')
    ORDER BY COALESCE(received_at,created_at) ASC
    LIMIT 30
  `).all();

  let classified = 0;
  let autoReplied = 0;
  let escalated = 0;
  let stopped = 0;
  let shadowDrafted = 0;
  const replyUsed = await todayEventCount(env, 'autopilot_reply_sent');
  const gate = canAutonomouslySend(config);
  const windowOpen = withinSendWindow(config);
  const microsoftReady = microsoftStatus(env).configured;
  const twilioReady = twilioStatus(env).configured;

  for (const message of rows.results || []) {
    let metadata = safeJson(message.metadata_json, {});
    let classification = metadata.classification;

    if (!classification) {
      const result = await classifyBookingReply(env, {
        sender: message.sender,
        subject: message.subject,
        body: message.body,
        context: message.contact_id ? await priorThread(env, message.contact_id) : ''
      });
      classification = await enrichAvailability({ ...result.data, channel: message.channel, aiResponseId: result.responseId || null });
      classification = await ensureReplyContactLearning(env, message, classification);
      await saveClassification(env, message, classification, 'classified');
      await applyClassification(env, message, classification);
      classified++;
      metadata = { ...metadata, classification };
    } else if (!classification.calendarAvailability && (classification.requestedDates?.length || ['availability_request','offer_or_hold'].includes(classification.category))) {
      classification = await enrichAvailability({ ...classification, channel: message.channel });
      classification = await ensureReplyContactLearning(env, message, classification);
      await saveClassification(env, message, classification, 'classified');
      metadata = { ...metadata, classification };
    } else if (classification?.contactLearning?.version !== CONTACT_LEARNING_VERSION) {
      classification = await ensureReplyContactLearning(env, message, classification);
      await saveClassification(env, message, classification, 'classified');
      metadata = { ...metadata, classification };
    }

    const policy = categoryPolicy(classification.category);
    if (classification.mustEscalate || policy.escalate) {
      await createEscalation(env, message.contact_id, message.id, classification);
      escalated++;
    }

    if (policy.noReply) {
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
      stopped++;
      continue;
    }

    const shouldReply = !(config.mode === 'pilot' && config.pilotApprovedDraftId) && config.allowAutoRoutineReplies && (
      policy.escalate
      || classification.mustEscalate
      || (classification.autoReplyAllowed !== false && policy.autoReply)
    );

    if (!shouldReply) {
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
      continue;
    }

    const draft = await draftReplyForMessage(env, config, message, classification);
    if (!draft) {
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
      continue;
    }

    const channelAllowed = message.channel === 'email'
      ? microsoftReady && !!message.provider_message_id
      : twilioReady && Number(draft.prospect.text_ok || 0) === 1;

    if (config.mode === 'shadow') {
      const stored = await storeDraft(env, draft.prospect.id, draft.subject, draft.body, {
        purpose: `shadow-reply-${message.channel}-${message.id}`,
        replyingTo: message.id,
        replyChannel: message.channel,
        replyCategory: classification.category,
        calendarAvailability: classification.calendarAvailability || null,
        aiResponseId: draft.responseId
      });
      if (stored.created) shadowDrafted++;
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
      continue;
    }

    if (!gate.ok || !windowOpen || !channelAllowed || replyUsed + autoReplied >= config.dailyAutoReplyLimit) {
      continue;
    }

    await sendReply(env, message, classification, draft);
    autoReplied++;
    await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
  }

  return {
    classified,
    autoReplied,
    escalated,
    stopped,
    shadowDrafted,
    contactBackfill,
    sendGate: gate.ok ? 'ready' : gate.reason,
    windowOpen,
    microsoftReady,
    twilioReady
  };
}
