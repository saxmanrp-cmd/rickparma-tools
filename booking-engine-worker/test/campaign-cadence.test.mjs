import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { claimDailyCampaign, finishDailyCampaign } from '../src/campaign-cadence.js';
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { DB: { prepare(sql) { let params = []; return { bind(...v) { params = v; return this; }, async run() {
    return { meta: { changes: Number(db.prepare(sql).run(...params).changes) } };
  } }; } } };
  return { db, env };
}
const config = { timezone: 'America/Los_Angeles', sendWindowStartHour: 9, sendWindowEndHour: 16, sendWeekdaysOnly: true };
test('concurrent scheduled or manual attempts can claim only one campaign per local day', async () => {
  const { db, env } = fixture();
  const at = new Date('2026-11-11T17:00:00Z');
  const results = await Promise.all(Array.from({ length: 6 }, () => claimDailyCampaign(env, config, at)));
  assert.equal(results.filter(r => r.claimed).length, 1);
  await finishDailyCampaign(env, results.find(r => r.claimed), { cadence: 'daily' });
  assert.equal((await claimDailyCampaign({ DB: { ...env.DB } }, config, new Date('2026-11-11T23:00:00Z'))).claimed, false);
  assert.equal((await claimDailyCampaign(env, config, new Date('2026-11-12T17:00:00Z'))).claimed, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sync_state WHERE provider LIKE 'booking-campaign-day:%'").get().n, 2);
  db.close();
});
test('checks outside the send window or on excluded weekends do not consume the daily slot', async () => {
  const { db, env } = fixture();
  for (const at of ['2026-11-11T16:59:00Z', '2026-11-11T00:00:00Z', '2026-11-14T17:00:00Z']) {
    assert.equal((await claimDailyCampaign(env, config, new Date(at))).claimed, false);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_state').get().n, 0);
  assert.equal((await claimDailyCampaign(env, config, new Date('2026-11-11T17:00:00Z'))).claimed, true);
  db.close();
});
test('failed batches retain their claim instead of retrying partial outreach', async () => {
  const { db, env } = fixture();
  const at = new Date('2026-11-11T17:00:00Z');
  const slot = await claimDailyCampaign(env, config, at);
  await finishDailyCampaign(env, slot, {}, 'Research provider temporarily unavailable');
  assert.equal(db.prepare('SELECT cursor FROM sync_state WHERE provider=?').get(slot.provider).cursor, 'failed');
  assert.equal((await claimDailyCampaign(env, config, new Date('2026-11-11T21:00:00Z'))).claimed, false);
  db.close();
});
test('daily keys follow Pacific calendar dates and daylight saving time', async () => {
  const { db, env } = fixture();
  const allDay = { ...config, sendWindowStartHour: 0, sendWindowEndHour: 24, sendWeekdaysOnly: false };
  assert.equal((await claimDailyCampaign(env, allDay, new Date('2026-11-12T07:59:00Z'))).day, '2026-11-11');
  assert.equal((await claimDailyCampaign(env, allDay, new Date('2026-11-12T08:00:00Z'))).day, '2026-11-12');
  assert.equal((await claimDailyCampaign(env, config, new Date('2027-07-12T16:00:00Z'))).claimed, true);
  db.close();
});
