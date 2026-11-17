import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vendorDraft, vendorPersonalization, isVendorProspect } from '../src/vendor-campaign.js';
import { appendComplianceFooter, normalizeAutopilotConfig } from '../src/autopilot-policy.js';
import { processOutboundCycle } from '../src/autopilot-outbound.js';

test('approved company-first copy and idempotent owner signature', () => {
  const config = normalizeAutopilotConfig({ businessPostalAddress: 'Test business address' });
  for (const followup of [false,true]) {
    const draft = vendorDraft({ followup, prospect: { entity: 'Test Venue' } });
    assert.match(draft.body, /Parma Entertainment Group, LLC/);
    assert.doesNotMatch(draft.body, /Rick Parma|I.m reaching out|I.m Rick/);
    assert.match(draft.body, /weddings, corporate functions, holiday parties, and private events/);
    const body = appendComplianceFooter(draft.body, config);
    assert.match(body, /Rick Parma\nOwner\nParma Entertainment Group, LLC/);
    assert.equal(appendComplianceFooter(body, config), body);
  }
  assert.equal(normalizeAutopilotConfig().vendorCampaignEnabled, false);
  assert.equal(isVendorProspect({ profile: 'dj' }), false);
});

test('all saved prospects have distinct organization-specific company-first messages', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('../campaigns/peg-vendor-2026-11-09.json', import.meta.url)));
  assert.equal(rows.length, 74);
  assert.equal(new Set(rows.map(row => row['Approved venue sentence'])).size, rows.length);
  for (const row of rows) {
    const sentence = row['Approved venue sentence'];
    assert.ok(sentence && sentence.includes(row.Organization));
    const prospect = { entity: row.Organization, contact_name: row['Named contact'], metadata_json: JSON.stringify({ vendorSentence: sentence }) };
    for (const followup of [false, true]) {
      const draft = vendorDraft({ followup, prospect });
      assert.ok(draft.body.includes(sentence));
      assert.match(draft.body.split('\n\n')[1], /^Parma Entertainment Group, LLC provides/);
      assert.doesNotMatch(draft.body, /Rick Parma|I.m reaching out|I.m Rick/);
    }
    assert.equal(vendorPersonalization(prospect), sentence);
  }
  assert.throws(() => vendorDraft(), /identified organization/);
  assert.match(vendorDraft({ prospect: { entity: 'New Venue', metadata_json: 'invalid' } }).body, /For New Venue,/);
});

test('vendor cycle excludes ordinary DJ leads and blocked duplicate recipients', async () => {
  const env = { DB: { prepare(sql) {
    const result = {
      bind() { return result; },
      async all() { return { results: [{ id: 'v', profile: 'vendor', email: 'events@example.com' }, { id: 'dj', profile: 'dj' }] }; },
      async first() { return sql.includes('SELECT COUNT') ? { n: 0 } : sql.includes('lower(email)=lower') ? { id: 'suppressed-duplicate' } : null; }
    };
    return result;
  } } };
  const summary = await processOutboundCycle(env, normalizeAutopilotConfig({ mode: 'live' }), { vendorOnly: true });
  assert.equal(summary.sentInitial, 0);
  assert.equal(summary.skipped, 1);
});
