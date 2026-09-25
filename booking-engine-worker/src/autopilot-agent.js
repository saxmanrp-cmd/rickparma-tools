import { microsoftStatus } from './providers/microsoft.js';
import { openaiStatus } from './providers/openai.js';
import { getAutopilotConfig, saveAutopilotConfig, canAutonomouslySend, withinSendWindow, localParts } from './autopilot-policy.js';
import { runResearchCycle } from './autopilot-research.js';
import { processOutboundCycle } from './autopilot-outbound.js';
import { processInboundCycle } from './autopilot-replies.js';
import { lastCompletedRun, startRun, finishRun, safeJson } from './autopilot-common.js';

function sameLocalDay(iso, timezone) {
  if (!iso) return false;
  return localParts(new Date(iso), timezone).dateKey === localParts(new Date(), timezone).dateKey;
}

export async function runAutonomousBookingAgent(env, { forceResearch = false } = {}) {
  if (!env.DB) return { ok: false, skipped: true, reason: 'D1 database is not configured.' };
  const config = await getAutopilotConfig(env);
  if (config.mode === 'off') return { ok: true, skipped: true, mode: 'off' };
  if (!openaiStatus(env).configured) {
    return { ok: false, skipped: true, mode: config.mode, reason: 'OpenAI research/automation provider is not configured.' };
  }

  const runId = await startRun(env, 'autopilot-cycle', config.mode);
  try {
    let research = null;
    const latestResearch = await lastCompletedRun(env, 'research');
    const urgentResearch = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM prospects WHERE status='Research Needed' AND suppressed=0 AND current_venue=0 AND verified_at IS NULL"
    ).first();
    if (
      forceResearch
      || Number(urgentResearch?.n || 0) > 0
      || !latestResearch
      || !sameLocalDay(latestResearch.started_at, config.timezone)
    ) {
      research = await runResearchCycle(env, config);
    }

    // A buyer response always gets processed before any new outbound work.
    const inbound = await processInboundCycle(env, config);
    const outbound = await processOutboundCycle(env, config);
    const summary = { mode: config.mode, research, inbound, outbound };
    await finishRun(env, runId, summary);
    return { ok: true, ...summary };
  } catch (error) {
    await finishRun(env, runId, {}, String(error?.message || error));
    throw error;
  }
}

export async function bookingAgentStatus(env) {
  const config = await getAutopilotConfig(env);
  const gate = canAutonomouslySend(config);
  const microsoft = microsoftStatus(env);
  const openai = openaiStatus(env);
  const [prospects, escalations, latest, drafts] = await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(*) total,
      SUM(CASE WHEN automation_safe='YES_TARGETED' AND suppressed=0 AND current_venue=0 THEN 1 ELSE 0 END) verified,
      SUM(CASE WHEN status='Contacted' THEN 1 ELSE 0 END) contacted,
      SUM(CASE WHEN status='Replied' THEN 1 ELSE 0 END) replied,
      SUM(CASE WHEN status='Pass' THEN 1 ELSE 0 END) passed,
      SUM(CASE WHEN status='Submission Needed' THEN 1 ELSE 0 END) submission_needed
      FROM prospects`).first(),
    env.DB.prepare("SELECT COUNT(*) n FROM escalations WHERE status='open'").first(),
    env.DB.prepare("SELECT * FROM autopilot_runs WHERE run_type='autopilot-cycle' ORDER BY started_at DESC LIMIT 1").first(),
    env.DB.prepare("SELECT COUNT(*) n FROM messages WHERE status='draft'").first()
  ]);

  return {
    config,
    readiness: {
      canSend: gate.ok && microsoft.configured && openai.configured,
      sendBlocker: !gate.ok ? gate.reason : !microsoft.configured ? 'Microsoft email is not configured.' : !openai.configured ? 'OpenAI is not configured.' : '',
      sendWindowOpen: withinSendWindow(config),
      microsoft,
      openai
    },
    counts: {
      prospects: Number(prospects?.total || 0),
      verified: Number(prospects?.verified || 0),
      contacted: Number(prospects?.contacted || 0),
      replied: Number(prospects?.replied || 0),
      passed: Number(prospects?.passed || 0),
      submissionNeeded: Number(prospects?.submission_needed || 0),
      shadowDrafts: Number(drafts?.n || 0),
      needsRick: Number(escalations?.n || 0)
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

export async function setBookingAgentConfig(env, input) {
  return saveAutopilotConfig(env, input);
}

export async function listBookingEscalations(env, limit = 50) {
  const result = await env.DB.prepare(`
    SELECT
      e.*,
      p.entity,p.room,p.contact_name,p.contact_role,p.email,p.phone,p.text_ok,
      m.channel AS inbound_channel,m.sender AS inbound_sender,m.subject AS inbound_subject,
      m.body AS inbound_body,m.provider_message_id AS inbound_provider_message_id,m.thread_id AS inbound_thread_id,
      m.received_at AS inbound_received_at
    FROM escalations e
    LEFT JOIN prospects p ON p.id=e.contact_id
    LEFT JOIN messages m ON m.id=e.message_id
    WHERE e.status='open'
    ORDER BY CASE WHEN e.priority='high' THEN 0 ELSE 1 END,e.created_at DESC
    LIMIT ?
  `).bind(Math.max(1, Math.min(200, Number(limit) || 50))).all();
  return (result.results || []).map(row => ({ ...row, metadata: safeJson(row.metadata_json, {}) }));
}

export async function resolveBookingEscalation(env, id, resolution = '') {
  await env.DB.prepare(`
    UPDATE escalations
    SET status='resolved',resolved_at=CURRENT_TIMESTAMP,
        metadata_json=json_set(COALESCE(metadata_json,'{}'),'$.resolution',?)
    WHERE id=?
  `).bind(String(resolution || '').slice(0, 2000), id).run();
  return { ok: true };
}
