import { sendMicrosoftMailboxVerification } from './providers/microsoft.js';

const PROVIDER_KEY = 'microsoft-new-outbound-verification';

export async function runPendingMailboxVerification(env) {
  if (!env.DB) return { skipped: true, reason: 'D1 database is not configured.' };
  const row = await env.DB.prepare('SELECT cursor FROM sync_state WHERE provider=?').bind(PROVIDER_KEY).first();
  if (row?.cursor !== 'pending') return { skipped: true, status: row?.cursor || 'not-requested' };

  const claimed = await env.DB.prepare(`
    UPDATE sync_state SET cursor='running',updated_at=CURRENT_TIMESTAMP
    WHERE provider=? AND cursor='pending'
  `).bind(PROVIDER_KEY).run();
  if (Number(claimed?.meta?.changes || 0) !== 1) return { skipped: true, status: 'already-claimed' };

  try {
    const result = await sendMicrosoftMailboxVerification(env);
    await env.DB.prepare(`
      UPDATE sync_state SET cursor='verified',metadata_json=?,updated_at=CURRENT_TIMESTAMP
      WHERE provider=? AND cursor='running'
    `).bind(JSON.stringify(result), PROVIDER_KEY).run();
    return { status: 'verified', mailbox: result.mailbox, from: result.from, replyTo: result.replyTo, testRecipient: result.testRecipient };
  } catch (error) {
    const detail = String(error?.message || error).slice(0, 800);
    await env.DB.prepare(`
      UPDATE sync_state SET cursor='failed',metadata_json=?,updated_at=CURRENT_TIMESTAMP
      WHERE provider=? AND cursor='running'
    `).bind(JSON.stringify({ error: detail, failedAt: new Date().toISOString() }), PROVIDER_KEY).run();
    return { status: 'failed', error: detail };
  }
}
