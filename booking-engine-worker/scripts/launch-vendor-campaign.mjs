import fs from 'node:fs';
import { dedupeKey, matchesKnownCurrentVenue } from '../src/prospects.js';
import { normalizeAutopilotConfig } from '../src/autopilot-policy.js';

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare deployment credentials are missing.');
const root = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(path, init = {}) {
  const response = await fetch(root + path, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare operation failed (${response.status}): ${JSON.stringify(data.errors || [])}`);
  return data.result;
}
const database = '281733ac-976d-4254-bc0e-df0e6eec3b88';
async function query(sql, params = []) {
  const result = await api(`/d1/database/${database}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) });
  if (!result[0]?.success) throw new Error('Database operation failed.');
  return result[0];
}
const env = { DB: { prepare(sql) {
  let params = [];
  const statement = {
    bind(...values) { params = values; return statement; },
    all() { return query(sql, params); },
    async first() { return (await query(sql, params)).results[0] || null; },
    run() { return query(sql, params); }
  };
  return statement;
} } };

const marker = 'peg-vendor-launch-2026-11-09';
const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const prior = await env.DB.prepare('SELECT cursor FROM sync_state WHERE provider=?').bind(marker).first();
if (prior?.cursor === 'activated') {
  console.log(JSON.stringify({ status: 'already-activated' }));
  process.exit(0);
}
const rows = JSON.parse(fs.readFileSync(new URL('../campaigns/peg-vendor-2026-11-09.json', import.meta.url)));
const existing = (await query('SELECT id,entity,email,phone,dedupe_key,status,suppressed,current_venue FROM prospects')).results;
let staged = 0, existingOrHeld = 0;
for (const row of rows) {
  const entity = row.Organization;
  const email = row['Public email'].trim().toLowerCase();
  if (row.Priority === 'HOLD' || /ahern|gold spike/i.test(entity)
      || existing.some(p => norm(p.entity) === norm(entity) || (email && p.email?.toLowerCase() === email))
      || await matchesKnownCurrentVenue(env, { entity })) {
    existingOrHeld++;
    continue;
  }
  // Shared Aquarius / Edgewater catering is one buyer relationship.
  if (entity === 'Aquarius Casino Resort') { existingOrHeld++; continue; }
  const id = `PEG-VENDOR-${String(row.index).padStart(3, '0')}`;
  const key = dedupeKey({ entity, email });
  const notes = `${row['Qualification / routing notes']}${entity === 'Edgewater Casino Resort' ? '; shared Aquarius/Edgewater buyer: one conversation for both properties' : ''}`;
  await query(`INSERT OR IGNORE INTO prospects
    (id,dedupe_key,entity,category,profile,contact_name,contact_role,email,phone,website_url,contact_route,
     fit_score,confidence,automation_safe,fit_reason,evidence_summary,source_urls_json,status,campaign_type,metadata_json)
    VALUES (?,?,?,?,'vendor',?,?,?,?,?,?,85,0,'MANUAL',?,?,?,'discovered','vendor',?)`,
    [id,key,entity,row.Category,row['Named contact'],row['Buyer role'],email,row['Public phone'],row['Source URL'],email ? 'email' : 'unknown',
      `Preferred entertainment vendor for weddings, corporate and private events in ${row.Area}`,notes,JSON.stringify([row['Source URL']]),
      JSON.stringify({ campaign: marker, priority: row.Priority, sourceDate: '2026-11-09', vendorSentence: row['Approved venue sentence'] })]);
  existing.push({ id, entity, email });
  staged++;
}

const configRow = await env.DB.prepare("SELECT config_json FROM autopilot_config WHERE id='default'").first();
const config = normalizeAutopilotConfig(JSON.parse(configRow?.config_json || '{}'));
const verification = await env.DB.prepare("SELECT cursor FROM sync_state WHERE provider='microsoft-new-outbound-verification'").first();
const secrets = await api('/workers/scripts/rick-booking-engine/secrets');
const keys = new Set(secrets.map(s => s.name));
const credentialsPresent = ['MS_NEW_OUTBOUND_CLIENT_ID', 'MS_NEW_OUTBOUND_CLIENT_SECRET', 'OPENAI_API_KEY'].every(k => keys.has(k));
const blockers = [];
if (verification?.cursor !== 'verified') blockers.push('New Microsoft 365 mailbox verification has not passed.');
if (!credentialsPresent) blockers.push('Required Microsoft/OpenAI credentials are missing.');
if (config.requirePhysicalPostalAddress && !config.businessPostalAddress) blockers.push('Existing business postal address is missing.');
if (blockers.length) {
  console.log(JSON.stringify({ status: 'staged-not-activated', staged, existingOrHeld, blockers }));
  process.exitCode = 1;
} else {
  // Preserve the mode and limits of every other campaign. Only the vendor lane goes live.
  config.vendorCampaignEnabled = true;
  await query("INSERT INTO autopilot_config(id,config_json) VALUES ('default',?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json,updated_at=CURRENT_TIMESTAMP", [JSON.stringify(config)]);
  await query("INSERT INTO sync_state(provider,cursor,metadata_json) VALUES (?,'activated',?) ON CONFLICT(provider) DO UPDATE SET cursor='activated',metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP",
    [marker, JSON.stringify({ staged, existingOrHeld, authorizedAt: '2026-11-09', template: 'company-first-owner-signature-v1' })]);
  console.log(JSON.stringify({ status: 'activated', staged, existingOrHeld, mailboxVerified: true, priorCampaignMode: config.mode, dailyInitialEmailLimit: config.dailyInitialEmailLimit }));
}
const counts = await query("SELECT status,automation_safe,COUNT(*) AS count FROM prospects WHERE profile='vendor' GROUP BY status,automation_safe");
console.log(JSON.stringify({ vendorProspects: counts.results }));
