import { safeJson, mirrorOverride, event } from './autopilot-common.js';

export const VENDOR_REVIEW_HOLD_DAYS = 60;
export const REVIEW_HOLD_VERSION = 1;
const DAY_MS = 86400000;
const protectedStatuses = new Set(['do not contact','rick handling','pass','booked']);

export function outreachHold(prospect) {
  const metadata = typeof prospect?.metadata_json === 'object' ? prospect.metadata_json : safeJson(prospect?.metadata_json, {});
  return metadata?.outreachHold || null;
}

export function activeOutreachHold(prospect, now = new Date()) {
  const hold = outreachHold(prospect);
  return Number.isFinite(Date.parse(hold?.until)) && Date.parse(hold.until) > Number(now) ? hold : null;
}

export function reviewHoldFor(prospect, message, now = new Date()) {
  const prior = outreachHold(prospect);
  const received = message?.received_at || message?.receivedAt || message?.created_at;
  let at = Date.parse(received || '');
  if (!Number.isFinite(at)) at = Number(now);
  // Reprocessing an old receipt must not move the hold or restart a completed hold.
  if (prior?.kind === 'vendor_review' && Number.isFinite(Date.parse(prior.until)) && (
    prior.sourceMessageId === message?.id || Date.parse(prior.until) > Number(now) || at <= Date.parse(prior.until)
  )) return prior;
  return { version: REVIEW_HOLD_VERSION, kind: 'vendor_review', days: VENDOR_REVIEW_HOLD_DAYS,
    startedAt: new Date(at).toISOString(), until: new Date(at + VENDOR_REVIEW_HOLD_DAYS * DAY_MS).toISOString(),
    sourceMessageId: message?.id || null };
}

export async function recipientHasActiveOutreachHold(env, prospect, now = new Date()) {
  const row = await env.DB.prepare(`SELECT id FROM prospects
    WHERE (id=? OR (NULLIF(?, '') IS NOT NULL AND lower(email)=lower(?)))
      AND datetime(json_extract(COALESCE(metadata_json,'{}'),'$.outreachHold.until'))>datetime(?) LIMIT 1`)
    .bind(prospect.id, prospect.email || '', prospect.email || '', now.toISOString()).first();
  return !!row;
}

export async function applyVendorReviewHold(env, message, now = new Date()) {
  const primary = await env.DB.prepare('SELECT * FROM prospects WHERE id=? LIMIT 1').bind(message.contact_id).first();
  if (!primary) return null;
  const rows = await env.DB.prepare(`SELECT * FROM prospects WHERE id=? OR (NULLIF(?, '') IS NOT NULL AND lower(email)=lower(?))`)
    .bind(primary.id, primary.email || '', primary.email || '').all();
  let hold = reviewHoldFor(primary, message, now);
  for (const row of rows.results || []) {
    const existing = activeOutreachHold(row, now);
    if (existing?.kind === 'vendor_review' && Date.parse(existing.until) > Date.parse(hold.until)) hold = existing;
  }
  for (const row of rows.results || []) {
    if (protectedStatuses.has(String(row.status || '').toLowerCase()) || Number(row.suppressed || 0) || Number(row.current_venue || 0) || ['SKIP','PERFORMING'].includes(row.room_preference)) continue;
    const decision = await env.DB.prepare("SELECT id FROM escalations WHERE contact_id=? AND status='open' AND category NOT IN ('submission_redirect','vendor_review_pending') LIMIT 1").bind(row.id).first();
    const status = decision ? row.status : 'Awaiting Vendor Review';
    const ownsThread = !decision && row.id === primary.id && (!!row.last_contacted_at || Number(row.touch_count || 0) > 0);
    const next = ownsThread ? hold.until : null;
    const active = ownsThread ? 1 : 0;
    if (JSON.stringify(outreachHold(row)) === JSON.stringify(hold) && row.status === status
      && Number(row.campaign_active || 0) === active && (row.next_action_at || null) === next) continue;
    await env.DB.prepare(`UPDATE prospects SET status=?,campaign_active=?,next_action_at=?,
      metadata_json=json_set(COALESCE(metadata_json,'{}'),'$.outreachHold',json(?)) WHERE id=?`)
      .bind(status, active, next, JSON.stringify(hold), row.id).run();
    await mirrorOverride(env, row.id, { Status: status, 'Next Follow-up': next });
    await event(env, row.id, 'autopilot_outreach_hold_set', 'email', { messageId: message.id, until: hold.until, days: VENDOR_REVIEW_HOLD_DAYS });
  }
  return hold;
}
