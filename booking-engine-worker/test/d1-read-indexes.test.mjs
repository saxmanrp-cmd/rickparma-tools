import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ensureD1ReadIndexes, READ_INDEXES, READ_INDEX_MARKER, isD1DailyLimit } from '../src/d1-read-indexes.js';
import { recipientHasActiveOutreachHold } from '../src/outreach-hold.js';
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
function fixture({ oldSchema = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(oldSchema ? schema.split('-- Read optimizations')[0] : schema);
  const calls = { batches: 0, first: 0, fail: false, sql: '' };
  const DB = { prepare(sql) {
    let params = [];
    return { sql, get params() { return params; }, bind(...v) { params = v; return this; }, async first() {
      calls.first++; calls.sql = sql;
      return db.prepare(sql).get(...params) || null;
    }};
  }, async batch(statements) {
    calls.batches++; db.exec('BEGIN');
    try {
      for (const statement of statements) { db.prepare(statement.sql).run(...statement.params); if (calls.fail) throw new Error('migration interrupted'); }
      db.exec('COMMIT'); return statements.map(() => ({ success: true }));
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }};
  return { db, env: { DB }, calls };
}
test('real cross-recipient hold check changes from a full scan to indexed searches', async () => {
  const { db, env, calls } = fixture({ oldSchema: true });
  const insert = db.prepare('INSERT INTO prospects(id,dedupe_key,entity,email,metadata_json) VALUES(?,?,?,?,?)');
  db.exec('BEGIN');
  for (let i = 0; i < 20000; i++) insert.run('p'+i, 'k'+i, 'Test venue', 'buyer'+i+'@example.test', '{}');
  insert.run('held', 'held-key', 'Held venue', 'Owner@Example.test', JSON.stringify({ outreachHold: { until: '2027-01-08T00:00:00Z' } }));
  db.exec('COMMIT');
  const prospect = { id: 'p0', email: 'owner@example.test' };
  const at = new Date('2026-11-11T00:00:00Z');
  assert.equal(await recipientHasActiveOutreachHold(env, prospect, at), true);
  const query = calls.sql;
  const params = [prospect.id, prospect.email, prospect.email, at.toISOString()];
  const plan = () => db.prepare('EXPLAIN QUERY PLAN '+query).all(...params).map(row => row.detail).join('\n');
  assert.match(plan(), /SCAN prospects/);
  await ensureD1ReadIndexes(env);
  assert.doesNotMatch(plan(), /SCAN prospects/);
  assert.match(plan(), /idx_prospects_email_lower/);
  assert.equal(await recipientHasActiveOutreachHold(env, prospect, at), true);
  assert.equal(await recipientHasActiveOutreachHold(env, prospect, new Date('2027-01-08T00:00:00Z')), false);
  assert.equal(await recipientHasActiveOutreachHold(env, { id: 'p0', email: '' }, at), false);
  db.close();
});
test('migration is atomic, retries after failure, and deduplicates concurrent calls', async () => {
  const { db, env, calls } = fixture({ oldSchema: true });
  calls.fail = true;
  await assert.rejects(ensureD1ReadIndexes(env), /interrupted/);
  assert.equal(db.prepare('SELECT cursor FROM sync_state WHERE provider=?').get(READ_INDEX_MARKER), undefined);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='idx_prospects_email_lower'").get(), undefined);
  calls.fail = false;
  await Promise.all([ensureD1ReadIndexes(env), ensureD1ReadIndexes(env)]);
  assert.equal(calls.batches, 2);
  assert.equal(db.prepare('SELECT cursor FROM sync_state WHERE provider=?').get(READ_INDEX_MARKER).cursor, 'applied');
  await ensureD1ReadIndexes(env);
  assert.equal(calls.batches, 2);
  // A fresh isolate consults the persisted marker and does not recreate indexes.
  await ensureD1ReadIndexes({ DB: { ...env.DB } });
  assert.equal(calls.batches, 2);
  db.close();
});
test('an account quota block leaves the migration retryable after reset', async () => {
  let blocked = true, batches = 0;
  const env = { DB: { prepare() { return { bind() { return this; }, async first() {
    if (blocked) throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");
    return null;
  }}; }, async batch() { batches++; } } };
  await assert.rejects(ensureD1ReadIndexes(env), isD1DailyLimit);
  assert.equal(batches, 0);
  blocked = false;
  assert.equal((await ensureD1ReadIndexes(env)).ready, true);
  assert.equal(batches, 1);
  assert.equal(isD1DailyLimit(new Error('authentication failed')), false);
});
test('new databases include the same indexes as existing database migrations', () => {
  const { db } = fixture();
  for (const sql of READ_INDEXES) {
    const name = sql.match(/EXISTS (\w+)/)[1];
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(name));
  }
  db.close();
});
