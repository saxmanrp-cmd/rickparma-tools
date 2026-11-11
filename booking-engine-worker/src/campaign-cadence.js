import { localParts, withinSendWindow } from './autopilot-policy.js';

// Reply checks can run frequently. New prospect research and campaign outreach
// share one durable, atomic claim per local day, including manual Run requests.
export async function claimDailyCampaign(env, config, now = new Date()) {
  const day = localParts(now, config.timezone).dateKey;
  if (!withinSendWindow(config, now)) return { claimed: false, day, reason: 'Outside the existing campaign send window.' };
  const provider = `booking-campaign-day:${day}`;
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO sync_state(provider,cursor,metadata_json)
    VALUES (?,'claimed',?)
  `).bind(provider, JSON.stringify({ startedAt: now.toISOString(), timezone: config.timezone, cadence: 'daily' })).run();
  return { claimed: Number(result?.meta?.changes || 0) === 1, day, provider,
    reason: Number(result?.meta?.changes || 0) === 1 ? '' : 'Campaign already ran or was attempted today.' };
}

export async function finishDailyCampaign(env, slot, summary, error = '') {
  if (!slot?.claimed) return;
  // Retain failed attempts too: never restart a partially sent batch automatically.
  await env.DB.prepare(`UPDATE sync_state SET cursor=?,metadata_json=json_set(COALESCE(metadata_json,'{}'),
    '$.finishedAt',?,'$.summary',json(?),'$.error',?),updated_at=CURRENT_TIMESTAMP WHERE provider=?`)
    .bind(error ? 'failed' : 'completed', new Date().toISOString(), JSON.stringify(summary || {}), String(error).slice(0, 1000), slot.provider).run();
}
