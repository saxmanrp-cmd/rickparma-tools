import api from './index.js';
import { handleTwilioWebhook, syncMicrosoftReplies } from './reply-sync.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Twilio must be able to reach this route without the Booking Engine session token.
    // Security is provided by Twilio's X-Twilio-Signature, validated in reply-sync.js.
    if (url.pathname === '/api/webhooks/twilio' && request.method === 'POST') {
      return handleTwilioWebhook(request, env);
    }

    return api.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const result = await syncMicrosoftReplies(env);
        console.log('booking-email-reply-sync', result);
      } catch (error) {
        console.error('booking-email-reply-sync-failed', error);
      }
    })());
  }
};
