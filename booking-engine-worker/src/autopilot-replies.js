import { replyMicrosoftEmail, microsoftStatus } from './providers/microsoft.js';
import { classifyBookingReply, draftBookingReply } from './providers/openai.js';
import { categoryPolicy, canAutonomouslySend, withinSendWindow, appendComplianceFooter } from './autopilot-policy.js';
import { getProspect, suppressProspect } from './prospects.js';
import {
  safeJson, daysFromNow, event, artistContext, assetText, priorThread,
  todayEventCount, storeOutbound, storeDraft, mirrorOverride
} from './autopilot-common.js';

async function createEscalation(env, contactId, messageId, classification) {
  const existing = await env.DB.prepare("SELECT id FROM escalations WHERE message_id=? AND status='open' LIMIT 1")
    .bind(messageId).first();
  if (existing?.id) return existing.id;
  const id = crypto.randomUUID();
  const high = ['availability_request', 'rate_request', 'offer_or_hold'].includes(classification.category);
  await env.DB.prepare(`
    INSERT INTO escalations (id,contact_id,message_id,category,priority,summary,proposed_action,metadata_json)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id,
    contactId || null,
    messageId || null,
    classification.category,
    high ? 'high' : 'normal',
    classification.summary || 'Booking reply needs review.',
    classification.recommendedAction || '',
    JSON.stringify(classification)
  ).run();
  await event(env, contactId, 'autopilot_escalation_created', 'email', {
    escalationId: id,
    category: classification.category
  });
  return id;
}

async function saveClassification(env, message, classification, status = 'classified') {
  const metadata = safeJson(message.metadata_json, {});
  metadata.classification = classification;
  await env.DB.prepare('UPDATE messages SET status=?,metadata_json=? WHERE id=?')
    .bind(status, JSON.stringify(metadata), message.id).run();
}

async function applyClassification(env, message, classification) {
  const id = message.contact_id;
  if (!id) return;
  const category = classification.category;

  if (category === 'opt_out') {
    await suppressProspect(env, id, 'Recipient opted out of booking outreach.');
    await mirrorOverride(env, id, { Status: 'Do not contact', 'Next Follow-up': null });
    await event(env, id, 'autopilot_opt_out', 'email', { messageId: message.id });
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
    inbound: { from: message.sender, subject: message.subject, body: message.body },
    artistContext: artistContext(profile),
    assets: assetText(profile),
    priorMessages: await priorThread(env, prospect.id)
  });
  return {
    prospect,
    subject: draft.data.subject || `Re: ${message.subject || 'Booking'}`,
    body: appendComplianceFooter(draft.data.body, config),
    responseId: draft.responseId || null
  };
}

async function sendReply(env, message, classification, draft) {
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
      aiResponseId: draft.responseId
    }
  });
  await event(env, draft.prospect.id, 'autopilot_reply_sent', 'email', {
    messageId: outId,
    replyingTo: message.id,
    category: classification.category
  });
  return outId;
}

export async function processInboundCycle(env, config) {
  const rows = await env.DB.prepare(`
    SELECT * FROM messages
    WHERE direction='inbound' AND channel='email' AND status IN ('received','classified')
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
      classification = { ...result.data, aiResponseId: result.responseId || null };
      await saveClassification(env, message, classification, 'classified');
      await applyClassification(env, message, classification);
      classified++;
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

    const shouldReply = config.allowAutoRoutineReplies
      && classification.autoReplyAllowed !== false
      && (policy.autoReply || policy.escalate || classification.mustEscalate);

    if (!shouldReply) {
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
      continue;
    }

    const draft = await draftReplyForMessage(env, config, message, classification);
    if (!draft) {
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
      continue;
    }

    if (config.mode === 'shadow') {
      const stored = await storeDraft(env, draft.prospect.id, draft.subject, draft.body, {
        purpose: `shadow-reply-${message.id}`,
        replyingTo: message.id,
        replyCategory: classification.category,
        aiResponseId: draft.responseId
      });
      if (stored.created) shadowDrafted++;
      await saveClassification(env, { ...message, metadata_json: JSON.stringify(metadata) }, classification, 'processed');
      continue;
    }

    if (!gate.ok || !windowOpen || !microsoftReady || replyUsed + autoReplied >= config.dailyAutoReplyLimit || !message.provider_message_id) {
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
    sendGate: gate.ok ? 'ready' : gate.reason,
    windowOpen,
    microsoftReady
  };
}
