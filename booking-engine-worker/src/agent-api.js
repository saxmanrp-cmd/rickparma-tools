import { bearerToken, verifySession } from './auth.js';
import { bookingAgentStatus, setBookingAgentConfig, runAutonomousBookingAgent, listBookingEscalations, resolveBookingEscalation } from './autopilot-agent.js';
import { respondToEscalation } from './escalation-response.js';
import { importProspects, listProspects } from './prospects.js';
import { getAutopilotConfig, appendComplianceFooter } from './autopilot-policy.js';

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const allowOrigin = allowed.includes(origin) || local ? origin : '';
  return {
    ...(allowOrigin ? { 'access-control-allow-origin': allowOrigin } : {}),
    'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'vary': 'Origin'
  };
}

function json(data, request, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(request, env) }
  });
}

async function authorized(request, env) {
  const supplied = bearerToken(request);
  if (!supplied) return false;
  const admin = String(env.BOOKING_API_TOKEN || '').trim();
  if (admin && supplied === admin) return true;
  return !!(await verifySession(env, supplied));
}

async function readJson(request) {
  try { return await request.json(); }
  catch { return {}; }
}

export async function handleAgentApi(request, env) {
  const url = new URL(request.url);
  const isAgentRoute = url.pathname.startsWith('/api/autopilot')
    || url.pathname.startsWith('/api/prospects')
    || url.pathname.startsWith('/api/escalations');
  if (!isAgentRoute) return null;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (!(await authorized(request, env))) return json({ error: 'Unauthorized.' }, request, env, 401);
  if (!env.DB) return json({ error: 'D1 database is not configured.' }, request, env, 503);

  try {
    if (url.pathname === '/api/autopilot/status' && request.method === 'GET') {
      return json(await bookingAgentStatus(env), request, env);
    }
    if (url.pathname === '/api/autopilot/config' && request.method === 'GET') {
      const status = await bookingAgentStatus(env);
      return json({ config: status.config, readiness: status.readiness }, request, env);
    }
    if (url.pathname === '/api/autopilot/config' && request.method === 'PUT') {
      const body = await readJson(request);
      return json({ ok: true, config: await setBookingAgentConfig(env, body.config || body) }, request, env);
    }
    if (url.pathname === '/api/autopilot/run' && request.method === 'POST') {
      const body = await readJson(request);
      return json(await runAutonomousBookingAgent(env, { forceResearch: body.forceResearch === true }), request, env);
    }
    if (url.pathname === '/api/autopilot/drafts' && request.method === 'GET') {
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 30));
      const result = await env.DB.prepare(`
        SELECT m.id,m.contact_id,m.subject,m.body,m.metadata_json,m.created_at,p.entity,p.room,p.contact_name,p.contact_role,p.email
        FROM messages m LEFT JOIN prospects p ON p.id=m.contact_id
        WHERE m.status='draft' ORDER BY m.created_at DESC LIMIT ?
      `).bind(limit).all();
      const config = await getAutopilotConfig(env);
      const drafts = (result.results || []).map(row => ({
        ...row,
        body: appendComplianceFooter(row.body || '', config)
      }));
      return json({ drafts }, request, env);
    }
    if (url.pathname === '/api/prospects/import' && request.method === 'POST') {
      const body = await readJson(request);
      return json({ ok: true, ...(await importProspects(env, Array.isArray(body.contacts) ? body.contacts : [], body.state || {})) }, request, env);
    }
    const roomPrefMatch = url.pathname.match(/^\/api\/prospects\/([^/]+)\/room-preference$/);
    if (roomPrefMatch && request.method === 'PUT') {
      const body = await readJson(request);
      const preference = String(body.preference || '').toUpperCase();
      if (!['TARGET','MAYBE','OPEN','SKIP','PERFORMING'].includes(preference)) {
        return json({ error: 'Invalid room preference.' }, request, env, 400);
      }

      const id = decodeURIComponent(roomPrefMatch[1]);
      const existing = await env.DB.prepare('SELECT id FROM prospects WHERE id=? LIMIT 1').bind(id).first();
      if (!existing?.id) return json({ error: 'Prospect not found.' }, request, env, 404);

      const currentVenue = preference === 'PERFORMING' ? 1 : 0;
      await env.DB.prepare('UPDATE prospects SET room_preference=?,current_venue=? WHERE id=?')
        .bind(preference, currentVenue, id).run();
      return json({ ok: true, id, roomPreference: preference, currentVenue }, request, env);
    }

    if (url.pathname === '/api/prospects' && request.method === 'GET') {
      const prospects = await listProspects(env, {
        limit: Number(url.searchParams.get('limit')) || 100,
        status: url.searchParams.get('status') || '',
        eligibleOnly: url.searchParams.get('eligible') === '1'
      });
      return json({ prospects }, request, env);
    }
    if (url.pathname === '/api/escalations' && request.method === 'GET') {
      return json({ escalations: await listBookingEscalations(env, Number(url.searchParams.get('limit')) || 50) }, request, env);
    }
    const respondMatch = url.pathname.match(/^\/api\/escalations\/([^/]+)\/respond$/);
    if (respondMatch && request.method === 'POST') {
      const body = await readJson(request);
      return json(await respondToEscalation(env, decodeURIComponent(respondMatch[1]), body.decision || ''), request, env);
    }
    const resolveMatch = url.pathname.match(/^\/api\/escalations\/([^/]+)\/resolve$/);
    if (resolveMatch && request.method === 'POST') {
      const body = await readJson(request);
      return json(await resolveBookingEscalation(env, decodeURIComponent(resolveMatch[1]), body.resolution || ''), request, env);
    }
    return json({ error: 'Not found.' }, request, env, 404);
  } catch (error) {
    console.error('booking-agent-api', error);
    return json({ error: String(error?.message || error || 'Server error.').slice(0, 1000) }, request, env, 502);
  }
}
