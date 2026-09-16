import { upsertResearchedProspect, matchesKnownCurrentVenue, dedupeKey } from './prospects.js';

export async function stageDiscoveredProspect(env, item = {}, trustedSources = []) {
  if (await matchesKnownCurrentVenue(env, item)) return null;

  const key = dedupeKey({
    entity: item.entity,
    room: item.room,
    contactName: item.contactName,
    email: item.email
  });
  const existing = await env.DB.prepare(
    'SELECT id FROM prospects WHERE dedupe_key=? LIMIT 1'
  ).bind(key).first();
  if (existing?.id) return null;

  const staged = {
    ...item,
    automationSafe: 'MANUAL',
    sourceUrls: trustedSources.length ? trustedSources : (Array.isArray(item.sourceUrls) ? item.sourceUrls : [])
  };
  const id = await upsertResearchedProspect(env, staged);
  if (!id) return null;
  await env.DB.prepare(`
    UPDATE prospects SET
      status='discovered',
      automation_safe='MANUAL',
      verified_at=NULL,
      campaign_active=0,
      next_action_at=NULL
    WHERE id=?
  `).bind(id).run();
  return id;
}

export function trustedSourceList(itemSources = [], toolSources = []) {
  const actual = new Set((toolSources || []).filter(Boolean));
  const claimed = (itemSources || []).filter(url => actual.has(url));
  if (claimed.length) return claimed.slice(0, 8);
  return [...actual].slice(0, 8);
}
