// Preserve every outreach rule; give SQLite indexes for the predicates it already uses.
export const READ_INDEX_MARKER = 'booking-d1-read-indexes-v1';
export const READ_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_prospects_email_lower ON prospects(lower(email))`,
  `CREATE INDEX IF NOT EXISTS idx_prospects_current_venue ON prospects(current_venue) WHERE current_venue=1`,
  `CREATE INDEX IF NOT EXISTS idx_prospects_performing ON prospects(room_preference) WHERE room_preference='PERFORMING'`,
  `CREATE INDEX IF NOT EXISTS idx_prospects_eligible_order ON prospects(fit_score DESC,confidence DESC,discovered_at DESC) WHERE suppressed=0 AND current_venue=0 AND automation_safe='YES_TARGETED' AND email IS NOT NULL AND email!=''`,
  `CREATE INDEX IF NOT EXISTS idx_messages_outbound_recipient_sender ON messages(lower(recipient),lower(sender),sent_at DESC,created_at DESC) WHERE direction='outbound' AND channel='email'`,
  `CREATE INDEX IF NOT EXISTS idx_messages_inbound_queue ON messages(direction,status,channel,COALESCE(received_at,created_at))`,
  `CREATE INDEX IF NOT EXISTS idx_crm_events_type_day ON crm_events(event_type,date(created_at))`
];

export function isD1DailyLimit(error) {
  return /exceeded[^\n]*(?:daily|free tier)[^\n]*limit|daily[^\n]*limit[^\n]*exceeded/i.test(String(error?.message || error));
}
const pending = new WeakMap();
export async function ensureD1ReadIndexes(env) {
  if (!env.DB) throw new Error('D1 database is not configured.');
  if (pending.has(env.DB)) return pending.get(env.DB);
  const task = (async () => {
    const prior = await env.DB.prepare('SELECT cursor FROM sync_state WHERE provider=?').bind(READ_INDEX_MARKER).first();
    if (prior?.cursor === 'applied') return { applied: false, ready: true };
    // D1 batch is transactional. Mark complete only if every index was created.
    await env.DB.batch([
      ...READ_INDEXES.map(sql => env.DB.prepare(sql)),
      env.DB.prepare("INSERT INTO sync_state(provider,cursor) VALUES (?,'applied') ON CONFLICT(provider) DO UPDATE SET cursor='applied',updated_at=CURRENT_TIMESTAMP").bind(READ_INDEX_MARKER)
    ]);
    console.log('booking-d1-read-indexes', { ready: true, indexes: READ_INDEXES.length });
    return { applied: true, ready: true };
  })();
  pending.set(env.DB, task);
  try { return await task; }
  catch (error) { pending.delete(env.DB); throw error; }
}
