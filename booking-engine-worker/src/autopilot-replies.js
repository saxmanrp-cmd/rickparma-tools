import { replyMicrosoftEmail, sendMicrosoftEmail, microsoftStatus } from './providers/microsoft.js';
import { sendTwilioText, twilioStatus } from './providers/twilio.js';
import { classifyBookingReply, draftBookingReply } from './providers/openai.js';
import { categoryPolicy, canAutonomouslySend, withinSendWindow, appendComplianceFooter } from './autopilot-policy.js';
import { getProspect, suppressProspect } from './prospects.js';
import { learnContactsFromReply } from './contacts.js';
import { checkRickAvailability } from './calendar-availability.js';
import { businessForMailbox, legacyMailbox, newOutboundMailbox } from './outbound-identity.js';
import { isNewSender, prepareIdentityTransition, transitionMetadata } from './sender-transition.js';
import {
  safeJson, daysFromNow, event, artistContext, assetText, priorThread,
  todayEventCount, storeOutbound, storeDraft, mirrorOverride, nowIso
} from './autopilot-common.js';

function alertClip(value, max = 1500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function interventionAlertBody(env, contactId, messageId, classification) {
  const prospect = contactId ? await getProspect(env, contactId) : null;
  const message = messageId
    ? await env.DB.prepare('SELECT sender,subject,body FROM messages WHERE id=? LIMIT 1').bind(messageId).first()
    : null;

  const venue = prospect?.entity || 'Booking contact';
  const person = [prospect?.contact_name, prospect?.contact_role].filter(Boolean).join(' — ')
    || message?.sender
    || prospect?.email
    || 'Unknown contact';
  const contact = [prospect?.phone, prospect?.email].filter(Boolean).join(' • ');
  const summary = alertClip(classification.summary || 'A booking conversation needs your attention.', 700);
  const why = [
    classification.extractedDateOrWindow ? `Dates: ${classification.extractedDateOrWindow}` : '',
    classification.extractedMoneyOrTerms ? `Money/terms: ${classification.extractedMoneyOrTerms}` : '',
    classification.humanHandoffReason || ''
  ].filter(Boolean).join(' | ');
  const recommended = alertClip(classification.recommendedAction || '', 300);

  return [
    `NEEDS RICK — ${venue}`,
    person,
    contact,
    message?.subject ? `Subject: ${message.subject}` : '',
    '',
    `Conversation: ${summary}`,
    why ? `Why now: ${why}` : '',
    recommended ? `Suggested: ${recommended}` : '',
    '',
    'Open Booking Engine → Needs Rick. If you are calling them, tap “I’m Calling • Pause Emails” first.'
  ].filter(Boolean).join('\n').slice(0, 1550);
}

async function sendOwnerInterventionSms(env, to, body) {
  if (env.SMS_BLAST && typeof env.SMS_BLAST.fetch === 'function') {
    const response = await env.SMS_BLAST.fetch(new Request('https://sms-blast.internal/api/conversations/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: to, message: body })
    }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `SMS Blast alert failed with ${response.status}.`);
    }
    return { ok: true, provider: 'sms-blast-service', providerMessageId: data?.sid || null, status: data?.status || 'sent' };
  }

  const sent = await sendTwilioText(env, {
    approved: true,
    textOk: true,
    to,
    body
  });
  return { ...sent, provider: 'twilio-direct' };
}

async function sendInterventionAlert(env, config, contactId, messageId, classification, escalationId) {
  if (!config || config.interventionAlertsEnabled === false) return;

  const to = String(config.interventionAlertPhone || env.BOOKING_ALERT_PHONE || '').trim();
  if (!to) {
    await event(env, contactId, 'autopilot_intervention_alert_skipped', 'sms', {
      escalationId,
      reason: 'Intervention alert phone is not configured.'
    });
    return;
  }

  try {
    const sent = await sendOwnerInterventionSms(
      env,
      to,
      await interventionAlertBody(env, contactId, messageId, classification)
    );
    await event(env, contactId, 'autopilot_intervention_alert_sent', 'sms', {
      escalationId,
      providerMessageId: sent.providerMessageId
    });
  } catch (error) {
    await event(env, contactId, 'autopilot_intervention_alert_failed', 'sms', {
      escalationId,
      error: String(error?.message || error).slice(0, 500)
    });
  }
}

async function createEscalation(env, contactId, messageId, classification, config = null) {
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
    calendarAvailability: classification.calendarAvailability || null,
    humanHandoffReason: classification.humanHandoffReason || null
  });

  await sendInterventionAlert(env, config, contactId, messageId, classification, id);
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
const REPLY_DISPOSITION_VERSION = 'reply-disposition-v2';

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
  if (learning.primaryUpdated && learning.primaryContact) {
    await mirrorOverride(env, prospect.id, {
      Contact: learning.primaryContact.name || '',
      Role: learning.primaryContact.role || '',
      Phone: learning.primaryContact.phone || '',
      ...(learning.organizationWebsite ? { Website: learning.organizationWebsite } : {})
    });
  }

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
    if (existing?.contactLearning?.version === CONTACT_LEARNING_VERSION && existing?.dispositionVersion === REPLY_DISPOSITION_VERSION) continue;
    scanned++;

    try {
      const refreshed = await classifyBookingReply(env, {
        sender: message.sender,
        subject: message.subject,
        body: message.body,
        context: await priorThread(env, message.contact_id)
      });

      let classification = {
        ...existing,
        ...refreshed.data,
        channel: existing.channel || message.channel,
        aiResponseId: existing.aiResponseId || refreshed.responseId || null,
        dispositionVersion: REPLY_DISPOSITION_VERSION
      };

      if (classification.category === 'not_booking_contact') {
        await applyClassification(env, message, classification);
      }

      classification = await ensureReplyContactLearning(env, message, classification);

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

async function applyClassification(env, message, classification, config = null) {
  const id = message.contact_id;
  if (!id) return;
  const category = classification.category;

  if (category === 'opt_out') {
    await suppressProspect(env, id, 'Recipient opted out of booking outreach.');
    await mirrorOverride(env, id, { Status: 'Do not contact', 'Next Follow-up': null });
    await event(env, id, 'autopilot_opt_out', message.channel, { messageId: message.id });
    return;
  }

  if (category === 'not_booking_contact') {
    await env.DB.prepare("UPDATE prospects SET status='Pass',automation_safe='NO',suppressed=1,campaign_active=0,next_action_at=NULL WHERE id=?")
      .bind(id).run();
    await mirrorOverride(env, id, { Status: 'Pass', 'Next Follow-up': null });
    await event(env, id, 'autopilot_non_booking_contact', message.channel, {
      messageId: message.id,
      summary: classification.summary || ''
    });
    return;
  }

  if (category === 'not_interested') {
    await env.DB.prepare("UPDATE prospects SET status='Pass',campaign_active=0,next_action_at=NULL WHERE id=?").bind(id).run();
    await mirrorOverride(env, id, { Status: 'Pass', 'Next Follow-up': null });
    return;
  }

  if (category === 'bounce') {
    const prospect = await getProspect(env, id);
    const messageMeta = safeJson(message.metadata_json, {});
    const prospectMeta = safeJson(prospect?.metadata_json, {});
    const bouncedEmail = String(messageMeta.bounceTarget || prospect?.email || '').trim().toLowerCase();
    const currentEmail = String(prospect?.email || '').trim().toLowerCase();
    const shouldClearCurrentEmail = !!bouncedEmail && currentEmail === bouncedEmail;
    const invalidEmails = [...new Set([
      ...(Array.isArray(prospectMeta.invalidEmails) ? prospectMeta.invalidEmails : []),
      ...(bouncedEmail ? [bouncedEmail] : [])
    ])];

    const nextMetadata = {
      ...prospectMeta,
      invalidEmails,
      lastBounceAt: nowIso(),
      lastBounceMessageId: message.id,
      lastBounceEmail: bouncedEmail || null,
      bounceRecoveryPending: true
    };

    await env.DB.prepare(`
      UPDATE prospects SET
        email=CASE WHEN ?=1 THEN NULL ELSE email END,
        contact_route=CASE WHEN ?=1 THEN 'unknown' ELSE contact_route END,
        status='Research Needed',
        automation_safe='MANUAL',
        campaign_active=0,
        next_action_at=NULL,
        verified_at=NULL,
        metadata_json=?
      WHERE id=?
    `).bind(shouldClearCurrentEmail ? 1 : 0, shouldClearCurrentEmail ? 1 : 0, JSON.stringify(nextMetadata), id).run();

    await mirrorOverride(env, id, {
      ...(shouldClearCurrentEmail ? { Email: '' } : {}),
      Status: 'Research',
      'Next Follow-up': null
    });
    await event(env, id, 'autopilot_bounce', message.channel, {
      messageId: message.id,
      bouncedEmail: bouncedEmail || null
    });
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
    }, config);
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
  const business = businessForMailbox(env, message.channel === 'email' ? newOutboundMailbox(env) : (message.recipient || legacyMailbox(env)));
  const draft = await draftBookingReply(env, {
    classification,
    inbound: { channel: message.channel, from: message.sender, subject: message.subject, body: message.body },
    artistContext: artistContext(profile, business),
    assets: assetText(profile, business),
    priorMessages: await priorThread(env, prospect.id),
    calendarAvailability: classification.calendarAvailability || null
  });
  return {
    prospect,
    subject: draft.data.subject || `Re: ${message.subject || 'Booking'}`,
    body: message.channel === 'sms' ? String(draft.data.body || '').slice(0, 1500) : appendComplianceFooter(draft.data.body, config, business),
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

  const keepCurrentThread = isNewSender(env, message.recipient);
  const transition = await prepareIdentityTransition(env, {
    contactId: draft.prospect.id,
    to: message.sender,
    body: draft.body,
    force: !keepCurrentThread
  });
  const sent = keepCurrentThread
    ? await replyMicrosoftEmail(env, {
        approved: true,
        sourceMessageId: message.provider_message_id,
        mailbox: message.recipient,
        body: transition.body
      })
    : await sendMicrosoftEmail(env, {
        approved: true,
        complianceOk: true,
        to: message.sender,
        from: newOutboundMailbox(env),
        subject: draft.subject,
        body: transition.body,
        contactId: draft.prospect.id,
        campaignId: `AUTO-REPLY-${draft.prospect.id}`
      });
  const outId = await storeOutbound(env, {
    contactId: draft.prospect.id,
    sender: sent.sender,
    recipient: sent.recipient || message.sender,
    subject: draft.subject,
    body: transition.body,
    providerMessageId: sent.providerMessageId,
    threadId: sent.threadId || (keepCurrentThread ? message.thread_id : null),
    internetMessageId: sent.internetMessageId,
    metadata: {
      purpose: 'auto-reply',
      replyingTo: message.id,
      replyCategory: classification.category,
      calendarAvailability: classification.calendarAvailability || null,
      aiResponseId: draft.responseId,
      inExistingThread: keepCurrentThread,
      ...transitionMetadata(transition)
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

async function humanHandoffNeeded(env, message, classification) {
  if (!message?.contact_id) return { needed: false, reason: '' };

  const category = String(classification?.category || '');
  const meaningful = new Set(['positive_interest', 'request_materials', 'question']);
  const suggestedCall = /\b(call|phone|speak|talk|conversation)\b/i.test(String(classification?.recommendedAction || ''));

  if (!meaningful.has(category) && !suggestedCall) return { needed: false, reason: '' };

  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM messages
    WHERE contact_id=? AND direction='inbound' AND channel='email'
  `).bind(message.contact_id).first();

  const inboundCount = Number(row?.n || 0);

  if (suggestedCall) {
    return { needed: true, reason: 'The recommended next step is a direct conversation with Rick.' };
  }
  if (inboundCount >= 2) {
    return {
      needed: true,
      reason: `This is meaningful reply #${inboundCount} in the email conversation; Rick should step in before more automated back-and-forth.`
    };
  }

  return { needed: false, reason: '' };
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
    const prospectAtStart = message.contact_id ? await getProspect(env, message.contact_id) : null;
    const rickHandling = String(prospectAtStart?.status || '').toLowerCase() === 'rick handling';
    let metadata = safeJson(message.metadata_json, {});
    let classification = metadata.classification;

    if (!classification) {
      const result = await classifyBookingReply(env, {
        sender: message.sender,
        subject: message.subject,
        body: message.body,
        context: message.contact_id ? await priorThread(env, message.contact_id) : ''
      });
      classification = await enrichAvailability({
        ...result.data,
        channel: message.channel,
        aiResponseId: result.responseId || null,
        dispositionVersion: REPLY_DISPOSITION_VERSION
      });
      classification = await ensureReplyContactLearning(env, message, classification);
      await saveClassification(env, message, classification, 'classified');
      if (!rickHandling) await applyClassification(env, message, classification, config);
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

    if (rickHandling) {
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
      await event(env, message.contact_id, 'rick_handling_inbound_received', message.channel, { messageId: message.id });
      stopped++;
      continue;
    }

    const policy = categoryPolicy(classification.category);
    const handoff = await humanHandoffNeeded(env, message, classification);
    const needsRick = !!classification.mustEscalate || !!policy.escalate || handoff.needed;

    if (needsRick) {
      const escalationClassification = classification.category === 'bounce'
        ? {
            ...classification,
            recommendedAction: 'The Booking Agent will research a new direct, publicly verified booking contact and send a fresh email from contact@parmaentertainmentgroup.com with the business contact update. If no reliable direct email is found, this will stay flagged for Rick.'
          }
        : handoff.needed
        ? { ...classification, humanHandoffReason: handoff.reason }
        : classification;

      await createEscalation(env, message.contact_id, message.id, escalationClassification, config);
      escalated++;

      // Once Rick is needed, hold automated email so the text alert gives him a real chance to step in.
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, escalationClassification, 'processed');
      stopped++;
      continue;
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
