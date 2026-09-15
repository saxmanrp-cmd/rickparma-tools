import { researchBookingProspects } from './providers/openai.js';
import { verificationTargets, upsertResearchedProspect } from './prospects.js';
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
      await upsertResearchedProspect(env, item, item.requestedId);
      verified++;
    }
    for (const item of ai.data.discovered || []) {
      if ((!item.sourceUrls || item.sourceUrls.length === 0) && ai.sources?.length) {
        item.sourceUrls = ai.sources.slice(0, 5);
      }
      await upsertResearchedProspect(env, item);
      discovered++;
    }

    const summary = {
      verified,
      discovered,
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
