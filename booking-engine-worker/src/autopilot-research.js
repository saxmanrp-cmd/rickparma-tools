import { researchBookingProspects } from './providers/research.js';
import { verificationTargets, upsertResearchedProspect } from './prospects.js';
import { stageDiscoveredProspect, trustedSourceList } from './prospect-staging.js';
import { startRun, finishRun } from './autopilot-common.js';

export async function runResearchCycle(env, config) {
  const runId = await startRun(env, 'research', config.mode);
  try {
    const targets = await verificationTargets(env, config.verifyDailyTarget);
    const ai = await researchBookingProspects(env, {
      verify: targets.map(x => ({
        id: x.id,
        entity: x.entity,
        room: x.room,
        contactName: x.contact_name,
        contactRole: x.contact_role,
        email: x.email,
        phone: x.phone
      })),
      discoverCount: config.researchDailyTarget
    });

    let verified = 0;
    let discovered = 0;
    for (const item of ai.data.verified || []) {
      if (!item.requestedId) continue;
      item.sourceUrls = trustedSourceList(item.sourceUrls, ai.sources);
      await upsertResearchedProspect(env, item, item.requestedId);
      verified++;
    }

    // New AI discoveries are never immediately send-eligible. They are staged MANUAL
    // with verified_at cleared, which forces a separate research pass before the
    // autonomous sender can consider them.
    for (const item of ai.data.discovered || []) {
      const sources = trustedSourceList(item.sourceUrls, ai.sources);
      const stagedId = await stageDiscoveredProspect(env, item, sources);
      if (stagedId) discovered++;
    }

    const summary = {
      verified,
      discovered,
      stagedForSecondPass: discovered,
      notes: ai.data.researchNotes || '',
      responseId: ai.responseId || null,
      sources: (ai.sources || []).slice(0, 20)
    };
    await finishRun(env, runId, summary);
    return summary;
  } catch (error) {
    await finishRun(env, runId, {}, String(error?.message || error));
    throw error;
  }
}
