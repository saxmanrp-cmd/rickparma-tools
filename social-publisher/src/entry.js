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
import { handleComicTemplateRequest } from './comic-templates.js';

const VERSION = '0.7.6';
const COMIC_MEDIA_PREFIX = 'comic-templates/';
const FUEL_TRACKER_SOURCE = 'https://raw.githubusercontent.com/saxmanrp-cmd/rickparma-tools/main/nutrition-tracker.html';

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

async function serveFuelTracker(request) {
  try {
    const upstream = await fetch(FUEL_TRACKER_SOURCE, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!upstream.ok) return new Response('Fuel Tracker is temporarily unavailable.', { status:502 });
    const headers = new Headers(upstream.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'public, max-age=300');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status:200, headers });
  } catch {
    return new Response('Fuel Tracker is temporarily unavailable.', { status:502 });
  }
}

function comicMediaKey(url) {
  try {
    const raw = decodeURIComponent(url.pathname.slice('/media/'.length));
    if (!raw.startsWith(COMIC_MEDIA_PREFIX)) return '';
    const name = raw.slice(COMIC_MEDIA_PREFIX.length);
    if (!name || name.length > 160 || !/^[A-Za-z0-9._-]+$/.test(name)) return '';
    return `${COMIC_MEDIA_PREFIX}${name}`;
  } catch {
    return '';
  }
}

async function serveComicMedia(request, url, env) {
  if (!env.MEDIA) return new Response('Media storage is not configured.', { status:503 });
  const key = comicMediaKey(url);
  if (!key) return new Response('Not found', { status:404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status:404 });
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  headers.set('cache-control','public, max-age=86400');
  return new Response(request.method === 'HEAD' ? null : object.body, { status:200, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((request.method === 'GET' || request.method === 'HEAD') && (url.pathname === '/fuel' || url.pathname === '/fuel/' || url.pathname === '/nutrition-tracker.html')) {
      return serveFuelTracker(request);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/media/comic-templates')) {
      return serveComicMedia(request, url, env);
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

    if (url.pathname.startsWith('/api/comic-templates')) {
      const authError = await requireAppLogin(request, env);
      if (authError) return authError;
      const response = await handleComicTemplateRequest(request, env);
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
