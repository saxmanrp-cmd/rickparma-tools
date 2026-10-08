import { researchBookingProspects } from './providers/research.js';
import { verificationTargets, upsertResearchedProspect } from './prospects.js';
import { stageDiscoveredProspect, trustedSourceList } from './prospect-staging.js';
import { startRun, finishRun } from './autopilot-common.js';

export async function runResearchCycle(env, config) {
  const runId = await startRun(env, 'research', config.mode);
  try {
    const batchSize = 10;
    const targets = await verificationTargets(env, config.verifyDailyTarget);
    const totalBatches = Math.max(
      1,
      Math.ceil(Math.max(0, Number(config.researchDailyTarget || 0)) / batchSize),
      Math.ceil(targets.length / batchSize)
    );

    let verified = 0;
    let discovered = 0;
    const notes = [];
    const responseIds = [];
    const sources = new Set();

    for (let batch = 0; batch < totalBatches; batch++) {
      const verifyBatch = targets.slice(batch * batchSize, (batch + 1) * batchSize);
      const remainingDiscovery = Math.max(0, Number(config.researchDailyTarget || 0) - batch * batchSize);
      const discoverCount = Math.min(batchSize, remainingDiscovery);
      if (!verifyBatch.length && discoverCount <= 0) break;

      const ai = await researchBookingProspects(env, {
        verify: verifyBatch.map(x => ({
          id: x.id,
          entity: x.entity,
          room: x.room,
          contactName: x.contact_name,
          contactRole: x.contact_role,
          email: x.email,
          phone: x.phone,
          status: x.status,
          invalidEmails: x.invalidEmails || []
        })),
        discoverCount
      });

      for (const item of ai.data.verified || []) {
        if (!item.requestedId) continue;
        item.sourceUrls = trustedSourceList(item.sourceUrls, ai.sources);
        await upsertResearchedProspect(env, item, item.requestedId);
        verified++;
      }

      // New discoveries remain MANUAL for the rest of this research run. Because
      // verification targets were snapshotted before batching, a newly discovered
      // lead cannot become send-eligible until a later research run verifies it.
      for (const item of ai.data.discovered || []) {
        const itemSources = trustedSourceList(item.sourceUrls, ai.sources);
        const stagedId = await stageDiscoveredProspect(env, item, itemSources);
        if (stagedId) discovered++;
      }

      if (ai.data.researchNotes) notes.push(ai.data.researchNotes);
      if (ai.responseId) responseIds.push(ai.responseId);
      for (const url of ai.sources || []) sources.add(url);
    }

    const summary = {
      verified,
      discovered,
      stagedForSecondPass: discovered,
      notes: notes.join(' | '),
      responseIds,
      sources: [...sources].slice(0, 60)
    };
    await finishRun(env, runId, summary);
    return summary;
  } catch (error) {
    await finishRun(env, runId, {}, String(error?.message || error));
    throw error;
  }
}
