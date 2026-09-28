import { ARTIST_PROFILE } from './artist-profile.js';
import { sendMicrosoftEmail } from './providers/microsoft.js';
import { draftBookingEmail } from './providers/openai.js';
import { canAutonomouslySend, withinSendWindow, prospectEligible, appendComplianceFooter } from './autopilot-policy.js';
import { listProspects } from './prospects.js';
import {
  nowIso, daysFromNow, event, prospectForPrompt, artistContext, assetText,
  priorThread, todayEventCount, storeOutbound, storeDraft, mirrorOverride
} from './autopilot-common.js';

const DRAFT_FORMAT_VERSION = 'signature-v2';

function recipientKey(email) { return String(email || '').trim().toLowerCase(); }

function nextFollowupDelay(config, touchCountAfterSend) {
  const offsets = Array.isArray(config.followupDays) ? config.followupDays : [5, 10, 16, 75];
  if (touchCountAfterSend <= 0) return offsets[0] || 5;
  const nextOffset = offsets[touchCountAfterSend - 1];
  if (nextOffset == null) return null;
  const priorOffset = touchCountAfterSend === 1 ? 0 : (offsets[touchCountAfterSend - 2] || 0);
  return Math.max(1, nextOffset - priorOffset);
}

async function promptProspect(env, prospect) {
  const prompt = prospectForPrompt(prospect);
  const email = recipientKey(prospect.email);
  if (!email) return prompt;
  const result = await env.DB.prepare(`
    SELECT id,entity,room,category,profile
    FROM prospects
    WHERE lower(email)=? AND id!=? AND suppressed=0 AND current_venue=0
    ORDER BY fit_score DESC LIMIT 8
  `).bind(email, prospect.id).all();
  prompt.relatedOpportunities = (result.results || []).map(row => ({
    entity: row.entity,
    room: row.room || '',
    category: row.category || '',
    profile: row.profile || 'room'
  }));
  return prompt;
}

async function draftInitial(env, prospect) {
  const profile = prospect.profile || prospect.campaign_type || 'room';
  const ai = await draftBookingEmail(env, {
    prospect: await promptProspect(env, prospect),
    artistContext: artistContext(profile),
    assets: assetText(profile),
    purpose: 'initial outreach'
  });
  return { ...ai.data, responseId: ai.responseId || null };
}

async function draftFollowup(env, prospect) {
  const profile = prospect.profile || prospect.campaign_type || 'room';
  const ai = await draftBookingEmail(env, {
    prospect: await promptProspect(env, prospect),
    artistContext: artistContext(profile),
    assets: assetText(profile),
    purpose: `follow-up touch ${Number(prospect.touch_count || 0) + 1}`,
    priorMessages: await priorThread(env, prospect.id)
  });
  return { ...ai.data, responseId: ai.responseId || null };
}

async function getApprovedPilotDraft(env, config) {
  const draftId = String(config.pilotApprovedDraftId || '').trim();
  if (config.mode !== 'pilot' || !draftId) return null;

  return env.DB.prepare(`
    SELECT m.id AS approved_draft_id,m.subject,m.body,p.*
    FROM messages m
    JOIN prospects p ON p.id=m.contact_id
    WHERE m.id=?
      AND m.direction='outbound'
      AND m.channel='email'
      AND m.status='draft'
      AND json_extract(m.metadata_json,'$.purpose')='initial'
      AND COALESCE(json_extract(m.metadata_json,'$.formatVersion'),'')=?
    LIMIT 1
  `).bind(draftId, DRAFT_FORMAT_VERSION).first();
}

async function claimApprovedPilotDraft(env, draftId) {
  const result = await env.DB.prepare(`
    UPDATE messages
    SET status='sending'
    WHERE id=? AND status='draft'
  `).bind(draftId).run();

  return Number(result?.meta?.changes || 0) === 1;
}

async function hasShadowDraft(env, contactId, purpose) {
  const row = await env.DB.prepare(`
    SELECT id FROM messages
    WHERE contact_id=? AND direction='outbound' AND channel='email' AND status='draft'
      AND json_extract(metadata_json,'$.purpose')=?
      AND COALESCE(json_extract(metadata_json,'$.formatVersion'),'')=?
    LIMIT 1
  `).bind(contactId, purpose, DRAFT_FORMAT_VERSION).first();
  return !!row;
}

async function existingRecipientThread(env, prospect) {
  const email = recipientKey(prospect.email);
  if (!email) return null;
  return env.DB.prepare(`
    SELECT contact_id,sent_at,thread_id,recipient
    FROM messages
    WHERE direction='outbound' AND channel='email' AND lower(recipient)=? AND status!='draft'
    ORDER BY COALESCE(sent_at,created_at) DESC LIMIT 1
  `).bind(email).first();
}

async function attachDuplicateToExistingThread(env, prospect, owner) {
  await env.DB.prepare(`
    UPDATE prospects SET
      status='Grouped Buyer',campaign_active=0,next_action_at=NULL,last_contacted_at=COALESCE(last_contacted_at,?)
    WHERE id=?
  `).bind(owner.sent_at || nowIso(), prospect.id).run();
  await event(env, prospect.id, 'autopilot_grouped_recipient', 'email', {
    groupedUnderContactId: owner.contact_id || null,
    threadId: owner.thread_id || null,
    recipient: owner.recipient || prospect.email
  });
}

async function sendDraft(env, config, prospect, draft, purpose) {
  const body = appendComplianceFooter(draft.body, config);
  const result = await sendMicrosoftEmail(env, {
    approved: true,
    complianceOk: true,
    to: prospect.email,
    from: ARTIST_PROFILE.bookingEmail,
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
      requestedFrom: ARTIST_PROFILE.bookingEmail,
      aiResponseId: draft.responseId || null,
      formatVersion: DRAFT_FORMAT_VERSION
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
    aiResponseId: draft.responseId || null,
    formatVersion: DRAFT_FORMAT_VERSION
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
  let grouped = 0;
  const initialUsed = await todayEventCount(env, 'autopilot_initial_sent');
  const followupUsed = await todayEventCount(env, 'autopilot_followup_sent');
  const seenRecipients = new Set();

  // One-shot Pilot safety lock: while an approved Shadow draft ID is armed,
  // Pilot may send only that exact stored draft and then must exit this cycle.
  if (config.mode === 'pilot' && config.pilotApprovedDraftId) {
    const approved = await getApprovedPilotDraft(env, config);

    if (!approved) {
      return {
        drafted, sentInitial, sentFollowups, grouped, skipped: skipped + 1,
        sendGate: sendGate.ok ? 'ready' : sendGate.reason,
        windowOpen,
        pilotLock: 'Approved draft is unavailable or already claimed.'
      };
    }

    const eligibility = prospectEligible(config, approved);
    if (!eligibility.ok) {
      return {
        drafted, sentInitial, sentFollowups, grouped, skipped: skipped + 1,
        sendGate: sendGate.ok ? 'ready' : sendGate.reason,
        windowOpen,
        pilotLock: `Approved recipient blocked: ${eligibility.reason}`
      };
    }

    if (!sendGate.ok || !windowOpen || initialUsed >= config.dailyInitialEmailLimit) {
      return {
        drafted, sentInitial, sentFollowups, grouped, skipped,
        sendGate: sendGate.ok ? 'ready' : sendGate.reason,
        windowOpen,
        pilotLock: 'Approved draft is armed but sending conditions are not open.'
      };
    }

    const claimed = await claimApprovedPilotDraft(env, approved.approved_draft_id);
    if (!claimed) {
      return {
        drafted, sentInitial, sentFollowups, grouped, skipped: skipped + 1,
        sendGate: sendGate.ok ? 'ready' : sendGate.reason,
        windowOpen,
        pilotLock: 'Approved draft was already claimed.'
      };
    }

    await sendDraft(env, config, approved, {
      subject: approved.subject,
      body: approved.body,
      responseId: null
    }, 'initial');

    sentInitial++;

    return {
      drafted, sentInitial, sentFollowups, grouped, skipped,
      sendGate: 'ready',
      windowOpen,
      pilotLock: 'Approved draft sent.'
    };
  }

  const initialCandidates = prospects.filter(p => !p.last_contacted_at && !Number(p.campaign_active || 0));
  for (const prospect of initialCandidates) {
    const eligibility = prospectEligible(config, prospect);
    if (!eligibility.ok) { skipped++; continue; }
    const key = recipientKey(prospect.email);
    if (!key) { skipped++; continue; }

    // One buyer email = one cold relationship thread, even if many room records point to it.
    if (seenRecipients.has(key)) { grouped++; continue; }
    seenRecipients.add(key);
    const owner = await existingRecipientThread(env, prospect);
    if (owner && owner.contact_id !== prospect.id) {
      await attachDuplicateToExistingThread(env, prospect, owner);
      grouped++;
      continue;
    }

    if (config.mode !== 'shadow' && (!sendGate.ok || !windowOpen || initialUsed + sentInitial >= config.dailyInitialEmailLimit)) break;
    if (config.mode === 'shadow' && await hasShadowDraft(env, prospect.id, 'initial')) continue;

    const draft = await draftInitial(env, prospect);
    if (config.mode === 'shadow') {
      const stored = await shadowDraft(env, config, prospect, draft, 'initial');
      if (stored.created) drafted++;
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
    const purpose = `followup-${Number(prospect.touch_count || 0) + 1}`;
    if (config.mode === 'shadow' && await hasShadowDraft(env, prospect.id, purpose)) continue;

    const draft = await draftFollowup(env, prospect);
    if (config.mode === 'shadow') {
      const stored = await shadowDraft(env, config, prospect, draft, purpose);
      if (stored.created) drafted++;
    } else {
      await sendDraft(env, config, prospect, draft, purpose);
      sentFollowups++;
    }
  }

  return {
    drafted,
    sentInitial,
    sentFollowups,
    grouped,
    skipped,
    sendGate: sendGate.ok ? 'ready' : sendGate.reason,
    windowOpen
  };
}
