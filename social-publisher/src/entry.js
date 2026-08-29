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

const VERSION = '0.7.7';
const COMIC_MEDIA_PREFIX = 'comic-templates/';
const FUEL_TRACKER_SOURCE = 'https://raw.githubusercontent.com/saxmanrp-cmd/rickparma-tools/main/nutrition-tracker.html';
const FUEL_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';

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
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (!upstream.ok) return new Response('Fuel Tracker is temporarily unavailable.', { status:502 });
    const headers = new Headers(upstream.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'public, max-age=120');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status:200, headers });
  } catch {
    return new Response('Fuel Tracker is temporarily unavailable.', { status:502 });
  }
}

function readAiText(result) {
  return result?.choices?.[0]?.message?.content || result?.response || result?.result || '';
}

function parseJsonLoose(text) {
  if (typeof text !== 'string') return null;
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch {}
  }
  return null;
}

function num(value, max = 10000) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

function normalizeFuelAnalysis(data) {
  const items = Array.isArray(data?.items) ? data.items.slice(0, 20).map((item) => ({
    name: String(item?.name || 'Food').slice(0, 80),
    amount: String(item?.amount || '').slice(0, 40),
    calories: Math.round(num(item?.calories, 5000)),
    protein: Math.round(num(item?.protein, 500) * 10) / 10,
    carbs: Math.round(num(item?.carbs, 500) * 10) / 10,
    fat: Math.round(num(item?.fat, 500) * 10) / 10,
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0.6)),
  })) : [];
  const totals = items.reduce((a, x) => ({
    calories: a.calories + x.calories,
    protein: a.protein + x.protein,
    carbs: a.carbs + x.carbs,
    fat: a.fat + x.fat,
  }), { calories:0, protein:0, carbs:0, fat:0 });
  return {
    items,
    totals: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
    },
    summary: String(data?.summary || items.map(x => `${x.amount} ${x.name}`.trim()).join(', ')).slice(0, 400),
    note: String(data?.note || 'Nutrition is an estimate; adjust portions before saving.').slice(0, 300),
  };
}

async function handleFuelAnalyze(request, env) {
  if (!env.AI) return json({ error:'AI food analysis is not configured.' }, { status:503 });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 6_000_000) return json({ error:'That photo is too large. Try again with a smaller image.' }, { status:413 });

  try {
    const form = await request.formData();
    const text = String(form.get('text') || '').trim().slice(0, 1800);
    const image = form.get('image');
    let imageDescription = '';

    if (image && typeof image.arrayBuffer === 'function' && image.size > 0) {
      if (image.size > 5_000_000) return json({ error:'That photo is too large. Try again with a smaller image.' }, { status:413 });
      const converted = await env.AI.toMarkdown(
        { name: image.name || 'meal.jpg', blob: new Blob([await image.arrayBuffer()], { type:image.type || 'image/jpeg' }) },
        { conversionOptions: { output:{ format:'text' }, image:{ descriptionLanguage:'en' } } },
      );
      if (converted?.format !== 'error') imageDescription = String(converted?.data || '').slice(0, 5000);
    }

    if (!text && !imageDescription) return json({ error:'Type what you ate or take a food photo.' }, { status:400 });

    const prompt = `Estimate the nutrition for one meal from the information below. This is for a personal food log, not medical advice. Be practical and conservative. Use common cooked serving values. If a portion is unclear, make a reasonable estimate and lower confidence. Include sauces, butter, oils, breading, cheese and cooking fats when they are mentioned or clearly visible. Do not invent foods that are not supported by the text or image description.\n\nUSER TEXT:\n${text || '(none)'}\n\nIMAGE DESCRIPTION:\n${imageDescription || '(none)'}\n\nReturn ONLY valid JSON with this exact shape:\n{"items":[{"name":"food","amount":"estimated amount","calories":0,"protein":0,"carbs":0,"fat":0,"confidence":0.0}],"summary":"short meal description","note":"short uncertainty note"}\nNumbers are grams for protein/carbs/fat and kcal for calories.`;

    const result = await env.AI.run(FUEL_AI_MODEL, {
      messages: [
        { role:'system', content:'You are a careful nutrition logging assistant. Output JSON only.' },
        { role:'user', content:prompt },
      ],
      temperature:0.2,
      max_completion_tokens:900,
      chat_template_kwargs:{ enable_thinking:false },
    });

    const parsed = parseJsonLoose(readAiText(result));
    if (!parsed) return json({ error:'I could not read that meal clearly. Try adding portion sizes or retaking the photo.' }, { status:422 });
    const normalized = normalizeFuelAnalysis(parsed);
    if (!normalized.items.length) return json({ error:'I could not identify enough food to calculate. Add a short description and try again.' }, { status:422 });
    return json({ ok:true, ...normalized, imageDescription:imageDescription.slice(0, 600) });
  } catch (error) {
    console.error('fuel analyze error', error);
    return json({ error:'Food analysis had a hiccup. You can still use Quick Add or manual macros.' }, { status:500 });
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

    if (url.pathname === '/api/fuel/analyze' && request.method === 'POST') {
      return handleFuelAnalyze(request, env);
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
