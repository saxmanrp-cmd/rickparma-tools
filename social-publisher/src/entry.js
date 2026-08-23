import core from './index.js';
import {
  getPasskeyAvailability,
  handlePasskeyRequest,
  isLegacySessionAuthenticated,
} from './passkey-auth.js';
import {
  addThreadsInsightsScope,
  persistThreadsInsightsScope,
} from './threads-insights.js';
import { handleContentPlanRequest } from './content-plan.js';
import { handleSiteCalendarRequest } from './site-calendar.js';
import { handleTextBlastRequest } from './text-blast-bridge.js';
import { renderLoginPage } from './login-page.js';

const VERSION = '0.7.6';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers:{ 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

async function requireAppLogin(request, env) {
  const configured = Boolean(env.APP_PASSWORD && env.SESSION_SECRET);
  if (!configured) return json({ error:'App login is not configured.' }, { status:503 });
  if (!await isLegacySessionAuthenticated(request, env)) return json({ error:'Authentication required.' }, { status:401 });
  return null;
}

async function handleAppShell(request, env) {
  const configured = Boolean(env.APP_PASSWORD && env.SESSION_SECRET);
  if (configured) {
    const authenticated = await isLegacySessionAuthenticated(request, env);
    if (!authenticated) {
      const passkeyAvailable = await getPasskeyAvailability(env);
      return renderLoginPage({ passkeyAvailable });
    }
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((url.pathname === '/' || url.pathname === '/index.html') && request.method === 'GET') {
      return handleAppShell(request, env);
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok:true, service:'social-publisher-v3', version:VERSION, time:new Date().toISOString() });
    }

    if (url.pathname === '/api/auth/status' && request.method === 'GET') {
      const configured = Boolean(env.APP_PASSWORD && env.SESSION_SECRET);
      const authenticated = configured ? await isLegacySessionAuthenticated(request, env) : false;
      const passkeyAvailable = await getPasskeyAvailability(env);
      return json({ configured, authenticated, passkeyAvailable });
    }

    const passkeyResponse = await handlePasskeyRequest(request, env);
    if (passkeyResponse) return passkeyResponse;

    if (url.pathname.startsWith('/api/content-plan')) {
      const authError = await requireAppLogin(request, env);
      if (authError) return authError;
      const response = await handleContentPlanRequest(request, env);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/site-calendar')) {
      const authError = await requireAppLogin(request, env);
      if (authError) return authError;
      const response = await handleSiteCalendarRequest(request, env);
      if (response) return response;
    }

    if (url.pathname.startsWith('/api/text-blast')) {
      const authError = await requireAppLogin(request, env);
      if (authError) return authError;
      const response = await handleTextBlastRequest(request, env);
      if (response) return response;
    }

    if (url.pathname === '/api/threads/connect' && request.method === 'GET') {
      const response = await core.fetch(request, env, ctx);
      return addThreadsInsightsScope(response);
    }

    if (url.pathname === '/api/threads/callback' && request.method === 'GET') {
      const response = await core.fetch(request, env, ctx);
      await persistThreadsInsightsScope(response, env).catch(() => false);
      return response;
    }

    return core.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') return core.scheduled(controller, env, ctx);
  },
};
