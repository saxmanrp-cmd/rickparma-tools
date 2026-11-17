import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { RESEARCH_AREAS, COVERAGE_KEY, nextResearchCoverage, finishResearchCoverage, coverageBrief } from '../src/research-coverage.js';
import { runResearchCycle } from '../src/autopilot-research.js';
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { OPENAI_API_KEY: 'local-test', DB: { prepare(sql) { let params = []; return {
    bind(...v) { params = v; return this; },
    async first() { return db.prepare(sql).get(...params) || null; },
    async all() { return { results: db.prepare(sql).all(...params) }; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...params).changes) } }; }
  }; } } };
  return { db, env };
}
test('coverage starts with M Resort, persists every area across reloads and wraps without gaps', async () => {
  const { db, env } = fixture();
  const visited = [];
  for (let i = 0; i < RESEARCH_AREAS.length; i++) {
    const coverage = await nextResearchCoverage({ DB: { ...env.DB } });
    visited.push(coverage.id);
    if (i === 0) { assert.match(coverageBrief(coverage), /M Bar/); assert.match(coverageBrief(coverage), /AMP’D/); }
    if (i === 1) assert.match(coverageBrief(coverage), /90 NINETY/);
    await finishResearchCoverage(env, coverage, {});
  }
  assert.equal(new Set(visited).size, RESEARCH_AREAS.length);
  const next = await nextResearchCoverage(env);
  assert.equal(next.id, RESEARCH_AREAS[0].id);
  assert.equal(next.pass, RESEARCH_AREAS.length);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_state WHERE provider=?').get(COVERAGE_KEY).n, 1);
  db.close();
});
test('actual research batches use one assigned area, avoid repeated results, and stage new rooms as manual', async () => {
  const { db, env } = fixture();
  const original = globalThis.fetch;
  const inputs = [];
  globalThis.fetch = async (_url, init) => {
    inputs.push(JSON.parse(init.body).input);
    const item = { entity: 'Test Neighborhood Bar', room: 'Small Live Room', email: 'events@example.test', phone: '', profile: 'room', automationSafe: 'YES_TARGETED', fitScore: 90, confidence: .95, sourceUrls: ['https://example.test/live'] };
    return new Response(JSON.stringify({ id: 'test-response', output: [{ type: 'web_search_call', action: { sources: [{ url: 'https://example.test/live' }] } }], output_text: JSON.stringify({ verified: [], discovered: inputs.length === 1 ? [item] : [], researchNotes: 'Remaining buyer email verification required.' }) }));
  };
  try {
    const summary = await runResearchCycle(env, { mode: 'shadow', researchDailyTarget: 20, verifyDailyTarget: 0 });
    assert.equal(inputs.length, 2);
    for (const input of inputs) {
      assert.match(input, /TODAY’S NEIGHBORHOOD DEEP DIVE: South Strip, Enterprise and M Resort/);
      assert.match(input, /SMALL-ROOM SEARCH METHOD/);
      assert.match(input, /Do not search for phone numbers/);
      assert.match(input, /do not substitute reservation, meal-ordering, press or newsletter addresses/);
    }
    assert.match(inputs[1], /Already returned in earlier batches today/);
    assert.match(inputs[1], /Test Neighborhood Bar \/ Small Live Room/);
    assert.equal(summary.discovered, 1);
    assert.equal(summary.coverage.researchedBatches, 2);
    const staged = db.prepare('SELECT automation_safe,campaign_active,verified_at FROM prospects').get();
    assert.equal(staged.automation_safe, 'MANUAL');
    assert.equal(staged.campaign_active, 0);
    assert.equal(staged.verified_at, null);
    assert.equal((await nextResearchCoverage(env)).id, RESEARCH_AREAS[1].id);
  } finally { globalThis.fetch = original; db.close(); }
});
test('failed or zero-work passes do not advance the coverage rotation', async () => {
  const { db, env } = fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('research unavailable'); };
  try {
    await assert.rejects(runResearchCycle(env, { mode: 'shadow', researchDailyTarget: 10, verifyDailyTarget: 0 }), /unavailable/);
    assert.equal((await nextResearchCoverage(env)).pass, 0);
    await runResearchCycle(env, { mode: 'shadow', researchDailyTarget: 0, verifyDailyTarget: 0 });
    assert.equal((await nextResearchCoverage(env)).pass, 0);
  } finally { globalThis.fetch = original; db.close(); }
});
