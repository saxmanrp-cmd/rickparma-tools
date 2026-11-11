import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { researchBookingProspects } from '../src/providers/research.js';
import { upsertResearchedProspect } from '../src/prospects.js';

test('research asks for email evidence and excludes phone lookup and phone-only routes', async () => {
  const original = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'local-test', output_text: JSON.stringify({ verified: [], discovered: [], researchNotes: '' }) }));
  };
  try {
    await researchBookingProspects({ OPENAI_API_KEY: 'local-test' }, { verify: [{ id: 'p', entity: 'Test venue', email: 'events@example.test', phone: '+15551234567' }], discoverCount: 1 });
    assert.match(payload.input, /EMAIL-ONLY CAMPAIGN/);
    assert.match(payload.input, /Do not search for phone numbers/);
    assert.doesNotMatch(payload.input, /15551234567/);
    const fields = payload.text.format.schema.properties.verified.items.properties;
    assert.deepEqual(fields.phone.enum, ['']);
    assert.equal(fields.contactRoute.enum.includes('phone'), false);
  } finally { globalThis.fetch = original; }
});

test('email-only research preserves an existing CRM phone number and hold metadata', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const hold = { outreachHold: { until: '2027-01-08T00:00:00Z', version: 1 } };
  db.prepare('INSERT INTO prospects(id,dedupe_key,entity,email,phone,status,metadata_json) VALUES(?,?,?,?,?,?,?)')
    .run('p', 'email:events@example.test', 'Test venue', 'events@example.test', '+15551234567', 'Awaiting Vendor Review', JSON.stringify(hold));
  const env = { DB: { prepare(sql) { let params = []; return { bind(...v) { params = v; return this; }, async first() { return db.prepare(sql).get(...params) || null; }, async run() { return { meta: { changes: Number(db.prepare(sql).run(...params).changes) } }; } }; } } };
  await upsertResearchedProspect(env, { entity: 'Test venue', email: 'events@example.test', phone: '', requestedId: 'p', profile: 'vendor', sourceUrls: [] }, 'p');
  const row = db.prepare('SELECT phone,status,metadata_json FROM prospects WHERE id=?').get('p');
  assert.equal(row.phone, '+15551234567');
  assert.equal(row.status, 'Awaiting Vendor Review');
  assert.deepEqual(JSON.parse(row.metadata_json).outreachHold, hold.outreachHold);
  db.close();
});
