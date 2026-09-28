import { replyMicrosoftEmail, microsoftStatus } from './providers/microsoft.js';
import { sendTwilioText, twilioStatus } from './providers/twilio.js';
import { draftBookingReply } from './providers/openai.js';
import { getAutopilotConfig, appendComplianceFooter } from './autopilot-policy.js';
import { getProspect } from './prospects.js';
import { safeJson, artistContext, assetText, priorThread, storeOutbound, event, nowIso } from './autopilot-common.js';

async function loadEscalation(env, id) {
  return env.DB.prepare(`
    SELECT
      e.*,
      m.channel AS inbound_channel,m.sender AS inbound_sender,m.subject AS inbound_subject,
      m.body AS inbound_body,m.provider_message_id AS inbound_provider_message_id,m.thread_id AS inbound_thread_id,
      p.text_ok
    FROM escalations e
    LEFT JOIN messages m ON m.id=e.message_id
    LEFT JOIN prospects p ON p.id=e.contact_id
    WHERE e.id=? AND e.status='open'
    LIMIT 1
  `).bind(id).first();
}

async function storeSms(env, prospect, escalation, body, sent, aiResponseId) {
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
    JSON.stringify({ purpose:'rick-decision', escalationId:escalation.id, aiResponseId:aiResponseId || null }),
    nowIso()
  ).run();
  return id;
}

export async function respondToEscalation(env, id, decision = '') {
  const authoritativeDecision = String(decision || '').trim().slice(0, 3000);
  if (!authoritativeDecision) throw new Error("Rick's decision is required.");
  const escalation = await loadEscalation(env, id);
  if (!escalation) throw new Error('That Needs Rick item is no longer open.');
  const prospect = await getProspect(env, escalation.contact_id);
  if (!prospect) throw new Error('Prospect record not found.');

  const classification = safeJson(escalation.metadata_json, {});
  const safeClassification = {
    ...classification,
    mustEscalate: false,
    autoReplyAllowed: true,
    operatorDecision: authoritativeDecision,
    recommendedAction: `Rick's authoritative decision: ${authoritativeDecision}. Express exactly that decision without inventing or adding terms.`
  };
  const profile = prospect.profile || prospect.campaign_type || 'room';
  const draft = await draftBookingReply(env, {
    classification: safeClassification,
    inbound: {
      channel: escalation.inbound_channel,
      from: escalation.inbound_sender,
      subject: escalation.inbound_subject,
      body: escalation.inbound_body
    },
    artistContext: artistContext(profile),
    assets: assetText(profile),
    priorMessages: `${await priorThread(env, prospect.id)}\n\nRICK'S AUTHORITATIVE DECISION:\n${authoritativeDecision}`,
    calendarAvailability: classification.calendarAvailability || null
  });

  const config = await getAutopilotConfig(env);
  let outboundId;
  if (escalation.inbound_channel === 'sms') {
    if (!twilioStatus(env).configured) throw new Error('Twilio is not configured.');
    if (!Number(prospect.text_ok || 0)) throw new Error('Text OK is not enabled for this contact.');
    const body = String(draft.data.body || '').slice(0, 1500);
    const sent = await sendTwilioText(env, {
      approved: true,
      textOk: true,
      to: escalation.inbound_sender,
      body
    });
    outboundId = await storeSms(env, prospect, escalation, body, sent, draft.responseId);
  } else {
    if (!microsoftStatus(env).configured) throw new Error('Microsoft email is not configured.');
    if (!escalation.inbound_provider_message_id) throw new Error('The source Microsoft message is missing.');
    const body = appendComplianceFooter(draft.data.body, config);
    const sent = await replyMicrosoftEmail(env, {
      approved: true,
      sourceMessageId: escalation.inbound_provider_message_id,
      body
    });
    outboundId = await storeOutbound(env, {
      contactId: prospect.id,
      sender: sent.sender,
      recipient: sent.recipient || escalation.inbound_sender,
      subject: draft.data.subject || `Re: ${escalation.inbound_subject || 'Booking'}`,
      body,
      providerMessageId: sent.providerMessageId,
      threadId: sent.threadId || escalation.inbound_thread_id,
      internetMessageId: sent.internetMessageId,
      metadata: { purpose:'rick-decision', escalationId:escalation.id, aiResponseId:draft.responseId || null }
    });
  }

  await env.DB.prepare(`
    UPDATE escalations
    SET status='resolved',resolved_at=CURRENT_TIMESTAMP,
        metadata_json=json_set(COALESCE(metadata_json,'{}'),'$.resolution',?,'$.responseMessageId',?)
    WHERE id=?
  `).bind(authoritativeDecision, outboundId, escalation.id).run();
  await event(env, prospect.id, 'rick_decision_sent', escalation.inbound_channel || 'email', {
    escalationId: escalation.id,
    outboundMessageId: outboundId,
    decision: authoritativeDecision
  });
  await env.DB.prepare("UPDATE prospects SET status='Replied',campaign_active=0,next_action_at=NULL WHERE id=?")
    .bind(prospect.id).run();
  return { ok:true, escalationId:escalation.id, outboundMessageId:outboundId, subject:draft.data.subject || '', body:draft.data.body || '' };
}
