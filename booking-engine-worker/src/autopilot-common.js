import { ARTIST_PROFILE, campaignAssets, compactCredentials } from './artist-profile.js';

export function nowIso() { return new Date().toISOString(); }
export function daysFromNow(days) { return new Date(Date.now() + Number(days || 0) * 86400000).toISOString(); }
export function safeJson(value, fallback = {}) { try { return JSON.parse(value || ''); } catch { return fallback; } }

export async function event(env, contactId, eventType, channel = null, payload = null) {
  await env.DB.prepare(`INSERT INTO crm_events (contact_id,event_type,channel,payload_json) VALUES (?,?,?,?)`)
    .bind(contactId || null, eventType, channel, payload == null ? null : JSON.stringify(payload)).run();
}

export async function startRun(env, runType, mode) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO autopilot_runs (id,run_type,mode,status) VALUES (?,?,?,'running')`)
    .bind(id, runType, mode).run();
  return id;
}

export async function finishRun(env, id, summary = {}, error = '') {
  await env.DB.prepare(`UPDATE autopilot_runs SET status=?,summary_json=?,error_text=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(error ? 'failed' : 'completed', JSON.stringify(summary || {}), error || null, id).run();
}

export async function lastCompletedRun(env, runType) {
  return env.DB.prepare(`SELECT * FROM autopilot_runs WHERE run_type=? AND status='completed' ORDER BY started_at DESC LIMIT 1`)
    .bind(runType).first();
}

export function prospectForPrompt(p) {
  return {
    id: p.id,
    entity: p.entity,
    room: p.room || '',
    category: p.category || '',
    profile: p.profile || p.campaign_type || 'room',
    contactName: p.contact_name || '',
    contactRole: p.contact_role || '',
    email: p.email || '',
    phone: p.phone || '',
    website: p.website_url || '',
    bookingUrl: p.booking_url || '',
    fitReason: p.fit_reason || '',
    evidenceSummary: p.evidence_summary || ''
  };
}

export function artistContext(profile = 'room') {
  return [
    `${ARTIST_PROFILE.name} — ${ARTIST_PROFILE.positioning.join('; ')}.`,
    `Formats: ${ARTIST_PROFILE.formats.join(', ')}.`,
    `Music: ${ARTIST_PROFILE.styles.join(', ')}.`,
    compactCredentials(profile),
    `Website: ${ARTIST_PROFILE.website}`,
    `Calendar: ${ARTIST_PROFILE.calendar}`,
    `Instagram: ${ARTIST_PROFILE.instagram}`
  ].join('\n');
}

export function assetText(profile = 'room') {
  return campaignAssets(profile).map(x => `${x.label}: ${x.url}`).join('\n');
}

export async function priorThread(env, contactId, limit = 8) {
  const result = await env.DB.prepare(`
    SELECT direction,subject,body,created_at FROM messages WHERE contact_id=? ORDER BY created_at DESC LIMIT ?
  `).bind(contactId, limit).all();
  return (result.results || [])
    .reverse()
    .map(m => `${String(m.direction || '').toUpperCase()} ${m.subject || ''}\n${m.body || ''}`)
    .join('\n\n---\n\n')
    .slice(0, 14000);
}

export async function todayEventCount(env, eventType) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM crm_events WHERE event_type=? AND date(created_at)=date('now')`)
    .bind(eventType).first();
  return Number(row?.n || 0);
}

export async function storeOutbound(env, {
  contactId, sender, recipient, subject = '', body = '', providerMessageId = null,
  threadId = null, internetMessageId = null, status = 'sent', metadata = {}
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

export async function storeDraft(env, contactId, subject, body, metadata = {}) {
  const purpose = metadata.purpose || 'initial';
  const existing = await env.DB.prepare(`
    SELECT id FROM messages
    WHERE contact_id=? AND direction='outbound' AND channel='email' AND status='draft'
      AND json_extract(metadata_json,'$.purpose')=?
    ORDER BY created_at DESC LIMIT 1
  `).bind(contactId, purpose).first();
  if (existing?.id) {
    await env.DB.prepare('UPDATE messages SET subject=?,body=?,metadata_json=? WHERE id=?')
      .bind(subject, body, JSON.stringify(metadata), existing.id).run();
    return { id: existing.id, created: false };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO messages (id,contact_id,direction,channel,provider,sender,recipient,subject,body,status,metadata_json)
    VALUES (?,?,'outbound','email','shadow',?,?,?,?, 'draft', ?)
  `).bind(id, contactId, ARTIST_PROFILE.bookingEmail, null, subject, body, JSON.stringify(metadata)).run();
  return { id, created: true };
}

export async function mirrorOverride(env, contactId, patch) {
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
