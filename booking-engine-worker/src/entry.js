import api from './index.js';
import { handleTwilioWebhook, syncMicrosoftReplies } from './reply-sync.js';
import { handleAgentApi } from './agent-api.js';
import { runAutonomousBookingAgent } from './autopilot-agent.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Twilio must be able to reach this route without the Booking Engine session token.
    // Security is provided by Twilio's X-Twilio-Signature, validated in reply-sync.js.
    if (url.pathname === '/api/webhooks/twilio' && request.method === 'POST') {
      return handleTwilioWebhook(request, env);
    }

    const agentResponse = await handleAgentApi(request, env);
    if (agentResponse) return agentResponse;

    return api.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const sync = await syncMicrosoftReplies(env);
        console.log('booking-email-reply-sync', sync);
      } catch (error) {
        console.error('booking-email-reply-sync-failed', error);
      }

      try {
        const result = await runAutonomousBookingAgent(env);
        console.log('booking-autopilot-cycle', result);
      } catch (error) {
        console.error('booking-autopilot-cycle-failed', error);
      }
    })());
  }
};
