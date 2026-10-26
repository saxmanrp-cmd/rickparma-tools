import api from './index.js';
import { handleTwilioWebhook, syncMicrosoftReplies } from './reply-sync.js';
import { handleAgentApi } from './agent-api.js';
import { runAutonomousBookingAgent } from './autopilot-agent.js';
import { getAutopilotConfig, saveAutopilotConfig } from './autopilot-policy.js';
import { sendTwilioText } from './providers/twilio.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // One-time internal SMS test. Disabled unless a high-entropy token has been
    // temporarily armed in D1. The token is consumed before sending so it cannot replay.
    if (url.pathname === '/api/internal/intervention-test' && request.method === 'GET') {
      const supplied = String(url.searchParams.get('token') || '');
      const config = await getAutopilotConfig(env);
      const expected = String(config.interventionTestToken || '');
      if (!expected || !supplied || supplied !== expected) {
        return new Response(JSON.stringify({ error: 'Not found.' }), {
          status: 404,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }

      // Consume first, even if the SMS provider later fails.
      await saveAutopilotConfig(env, { ...config, interventionTestToken: '' });

      const to = String(config.interventionAlertPhone || env.BOOKING_ALERT_PHONE || '').trim();
      if (!to) {
        return new Response(JSON.stringify({ error: 'Intervention alert phone is not configured.' }), {
          status: 400,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }

      const testBody = [
        'TEST — NEEDS RICK ALERT',
        'Booking Engine intervention texting is working.',
        '',
        'Example: A booking conversation has reached the point where you should step in personally.',
        'Open Booking Engine → Needs Rick. Tap “I’m Calling • Pause Emails” before calling.',
        '',
        'THIS IS A TEST — no new booking email triggered this.'
      ].join('\n');

      try {
        const sent = await sendTwilioText(env, {
          approved: true,
          textOk: true,
          to,
          body: testBody
        });
        return new Response(JSON.stringify({ ok: true, provider: 'direct-twilio', status: sent.status || 'queued' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      } catch (directError) {
        if (!env.SMS_BLAST || typeof env.SMS_BLAST.fetch !== 'function') {
          return new Response(JSON.stringify({ error: String(directError?.message || directError).slice(0, 500) }), {
            status: 502,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }

        const smsRes = await env.SMS_BLAST.fetch(new Request('https://sms-blast.internal/api/conversations/reply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phone: to, message: testBody })
        }));
        const smsData = await smsRes.json().catch(() => ({}));
        if (!smsRes.ok) {
          return new Response(JSON.stringify({
            error: smsData?.error || `SMS Blast fallback failed with ${smsRes.status}.`,
            directError: String(directError?.message || directError).slice(0, 300)
          }), {
            status: 502,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }

        return new Response(JSON.stringify({ ok: true, provider: 'sms-blast-service', status: smsData?.status || 'sent' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
    }

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
