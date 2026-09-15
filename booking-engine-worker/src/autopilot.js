import { ARTIST_PROFILE, campaignAssets, compactCredentials } from './artist-profile.js';
import { microsoftStatus, sendMicrosoftEmail, replyMicrosoftEmail } from './providers/microsoft.js';
import { openaiStatus, researchBookingProspects, classifyBookingReply, draftBookingEmail, draftBookingReply } from './providers/openai.js';
import {
  getAutopilotConfig, canAutonomouslySend, withinSendWindow, prospectEligible,
  appendComplianceFooter, categoryPolicy, localParts
} from './autopilot-policy.js';
import {
  verificationTargets, upsertResearchedProspect, listProspects, getProspect, suppressProspect
} from './prospects.js';

function nowIso() { return new Date().toISOString(); }
function daysFromNow(days) { return new Date(Date.now() + Number(days || 0) * 86400000).toISOString(); }
function safeJson(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }

async function event(env, contactId, eventType, channel = null, payload = null) {
  await env.DB.prepare(`INSERT INTO crm_events (contact_id,event_type,channel,payload_json) VALUES (?,?,?,?)`)
    .bind(contactId || null, eventType, channel, payload == null ? null : JSON.stringify(payload)).run();
}

async function startRun(env, runType, mode) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO autopilot_runs (id,run_type,mode,status) VALUES (?,?,?,'running')`)
    .bind(id, runType, mode).run();
  return id;
}
async function finishRun(env, id, summary = {}, error = '') {
  await env.DB.prepare(`UPDATE autopilot_runs SET status=?, summary_json=?, error_text=?, finished_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(error ? 'failed' : 'completed', JSON.stringify(summary || {}), error || null, id).run();
}

async function lastCompletedRun(env, runType) {
  return env.DB.prepare(`SELECT * FROM autopilot_runs WHERE run_type=? AND status='completed' ORDER BY started_at DESC LIMIT 1`)
    .bind(runType).first();
}

function sameLocalDay(iso, timezone) {
  if (!iso) return false;
  const a = localParts(new Date(iso), timezone).dateKey;
  const b = localParts(new Date(), timezone).dateKey;
  return a === b;
}

async function storeOutbound(env, {
  contactId, sender, recipient, subject = '', body, providerMessageId, threadId,
  internetMessageId = null, status = 'sent', metadata = {}
}) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO messages (
      id,contact_id,direction,channel,provider,sender,recipient,subject,body,status,
      provider_message_id,thread_id,metadata_json,sent_at
    ) VALUES (?,?,'outbound','email','microsoft-graph',?,?,?,?,?,?,?,?,?)
  `).bind(
    id, contactId || null, sender || null, recipient || null, subject || null, body || null, status,
    providerMessageId || null, threadId || null,
    JSON.stringify({ ...metadata, internetMessageId: internetMessageId || null }), nowIso()
  ).run();
  return id;
}

async function storeDraft(env, contactId, subject, body, metadata = {}) {
  const existing = await env.DB.prepare(`
    SELECT id FROM messages
    WHERE contact_id=? AND direction='outbound' AND channel='email' AND status='draft'
      AND json_extract(metadata_json,'$.purpose') = ?
    ORDER BY created_at DESC LIMIT 1
  `).bind(contactId, metadata.purpose || 'initial').first();
  if (existing?.id) {
    await env.DB.prepare('UPDATE messages SET subject=?, body=?, metadata_json=? WHERE id=?')
      .bind(subject, body, JSON.stringify(metadata), existing.id).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO messages (id,contact_id,direction,channel,provider,sender,recipient,subject,body,status,metadata_json)
    VALUES (?,?,'outbound','email','shadow',?,?,?,?, 'draft', ?)
  `).bind(id, contactId, ARTIST_PROFILE.personalEmail, null, subject, body, JSON.stringify(metadata)).run();
  return id;
}

function prospectForPrompt(p) {
  return {
    id: p.id,
    entity: p.entity,
    room: p.room || '',
    category: p.category || '',
    profile: p.profile || p.campaign_type || 'room',
    contactName: p.contact_name || '',
    contactRole: p.contact_role || '',
    email: p.email || '',
    website: p.website_url || '',
    bookingUrl: p.booking_url || '',
    fitReason: p.fit_reason || '',
    evidenceSummary: p.evidence_summary || ''
  };
}

function artistContext(profile) {
  return [
    `${ARTIST_PROFILE.name} — ${ARTIST_PROFILE.positioning.join('; ')}.`,
    `Formats: ${ARTIST_PROFILE.formats.join(', ')}.`,
    `Music: ${ARTIST_PROFILE.styles.join(', ')}.`,
    compactCredentials(profile),
    `Website: ${ARTIST_PROFILE.website}`,
    `Instagram: ${ARTIST_PROFILE.instagram}`
  ].join('\n');
}

function assetText(profile) {
  return campaignAssets(profile).map(x => `${x.label}: ${x.url}`).join('\n');
}

async function todayEventCount(env, eventType) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM crm_events WHERE event_type=? AND date(created_at)=date('now')`)
    .bind(eventType).first();
  return Number(row?.n || 0);
}

function nextFollowupDelay(config, touchCount) {
  const offsets = Array.isArray(config.followupDays) ? config.followupDays : [5,10,16,75];
  if (touchCount <= 0) return offsets[0] || 5;
  const priorOffset = offsets[Math.max(0, touchCount - 2)] || 0;
  const nextOffset = offsets[Math.max(0, touchCount - 1)];
  if (nextOffset == null) return null;
  return Math.max(1, nextOffset - priorOffset);
}

async function mirrorOverride(env, contactId, patch) {
  if (!contactId) return;
  const row = await env.DB.prepare('SELECT state_json,version FROM app_state WHERE id=?').bind('rick').first();
  let state = safeJson(row?.state_json, {});
  state.overrides ||= {};
  state.overrides[contactId] = { ...(state.overrides[contactId] || {}), ...patch };
  if (state.campaigns?.[contactId] && ['Replied','Pass','Do not contact','Booked'].includes(patch.Status)) {
    state.campaigns[contactId] = { ...state.campaigns[contactId], active: false, paused: false };
  }
  const version = Number(row?.version || 0) + 1;
  await env.DB.prepare(`
    INSERT INTO app_state (id,state_json,version,updated_at) VALUES ('rick',?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,version=excluded.version,updated_at=CURRENT_TIMESTAMP
  `).bind(JSON.stringify(state), version).run();
}

export async function runResearch(env, config) {
  const runId = await startRun(env, 'research', config.mode);
  try {
    const targets = await verificationTargets(env, config.verifyDailyTarget);
    const ai = await researchBookingProspects(env, {
      verify: targets.map(x => ({
        id: x.id, entity: x.entity, room: x.room, contactName: x.contact_name,
        contactRole: x.contact_role, email: x.email, phone: x.phone
      })),
      discoverCount: config.researchDailyTarget
    });
    let verified = 0;
    let discovered = 0;
    for (const item of ai.data.verified || []) {
      if (!item.requestedId) continue;
      await upsertResearchedProspect(env, item, item.requestedId);
      verified++;
    }
    for (const item of ai.data.discovered || []) {
      if ((!item.sourceUrls || !item.sourceUrls.length) && ai.sources?.length) item.sourceUrls = ai.sources.slice(0, 5);
      await upsertResearchedProspect(env, item);
      discovered++;
    }
    const summary = { verified, discovered, notes: ai.data.researchNotes || '', responseId: ai.responseId, sources: ai.sources?.slice(0, 20) || [] };
    await finishRun(env, runId, summary);
    return summary;
  } catch (error) {
    await finishRun(env, runId, {}, String(error?.message || error));
    throw error;
  }
}

async function draftInitial(env, p) {
  const profile = p.profile || p.campaign_type || 'room';
  const ai = await draftBookingEmail(env, {
    prospect: prospectForPrompt(p),
    artistContext: artistContext(profile),
    assets: assetText(profile),
    purpose: 'initial outreach'
  });
  return { ...ai.data, responseId: ai.responseId };
}

async function priorThread(env, contactId, limit = 6) {
  const result = await env.DB.prepare(`
    SELECT direction,subject,body,created_at FROM messages WHERE contact_id=? ORDER BY created_at DESC LIMIT ?
  `).bind(contactId, limit).all();
  return (result.results || []).reverse().map(m => `${m.direction.toUpperCase()} ${m.subject || ''}\n${m.body || ''}`).join('\n\n---\n\n').slice(0, 12000);
}

async function draftFollowup(env, p) {
  const profile = p.profile || p.campaign_type || 'room';
  const ai = await draftBookingEmail(env, {
    prospect: prospectForPrompt(p),
    artistContext: artistContext(profile),
    assets: assetText(profile),
    purpose: `follow-up touch ${Number(p.touch_count || 0) + 1}`,
    priorMessages: await priorThread(env, p.id)
  });
  return { ...ai.data, responseId: ai.responseId };
}

async function sendDraft(env, config, p, draft, purpose) {
  const body = appendComplianceFooter(draft.body, config);
  const result = await sendMicrosoftEmail(env, {
    approved: true,
    complianceOk: true,
    to: p.email,
    from: ARTIST_PROFILE.personalEmail,
    subject: draft.subject,
    body,
    contactId: p.id,
    campaignId: `AUTO-${p.id}`
  });
  const messageId = await storeOutbound(env, {
    contactId: p.id,
    sender: result.sender,
    recipient: result.recipient,
    subject: draft.subject,
    body,
    providerMessageId: result.providerMessageId,
    threadId: result.threadId,
    internetMessageId: result.internetMessageId,
    metadata: { purpose, requestedFrom: ARTIST_PROFILE.personalEmail, aiResponseId: draft.responseId || null }
  });
  const newTouchCount = Number(p.touch_count || 0) + 1;
  const delay = newTouchCount < config.maxColdTouches ? nextFollowupDelay(config, newTouchCount) : null;
  await env.DB.prepare(`
    UPDATE prospects SET
      status='Contacted', campaign_active=?, campaign_stage=?, touch_count=?, last_contacted_at=?, next_action_at=?
    WHERE id=?
  `).bind(delay == null ? 0 : 1, newTouchCount, newTouchCount, nowIso(), delay == null ? null : daysFromNow(delay), p.id).run();
  await mirrorOverride(env, p.id, { Status: 'Sent', 'Last Contacted': nowIso(), 'Next Follow-up': delay == null ? null : daysFromNow(delay) });
  await event(env, p.id, purpose === 'initial' ? 'autopilot_initial_sent' : 'autopilot_followup_sent', 'email', {
    messageId, providerMessageId: result.providerMessageId, threadId: result.threadId, touchCount: newTouchCount
  });
  return messageId;
}

export async function processOutbound(env, config) {
  const sendGate = canAutonomouslySend(config);
  const windowOpen = withinSendWindow(config);
  const prospects = await listProspects(env, { limit: 250, eligibleOnly: true });
  let drafted = 0;
  let sentInitial = 0;
  let sentFollowups = 0;
  let skipped = 0;
  const initialUsed = await todayEventCount(env, 'autopilot_initial_sent');
  const followupUsed = await todayEventCount(env, 'autopilot_followup_sent');

  const initialCandidates = prospects.filter(p => !p.last_contacted_at && !Number(p.campaign_active || 0));
  for (const p of initialCandidates) {
    const eligibility = prospectEligible(config, p);
    if (!eligibility.ok) { skipped++; continue; }
    const draft = await draftInitial(env, p);
    const body = appendComplianceFooter(draft.body, config);
    if (config.mode === 'shadow') {
      await storeDraft(env, p.id, draft.subject, body, { purpose: 'initial', aiResponseId: draft.responseId || null });
      await event(env, p.id, 'autopilot_shadow_draft', 'email', { purpose: 'initial' });
      drafted++;
      continue;
    }
    if (!sendGate.ok || !windowOpen || initialUsed + sentInitial >= config.dailyInitialEmailLimit) break;
    await sendDraft(env, config, p, draft, 'initial');
    sentInitial++;
  }

  const due = prospects.filter(p => Number(p.campaign_active || 0) && p.next_action_at && String(p.next_action_at) <= nowIso());
  for (const p of due) {
    const eligibility = prospectEligible(config, p);
    if (!eligibility.ok) { skipped++; continue; }
    if (Number(p.touch_count || 0) >= config.maxColdTouches) {
      await env.DB.prepare("UPDATE prospects SET campaign_active=0,next_action_at=NULL,status='Nurture' WHERE id=?").bind(p.id).run();
      continue;
    }
    const draft = await draftFollowup(env, p);
    const body = appendComplianceFooter(draft.body, config);
    if (config.mode === 'shadow') {
      await storeDraft(env, p.id, draft.subject, body, { purpose: `followup-${Number(p.touch_count || 0) + 1}`, aiResponseId: draft.responseId || null });
      drafted++;
      continue;
    }
    if (!sendGate.ok || !windowOpen || followupUsed + sentFollowups >= config.dailyFollowupEmailLimit) break;
    await sendDraft(env, config, p, draft, `followup-${Number(p.touch_count || 0) + 1}`);
    sentFollowups++;
  }

  return { drafted, sentInitial, sentFollowups, skipped, sendGate: sendGate.reason || 'ready', windowOpen };
}

async function createEscalation(env, contactId, messageId, classification) {
  const existing = await env.DB.prepare("SELECT id FROM escalations WHERE message_id=? AND status='open' LIMIT 1").bind(messageId).first();
  if (existing?.id) return existing.id;
  const id = crypto.randomUUID();
  const high = ['availability_request','rate_request','offer_or_hold'].includes(classification.category);
  await env.DB.prepare(`
    INSERT INTO escalations (id,contact_id,message_id,category,priority,summary,proposed_action,metadata_json)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    id, contactId || null, messageId || null, classification.category, high ? 'high' : 'normal',
    classification.summary || 'Booking reply needs review.', classification.recommendedAction || '', JSON.stringify(classification)
  ).run();
  await event(env, contactId, 'autopilot_escalation_created', 'email', { escalationId: id, category: classification.category });
  return id;
}

async function updateInboundClassification(env, message, classification, status = 'classified') {
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
    await env.DB.prepare("UPDATE prospects SET status='Invalid Email',automation_safe='NO',campaign_active=0,next_action_at=NULL WHERE id=?").bind(id).run();
    await mirrorOverride(env, id, { Status: 'Research', 'Next Follow-up': null });
    return;
  }
  if (category === 'out_of_office') {
    await env.DB.prepare("UPDATE prospects SET status='Contacted',campaign_active=1,next_action_at=? WHERE id=?")
      .bind(daysFromNow(7), id).run();
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
    await createEscalation(env, id, message.id, { ...classification, summary: classification.summary || 'Contact redirected Rick to an official submission route.' });
    return;
  }
  await env.DB.prepare("UPDATE prospects SET status='Replied',campaign_active=0,next_action_at=NULL WHERE id=?").bind(id).run();
  await mirrorOverride(env, id, { Status: 'Replied', 'Next Follow-up': null });
}

async function sendAutoReply(env, config, message, classification) {
  const p = await getProspect(env, message.contact_id);
  if (!p) return null;
  const profile = p.profile || p.campaign_type || 'room';
  const draft = await draftBookingReply(env, {
    classification,
    inbound: { from: message.sender, subject: message.subject, body: message.body },
    artistContext: artistContext(profile),
    assets: assetText(profile),
    priorMessages: await priorThread(env, p.id)
  });
  const body = appendComplianceFooter(draft.data.body, config);
  const sent = await replyMicrosoftEmail(env, {
    approved: true,
    sourceMessageId: message.provider_message_id,
    body
  });
  const outId = await storeOutbound(env, {
    contactId: p.id,
    sender: sent.sender,
    recipient: sent.recipient || message.sender,
    subject: draft.data.subject || `Re: ${message.subject || 'Booking'}`,
    body,
    providerMessageId: sent.providerMessageId,
    threadId: sent.threadId || message.thread_id,
    internetMessageId: sent.internetMessageId,
    metadata: { purpose: 'auto-reply', replyingTo: message.id, replyCategory: classification.category, aiResponseId: draft.responseId || null }
  });
  await event(env, p.id, 'autopilot_reply_sent', 'email', { messageId: outId, replyingTo: message.id, category: classification.category });
  return outId;
}

export async function processInboundReplies(env, config) {
  const rows = await env.DB.prepare(`
    SELECT * FROM messages WHERE direction='inbound' AND channel='email' AND status IN ('received','classified')
    ORDER BY received_at ASC, created_at ASC LIMIT 30
  `).all();
  let classified = 0;
  let autoReplied = 0;
  let escalated = 0;
  let stopped = 0;
  const replyUsed = await todayEventCount(env, 'autopilot_reply_sent');
  const gate = canAutonomouslySend(config);
  const windowOpen = withinSendWindow(config);

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
      classification = result.data;
      classification.aiResponseId = result.responseId || null;
      await updateInboundClassification(env, message, classification, 'classified');
      await applyClassification(env, message, classification);
      classified++;
    }

    const policy = categoryPolicy(classification.category);
    if (classification.mustEscalate || policy.escalate) {
      await createEscalation(env, message.contact_id, message.id, classification);
      escalated++;
    }

    if (policy.noReply || ['not_interested','out_of_office'].includes(classification.category)) {
      await updateInboundClassification(env, { ...message, metadata_json: JSON.stringify({ ...metadata, classification }) }, classification, 'processed');
      stopped++;
      continue;
    }

    const mayAutoReply = config.allowAutoRoutineReplies && classification.autoReplyAllowed !== false && (policy.autoReply || classification.mustEscalate);
    if (config.mode === 'shadow') {
      if (mayAutoReply) {
        const p = message.contact_id ? await getProspect(env, message.contact_id) : null;
        if (p) {
          const profile = p.profile || p.campaign_type || 'room';
          const draft = await draftBookingReply(env, {
            classification,
            inbound: { from: message.sender, subject: message.subject, body: message.body },
            artistContext: artistContext(profile),
            assets: assetText(profile),
            priorMessages: await priorThread(env, p.id)
          });
          await storeDraft(env, p.id, draft.data.subject || `Re: ${message.subject || 'Booking'}`, appendComplianceFooter(draft.data.body, config), {
            purpose: 'shadow-reply', replyingTo: message.id, replyCategory: classification.category, aiResponseId: draft.responseId || null
          });
        }
      }
      await updateInboundClassification(env, { ...message, metadata_json: JSON.stringify({ ...metadata, classification }) }, classification, 'processed');
      continue;
    }

    if (mayAutoReply && gate.ok && windowOpen && replyUsed + autoReplied < config.dailyAutoReplyLimit && message.provider_message_id) {
      await sendAutoReply(env, config, message, classification);
      autoReplied++;
      await updateInboundClassification(env, { ...message, metadata_json: JSON.stringify({ ...metadata, classification }) }, classification, 'processed');
    }
  }
  return { classified, autoReplied, escalated, stopped, sendGate: gate.reason || 'ready', windowOpen };
}

export async function runAutopilot(env, { forceResearch = false } = {}) {
  if (!env.DB) return { ok: false, skipped: true, reason: 'DB not configured.' };
  const config = await getAutopilotConfig(env);
  if (config.mode === 'off') return { ok: true, skipped: true, mode: config.mode };
  const ai = openaiStatus(env);
  if (!ai.configured) return { ok: false, skipped: true, mode: config.mode, reason: 'OpenAI is not configured.' };

  const runId = await startRun(env, 'autopilot-cycle', config.mode);
  try {
    let research = null;
    const latestResearch = await lastCompletedRun(env, 'research');
    if (forceResearch || !latestResearch || !sameLocalDay(latestResearch.started_at, config.timezone)) {
      research = await runResearch(env, config);
    }
    const inbound = await processInboundReplies(env, config);
    const outbound = microsoftStatus(env).configured || config.mode === 'shadow'
      ? await processOutbound(env, config)
      : { skipped: true, reason: 'Microsoft email is not configured.' };
    const summary = { mode: config.mode, research, inbound, outbound };
    await finishRun(env, runId, summary);
    return { ok: true, ...summary };
  } catch (error) {
    await finishRun(env, runId, {}, String(error?.message || error));
    throw error;
  }
}

export async function autopilotStatus(env) {
  const config = await getAutopilotConfig(env);
  const sendGate = canAutonomouslySend(config);
  const [prospects, openEscalations, latest] = await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(*) total,
      SUM(CASE WHEN automation_safe='YES_TARGETED' AND suppressed=0 AND current_venue=0 THEN 1 ELSE 0 END) verified,
      SUM(CASE WHEN status='Replied' THEN 1 ELSE 0 END) replied,
      SUM(CASE WHEN status='Contacted' THEN 1 ELSE 0 END) contacted
      FROM prospects`).first(),
    env.DB.prepare("SELECT COUNT(*) n FROM escalations WHERE status='open'").first(),
    env.DB.prepare("SELECT * FROM autopilot_runs WHERE run_type='autopilot-cycle' ORDER BY started_at DESC LIMIT 1").first()
  ]);
  return {
    config,
    readiness: {
      canSend: sendGate.ok,
      sendBlocker: sendGate.ok ? '' : sendGate.reason,
      microsoft: microsoftStatus(env),
      openai: openaiStatus(env),
      sendWindowOpen: withinSendWindow(config)
    },
    counts: {
      prospects: Number(prospects?.total || 0),
      verified: Number(prospects?.verified || 0),
      contacted: Number(prospects?.contacted || 0),
      replied: Number(prospects?.replied || 0),
      needsRick: Number(openEscalations?.n || 0)
    },
    latestRun: latest ? {
      status: latest.status,
      startedAt: latest.started_at,
      finishedAt: latest.finished_at,
      summary: safeJson(latest.summary_json, null),
      error: latest.error_text || ''
    } : null
  };
}

export async function listEscalations(env, limit = 50) {
  const result = await env.DB.prepare(`
    SELECT e.*,p.entity,p.room,p.contact_name,p.contact_role,p.email
    FROM escalations e LEFT JOIN prospects p ON p.id=e.contact_id
    WHERE e.status='open' ORDER BY CASE WHEN e.priority='high' THEN 0 ELSE 1 END, e.created_at DESC LIMIT ?
  `).bind(Math.max(1, Math.min(200, Number(limit) || 50))).all();
  return (result.results || []).map(row => ({ ...row, metadata: safeJson(row.metadata_json, {}) }));
}

export async function resolveEscalation(env, id, resolution = '') {
  await env.DB.prepare("UPDATE escalations SET status='resolved',resolved_at=CURRENT_TIMESTAMP,metadata_json=json_set(COALESCE(metadata_json,'{}'),'$.resolution',?) WHERE id=?")
    .bind(String(resolution || '').slice(0, 2000), id).run();
  return { ok: true };
}
