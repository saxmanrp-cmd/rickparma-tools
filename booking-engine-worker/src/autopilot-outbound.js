import { ARTIST_PROFILE } from './artist-profile.js';
import { sendMicrosoftEmail } from './providers/microsoft.js';
import { draftBookingEmail } from './providers/openai.js';
import { canAutonomouslySend, withinSendWindow, prospectEligible, appendComplianceFooter } from './autopilot-policy.js';
import { listProspects } from './prospects.js';
import {
  nowIso, daysFromNow, event, prospectForPrompt, artistContext, assetText,
  priorThread, todayEventCount, storeOutbound, storeDraft, mirrorOverride
} from './autopilot-common.js';

function nextFollowupDelay(config, touchCountAfterSend) {
  const offsets = Array.isArray(config.followupDays) ? config.followupDays : [5, 10, 16, 75];
  if (touchCountAfterSend <= 0) return offsets[0] || 5;
  const nextOffset = offsets[touchCountAfterSend - 1];
  if (nextOffset == null) return null;
  const priorOffset = touchCountAfterSend === 1 ? 0 : (offsets[touchCountAfterSend - 2] || 0);
  return Math.max(1, nextOffset - priorOffset);
}

async function draftInitial(env, prospect) {
  const profile = prospect.profile || prospect.campaign_type || 'room';
  const ai = await draftBookingEmail(env, {
    prospect: prospectForPrompt(prospect),
    artistContext: artistContext(profile),
    assets: assetText(profile),
    purpose: 'initial outreach'
  });
  return { ...ai.data, responseId: ai.responseId || null };
}

async function draftFollowup(env, prospect) {
  const profile = prospect.profile || prospect.campaign_type || 'room';
  const ai = await draftBookingEmail(env, {
    prospect: prospectForPrompt(prospect),
    artistContext: artistContext(profile),
    assets: assetText(profile),
    purpose: `follow-up touch ${Number(prospect.touch_count || 0) + 1}`,
    priorMessages: await priorThread(env, prospect.id)
  });
  return { ...ai.data, responseId: ai.responseId || null };
}

async function sendDraft(env, config, prospect, draft, purpose) {
  const body = appendComplianceFooter(draft.body, config);
  const result = await sendMicrosoftEmail(env, {
    approved: true,
    complianceOk: true,
    to: prospect.email,
    from: ARTIST_PROFILE.personalEmail,
    subject: draft.subject,
    body,
    contactId: prospect.id,
    campaignId: `AUTO-${prospect.id}`
  });

  const messageId = await storeOutbound(env, {
    contactId: prospect.id,
    sender: result.sender,
    recipient: result.recipient,
    subject: draft.subject,
    body,
    providerMessageId: result.providerMessageId,
    threadId: result.threadId,
    internetMessageId: result.internetMessageId,
    metadata: {
      purpose,
      requestedFrom: ARTIST_PROFILE.personalEmail,
      aiResponseId: draft.responseId || null
    }
  });

  const touchCount = Number(prospect.touch_count || 0) + 1;
  const delay = touchCount < config.maxColdTouches ? nextFollowupDelay(config, touchCount) : null;
  const nextAction = delay == null ? null : daysFromNow(delay);
  await env.DB.prepare(`
    UPDATE prospects SET
      status='Contacted',campaign_active=?,campaign_stage=?,touch_count=?,last_contacted_at=?,next_action_at=?
    WHERE id=?
  `).bind(delay == null ? 0 : 1, touchCount, touchCount, nowIso(), nextAction, prospect.id).run();
  await mirrorOverride(env, prospect.id, {
    Status: 'Sent',
    'Last Contacted': nowIso(),
    'Next Follow-up': nextAction
  });
  await event(env, prospect.id, purpose === 'initial' ? 'autopilot_initial_sent' : 'autopilot_followup_sent', 'email', {
    messageId,
    providerMessageId: result.providerMessageId,
    threadId: result.threadId,
    touchCount
  });
  return messageId;
}

async function shadowDraft(env, config, prospect, draft, purpose) {
  const body = appendComplianceFooter(draft.body, config);
  const stored = await storeDraft(env, prospect.id, draft.subject, body, {
    purpose,
    aiResponseId: draft.responseId || null
  });
  if (stored.created) await event(env, prospect.id, 'autopilot_shadow_draft', 'email', { purpose, messageId: stored.id });
  return stored;
}

export async function processOutboundCycle(env, config) {
  const sendGate = canAutonomouslySend(config);
  const windowOpen = withinSendWindow(config);
  const prospects = await listProspects(env, { limit: 300, eligibleOnly: true });
  let drafted = 0;
  let sentInitial = 0;
  let sentFollowups = 0;
  let skipped = 0;
  const initialUsed = await todayEventCount(env, 'autopilot_initial_sent');
  const followupUsed = await todayEventCount(env, 'autopilot_followup_sent');

  const initialCandidates = prospects.filter(p => !p.last_contacted_at && !Number(p.campaign_active || 0));
  for (const prospect of initialCandidates) {
    const eligibility = prospectEligible(config, prospect);
    if (!eligibility.ok) { skipped++; continue; }
    if (config.mode !== 'shadow' && (!sendGate.ok || !windowOpen || initialUsed + sentInitial >= config.dailyInitialEmailLimit)) break;
    const draft = await draftInitial(env, prospect);
    if (config.mode === 'shadow') {
      await shadowDraft(env, config, prospect, draft, 'initial');
      drafted++;
    } else {
      await sendDraft(env, config, prospect, draft, 'initial');
      sentInitial++;
    }
  }

  const due = prospects.filter(p => Number(p.campaign_active || 0) && p.next_action_at && String(p.next_action_at) <= nowIso());
  for (const prospect of due) {
    const eligibility = prospectEligible(config, prospect);
    if (!eligibility.ok) { skipped++; continue; }
    if (Number(prospect.touch_count || 0) >= config.maxColdTouches) {
      await env.DB.prepare("UPDATE prospects SET campaign_active=0,next_action_at=NULL,status='Nurture' WHERE id=?")
        .bind(prospect.id).run();
      continue;
    }
    if (config.mode !== 'shadow' && (!sendGate.ok || !windowOpen || followupUsed + sentFollowups >= config.dailyFollowupEmailLimit)) break;
    const draft = await draftFollowup(env, prospect);
    const purpose = `followup-${Number(prospect.touch_count || 0) + 1}`;
    if (config.mode === 'shadow') {
      await shadowDraft(env, config, prospect, draft, purpose);
      drafted++;
    } else {
      await sendDraft(env, config, prospect, draft, purpose);
      sentFollowups++;
    }
  }

  return {
    drafted,
    sentInitial,
    sentFollowups,
    skipped,
    sendGate: sendGate.ok ? 'ready' : sendGate.reason,
    windowOpen
  };
}
