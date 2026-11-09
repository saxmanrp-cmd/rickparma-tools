import test from 'node:test';
import assert from 'node:assert/strict';
import { vendorDraft, isVendorProspect } from '../src/vendor-campaign.js';
import { appendComplianceFooter, normalizeAutopilotConfig } from '../src/autopilot-policy.js';
import { processOutboundCycle } from '../src/autopilot-outbound.js';

test('approved company-first copy and idempotent owner signature', () => {
  const config = normalizeAutopilotConfig({ businessPostalAddress: 'Test business address' });
  for (const followup of [false,true]) {
    const draft = vendorDraft({ followup });
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
