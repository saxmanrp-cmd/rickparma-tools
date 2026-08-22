const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'social-publisher-v3', version: '0.6.6', time: new Date().toISOString() });
    }

    if (url.pathname === '/api/auth/status' && request.method === 'GET') {
      const configured = Boolean(env.APP_PASSWORD && env.SESSION_SECRET);
      return json({ configured, authenticated: configured ? await isAuthenticated(request, env) : false });
    }

    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      if (!env.APP_PASSWORD || !env.SESSION_SECRET) {
        return json({ error: 'App login is not configured.' }, { status: 503 });
      }
      const body = await request.json().catch(() => ({}));
      if (!constantTimeEqual(String(body.password || ''), String(env.APP_PASSWORD))) {
        return json({ error: 'Incorrect password.' }, { status: 401 });
      }
      const cookie = await createSessionCookie(env);
      return json({ ok: true }, { headers: { 'set-cookie': cookie } });
    }

    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      return json({ ok: true }, { headers: { 'set-cookie': 'sp_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' } });
    }

    // OAuth callbacks are public routes protected by signed state.
    if (url.pathname === '/api/meta/callback' && request.method === 'GET') {
      return handleMetaCallback(url, env);
    }
    if (url.pathname === '/api/tiktok/callback' && request.method === 'GET') {
      return handleTikTokCallback(url, env);
    }
    if (url.pathname === '/api/threads/callback' && request.method === 'GET') {
      return handleThreadsCallback(url, env);
    }
    // Threads platform callbacks must stay public so Meta can reach them.
    if (url.pathname === '/api/threads/deauthorize') {
      if (request.method === 'GET' || request.method === 'HEAD') return json({ ok:true, endpoint:'threads-deauthorize' });
      if (request.method === 'POST') return handleThreadsDeauthorize(request, env);
    }
    if (url.pathname === '/api/threads/delete') {
      if (request.method === 'GET' || request.method === 'HEAD') return json({ ok:true, endpoint:'threads-delete' });
      if (request.method === 'POST') return handleThreadsDelete(request, url, env);
    }
    if (url.pathname === '/threads-delete-status' && request.method === 'GET') {
      const code = url.searchParams.get('code') || '';
      return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Threads Data Deletion</title></head><body style="font-family:system-ui;padding:32px;max-width:700px;margin:auto"><h1>Threads data deletion request</h1><p>Your Threads connection data has been deleted from Social Publisher.</p><p>Confirmation code: <strong>${escapeHtml(code)}</strong></p></body></html>`, { headers:{'content-type':'text/html; charset=utf-8'} });
    }

    if (url.pathname.startsWith('/api/')) {
      const authResponse = await requireAuth(request, env);
      if (authResponse) return authResponse;
    }

    if (url.pathname === '/api/meta/status' && request.method === 'GET') {
      return metaStatus(env);
    }

    if (url.pathname === '/api/meta/connect' && request.method === 'GET') {
      if (!metaConfigured(env)) return json({ configured: false, error: 'Meta credentials or D1 are not configured.' }, { status: 503 });
      const redirectUri = `${url.origin}/api/meta/callback`;
      const state = await createSignedState(env.META_APP_SECRET);
      const version = env.META_GRAPH_VERSION || 'v24.0';
      const auth = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
      auth.searchParams.set('client_id', env.META_APP_ID);
      auth.searchParams.set('redirect_uri', redirectUri);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('state', state);
      auth.searchParams.set('scope', [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_content_publish',
      ].join(','));
      if (env.META_LOGIN_CONFIG_ID) auth.searchParams.set('config_id', env.META_LOGIN_CONFIG_ID);
      return Response.redirect(auth.toString(), 302);
    }

    if (url.pathname === '/api/meta/select' && request.method === 'POST') {
      if (!metaConfigured(env)) return json({ configured: false }, { status: 503 });
      const body = await request.json().catch(() => ({}));
      if (!body.pageId) return json({ error: 'pageId is required.' }, { status: 400 });
      const candidate = await env.DB.prepare(`
        SELECT page_id, page_name, page_token_encrypted, instagram_id, instagram_username, instagram_name
        FROM meta_page_candidates WHERE page_id = ?
      `).bind(body.pageId).first();
      if (!candidate) return json({ error: 'Page not found.' }, { status: 404 });

      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare('UPDATE meta_page_candidates SET selected = 0, updated_at = ?').bind(now),
        env.DB.prepare('UPDATE meta_page_candidates SET selected = 1, updated_at = ? WHERE page_id = ?').bind(now, body.pageId),
        env.DB.prepare(`
          INSERT INTO social_accounts (id, platform, account_name, username, external_account_id, parent_account_id, access_token_encrypted, created_at, updated_at)
          VALUES ('facebook', 'facebook', ?, NULL, ?, NULL, ?, ?, ?)
          ON CONFLICT(platform) DO UPDATE SET account_name=excluded.account_name, external_account_id=excluded.external_account_id,
          access_token_encrypted=excluded.access_token_encrypted, updated_at=excluded.updated_at
        `).bind(candidate.page_name, candidate.page_id, candidate.page_token_encrypted, now, now),
      ]);

      if (candidate.instagram_id) {
        await env.DB.prepare(`
          INSERT INTO social_accounts (id, platform, account_name, username, external_account_id, parent_account_id, access_token_encrypted, created_at, updated_at)
          VALUES ('instagram', 'instagram', ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(platform) DO UPDATE SET account_name=excluded.account_name, username=excluded.username,
          external_account_id=excluded.external_account_id, parent_account_id=excluded.parent_account_id,
          access_token_encrypted=excluded.access_token_encrypted, updated_at=excluded.updated_at
        `).bind(
          candidate.instagram_name || candidate.instagram_username || 'Instagram',
          candidate.instagram_username || null,
          candidate.instagram_id,
          candidate.page_id,
          candidate.page_token_encrypted,
          now,
          now
        ).run();
      } else {
        await env.DB.prepare("DELETE FROM social_accounts WHERE platform='instagram'").run();
      }
      return json({ ok: true });
    }

    if (url.pathname === '/api/meta/disconnect' && request.method === 'POST') {
      if (!env.DB) return json({ error: 'D1 is not configured.' }, { status: 503 });
      await env.DB.batch([
        env.DB.prepare("DELETE FROM social_accounts WHERE platform IN ('facebook','instagram')"),
        env.DB.prepare('DELETE FROM meta_page_candidates'),
      ]);
      return json({ ok: true });
    }

    if (url.pathname === '/api/tiktok/status' && request.method === 'GET') {
      return tiktokStatus(env);
    }

    if (url.pathname === '/api/tiktok/connect' && request.method === 'GET') {
      if (!tiktokConfigured(env)) return json({ configured: false, error: 'TikTok credentials or D1 are not configured.' }, { status: 503 });
      const redirectUri = `${url.origin}/api/tiktok/callback`;
      const state = await createSignedState(env.TIKTOK_CLIENT_SECRET);
      const auth = new URL('https://www.tiktok.com/v2/auth/authorize/');
      auth.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY);
      auth.searchParams.set('redirect_uri', redirectUri);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('state', state);
      auth.searchParams.set('scope', 'user.info.basic,video.upload');
      return Response.redirect(auth.toString(), 302);
    }

    if (url.pathname === '/api/tiktok/disconnect' && request.method === 'POST') {
      if (!env.DB) return json({ error: 'D1 is not configured.' }, { status: 503 });
      const row = await env.DB.prepare('SELECT access_token_encrypted FROM tiktok_account WHERE id=\'tiktok\'').first().catch(() => null);
      if (row?.access_token_encrypted && env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY) {
        try {
          const token = await decryptSecret(row.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
          const form = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, token });
          await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form });
        } catch {}
      }
      await env.DB.prepare('DELETE FROM tiktok_account').run().catch(() => null);
      return json({ ok: true });
    }

    if (url.pathname === '/api/threads/status' && request.method === 'GET') {
      return threadsStatus(env);
    }

    if (url.pathname === '/api/threads/connect' && request.method === 'GET') {
      if (!threadsConfigured(env)) return json({ configured:false, error:'Threads credentials or D1 are not configured.' }, { status:503 });
      const redirectUri = `${url.origin}/api/threads/callback`;
      const state = await createSignedState(env.THREADS_APP_SECRET);
      const auth = new URL('https://threads.net/oauth/authorize');
      auth.searchParams.set('client_id', env.THREADS_APP_ID);
      auth.searchParams.set('redirect_uri', redirectUri);
      auth.searchParams.set('scope', 'threads_basic,threads_content_publish');
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('state', state);
      return Response.redirect(auth.toString(), 302);
    }

    if (url.pathname === '/api/threads/disconnect' && request.method === 'POST') {
      if (!env.DB) return json({ error:'D1 is not configured.' }, { status:503 });
      await env.DB.prepare('DELETE FROM threads_account').run().catch(()=>null);
      return json({ ok:true });
    }

    if (url.pathname === '/api/posts' && request.method === 'GET') {
      if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, { status: 503 });
      const { results } = await env.DB.prepare(`
        SELECT id, caption, platforms, media_key, media_type, status, scheduled_at, published_at,
               publish_results, instagram_options, last_error, created_at, updated_at
        FROM posts ORDER BY created_at DESC LIMIT 100
      `).all();
      return json({ posts: results.map(parsePost) });
    }

    if (url.pathname === '/api/posts' && request.method === 'POST') {
      if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, { status: 503 });
      const body = await request.json().catch(() => ({}));
      if (!body.caption || !Array.isArray(body.platforms) || !body.platforms.length) {
        return json({ error: 'caption and at least one platform are required.' }, { status: 400 });
      }
      const allowedPlatforms = ['facebook','facebook_reel','instagram','instagram_post','instagram_story','instagram_reel','threads','tiktok'];
      const unsupported = body.platforms.filter(p => !allowedPlatforms.includes(p));
      if (unsupported.length) return json({ error: `Not connected yet: ${unsupported.join(', ')}` }, { status: 400 });

      const status = ['draft', 'scheduled', 'queued'].includes(body.status) ? body.status : 'draft';
      if (status === 'scheduled' && !body.scheduledAt) return json({ error: 'scheduledAt is required.' }, { status: 400 });
      if ((body.platforms.some(p => p === 'instagram' || p.startsWith('instagram_')) || body.platforms.includes('tiktok')) && !body.mediaKey) {
        return json({ error: 'Instagram and TikTok require a photo or video.' }, { status: 400 });
      }
      const mt = String(body.mediaType || '');
      if (body.platforms.includes('instagram_post') && body.mediaKey && !mt.startsWith('image/')) return json({ error:'Instagram Post requires a photo. Use Reel for video.' }, { status:400 });
      if (body.platforms.includes('instagram_reel') && body.mediaKey && !mt.startsWith('video/')) return json({ error:'Instagram Reel requires a video.' }, { status:400 });
      if (body.platforms.includes('facebook_reel') && body.mediaKey && !mt.startsWith('video/')) return json({ error:'Facebook Reel requires a video.' }, { status:400 });
      const igOptionsResult = validateInstagramOptions(body.instagramOptions, body.platforms, mt);
      if (igOptionsResult.error) return json({ error:igOptionsResult.error }, { status:400 });
      const instagramOptions = igOptionsResult.value;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO posts (id, caption, platforms, media_key, media_type, status, scheduled_at, instagram_options, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        String(body.caption).trim(),
        JSON.stringify(body.platforms),
        body.mediaKey || null,
        body.mediaType || null,
        status,
        body.scheduledAt || null,
        instagramOptions ? JSON.stringify(instagramOptions) : null,
        now,
        now
      ).run();

      if (status === 'queued') {
        // Instagram video containers (Reels and video Stories) can take minutes.
        // Do not run those inside an HTTP waitUntil(), because the background
        // task can end after the response even though Instagram later publishes.
        // Let the every-minute cron own the full job so the final D1 status is saved.
        const longVideoJob = mt.startsWith('video/') && body.platforms.some(p =>
          p === 'instagram_reel' || p === 'instagram_story' || p === 'facebook_reel'
        );
        if (!longVideoJob) ctx.waitUntil(processPost(env, id));
      }
      return json({ ok: true, id, status }, { status: 201 });
    }

    const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch && request.method === 'PATCH') {
      if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, { status: 503 });
      const id = decodeURIComponent(postMatch[1]);
      const existing = await env.DB.prepare(`
        SELECT id, status, media_key, media_type FROM posts WHERE id=?
      `).bind(id).first();
      if (!existing) return json({ error: 'Post not found.' }, { status: 404 });
      if (existing.status !== 'scheduled') {
        return json({ error: 'Only scheduled posts can be edited.' }, { status: 409 });
      }

      const body = await request.json().catch(() => ({}));
      if (!body.caption || !Array.isArray(body.platforms) || !body.platforms.length) {
        return json({ error: 'caption and at least one platform are required.' }, { status: 400 });
      }
      const allowedPlatforms = ['facebook','facebook_reel','instagram','instagram_post','instagram_story','instagram_reel','threads','tiktok'];
      const unsupported = body.platforms.filter(p => !allowedPlatforms.includes(p));
      if (unsupported.length) return json({ error: `Not connected yet: ${unsupported.join(', ')}` }, { status: 400 });
      if (!body.scheduledAt) return json({ error: 'scheduledAt is required.' }, { status: 400 });
      const scheduledDate = new Date(body.scheduledAt);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        return json({ error: 'Choose a future scheduled time.' }, { status: 400 });
      }

      const hasMediaKey = Object.prototype.hasOwnProperty.call(body, 'mediaKey');
      const hasMediaType = Object.prototype.hasOwnProperty.call(body, 'mediaType');
      const mediaKey = hasMediaKey ? (body.mediaKey || null) : (existing.media_key || null);
      const mediaType = hasMediaType ? (body.mediaType || null) : (existing.media_type || null);
      if ((body.platforms.some(p => p === 'instagram' || p.startsWith('instagram_')) || body.platforms.includes('tiktok')) && !mediaKey) {
        return json({ error: 'Instagram and TikTok require a photo or video.' }, { status: 400 });
      }
      const mt = String(mediaType || '');
      if (body.platforms.includes('instagram_post') && mediaKey && !mt.startsWith('image/')) return json({ error:'Instagram Post requires a photo. Use Reel for video.' }, { status:400 });
      if (body.platforms.includes('instagram_reel') && mediaKey && !mt.startsWith('video/')) return json({ error:'Instagram Reel requires a video.' }, { status:400 });
      if (body.platforms.includes('facebook_reel') && mediaKey && !mt.startsWith('video/')) return json({ error:'Facebook Reel requires a video.' }, { status:400 });
      const igOptionsResult = validateInstagramOptions(body.instagramOptions, body.platforms, mt);
      if (igOptionsResult.error) return json({ error:igOptionsResult.error }, { status:400 });
      const instagramOptions = igOptionsResult.value;

      const now = new Date().toISOString();
      const updated = await env.DB.prepare(`
        UPDATE posts
        SET caption=?, platforms=?, media_key=?, media_type=?, scheduled_at=?, instagram_options=?,
            last_error=NULL, publish_results=NULL, updated_at=?
        WHERE id=? AND status='scheduled'
      `).bind(
        String(body.caption).trim(),
        JSON.stringify(body.platforms),
        mediaKey,
        mediaType,
        scheduledDate.toISOString(),
        instagramOptions ? JSON.stringify(instagramOptions) : null,
        now,
        id
      ).run();
      if (!updated.meta?.changes) {
        return json({ error: 'This post is no longer scheduled. Refresh and try again.' }, { status: 409 });
      }

      if (existing.media_key && existing.media_key !== mediaKey) {
        ctx.waitUntil(cleanupUnusedMedia(env, existing.media_key));
      }
      return json({ ok: true, id, status: 'scheduled' });
    }

    if (postMatch && request.method === 'DELETE') {
      if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, { status: 503 });
      const id = decodeURIComponent(postMatch[1]);
      const existing = await env.DB.prepare(`
        SELECT id, status, media_key FROM posts WHERE id=?
      `).bind(id).first();
      if (!existing) return json({ error: 'Post not found.' }, { status: 404 });
      if (existing.status !== 'scheduled') {
        return json({ error: 'Only scheduled posts can be deleted.' }, { status: 409 });
      }
      const deleted = await env.DB.prepare("DELETE FROM posts WHERE id=? AND status='scheduled'").bind(id).run();
      if (!deleted.meta?.changes) {
        return json({ error: 'This post is no longer scheduled. Refresh and try again.' }, { status: 409 });
      }
      if (existing.media_key) ctx.waitUntil(cleanupUnusedMedia(env, existing.media_key));
      return json({ ok: true, id });
    }

    if (url.pathname.match(/^\/api\/posts\/[^/]+\/retry$/) && request.method === 'POST') {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE posts SET status='queued', last_error=NULL, updated_at=? WHERE id=?").bind(now, id).run();
      ctx.waitUntil(processPost(env, id));
      return json({ ok: true });
    }

    if (url.pathname.startsWith('/api/media/') && request.method === 'PUT') {
      if (!env.MEDIA) return json({ error: 'R2 binding MEDIA is not configured.' }, { status: 503 });
      const key = sanitizeMediaKey(decodeURIComponent(url.pathname.slice('/api/media/'.length)));
      if (!key) return json({ error: 'Missing media key.' }, { status: 400 });
      const contentType = request.headers.get('content-type') || 'application/octet-stream';
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > 250 * 1024 * 1024) return json({ error: 'File is too large.' }, { status: 413 });
      await env.MEDIA.put(key, request.body, { httpMetadata: { contentType } });
      return json({ ok: true, key, contentType });
    }

    // Public on purpose: Meta and TikTok must be able to fetch media from this URL during publishing/upload.
    if (url.pathname.startsWith('/media/') && request.method === 'GET') {
      if (!env.MEDIA) return new Response('R2 binding MEDIA is not configured.', { status: 503 });
      const key = sanitizeMediaKey(decodeURIComponent(url.pathname.slice('/media/'.length)));
      if (!key) return new Response('Not found', { status: 404 });
      const object = await env.MEDIA.get(key);
      if (!object) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=86400');
      return new Response(object.body, { headers });
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Social Publisher', { status: 200 });
  },

  async scheduled(controller, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil(processDuePosts(env));
  },
};

async function requireAuth(request, env) {
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) return json({ error: 'App login is not configured.' }, { status: 503 });
  if (!(await isAuthenticated(request, env))) return json({ error: 'Unauthorized.' }, { status: 401 });
  return null;
}

async function isAuthenticated(request, env) {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/(?:^|;\s*)sp_session=([^;]+)/);
  if (!match) return false;
  return verifySessionToken(match[1], env.SESSION_SECRET);
}

async function createSessionCookie(env) {
  const token = await createSessionToken(env.SESSION_SECRET);
  return `sp_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`;
}

async function createSessionToken(secret) {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${expires}:${crypto.randomUUID()}`;
  const sig = await hmac(payload, secret);
  return `${base64Url(new TextEncoder().encode(payload))}.${sig}`;
}

async function verifySessionToken(value, secret) {
  try {
    const [payload64, supplied] = value.split('.');
    if (!payload64 || !supplied) return false;
    const payload = new TextDecoder().decode(base64UrlDecode(payload64));
    const [expires] = payload.split(':');
    if (!expires || Date.now() > Number(expires)) return false;
    const expected = await hmac(payload, secret);
    return constantTimeEqual(expected, supplied);
  } catch { return false; }
}

function metaConfigured(env) {
  return Boolean(env.DB && env.META_APP_ID && env.META_APP_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

async function handleMetaCallback(url, env) {
  if (!metaConfigured(env)) return Response.redirect(`${url.origin}/?meta=error`, 302);
  if (url.searchParams.get('error')) return Response.redirect(`${url.origin}/?meta=error`, 302);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || !(await verifySignedState(state, env.META_APP_SECRET))) {
    return Response.redirect(`${url.origin}/?meta=error`, 302);
  }

  try {
    const redirectUri = `${url.origin}/api/meta/callback`;
    const shortToken = await exchangeCodeForToken(env, code, redirectUri);
    const userToken = await exchangeForLongLivedToken(env, shortToken).catch(() => shortToken);
    const pages = await fetchManagedPages(env, userToken);
    if (!pages.length) return Response.redirect(`${url.origin}/?meta=no_pages`, 302);
    await saveMetaCandidates(env, pages);
    return Response.redirect(`${url.origin}/?meta=connected`, 302);
  } catch (err) {
    console.error('Meta callback error', err);
    return Response.redirect(`${url.origin}/?meta=error`, 302);
  }
}

async function metaStatus(env) {
  if (!metaConfigured(env)) return json({ configured: false, connected: false }, { status: 503 });
  const fb = await env.DB.prepare("SELECT account_name, external_account_id FROM social_accounts WHERE platform='facebook'").first();
  const ig = await env.DB.prepare("SELECT account_name, username, external_account_id FROM social_accounts WHERE platform='instagram'").first();
  if (fb) {
    return json({
      configured: true,
      connected: true,
      facebook: { name: fb.account_name, id: fb.external_account_id },
      instagram: ig ? { name: ig.account_name, username: ig.username, id: ig.external_account_id } : null,
    });
  }
  const { results } = await env.DB.prepare(`
    SELECT page_id, page_name, instagram_id, instagram_username, instagram_name
    FROM meta_page_candidates ORDER BY page_name
  `).all();
  if (results.length) {
    return json({
      configured: true,
      connected: false,
      needsSelection: true,
      candidates: results.map(r => ({
        pageId: r.page_id,
        pageName: r.page_name,
        instagramId: r.instagram_id,
        instagramUsername: r.instagram_username,
        instagramName: r.instagram_name,
      })),
    });
  }
  return json({ configured: true, connected: false });
}

async function exchangeCodeForToken(env, code, redirectUri) {
  const version = env.META_GRAPH_VERSION || 'v24.0';
  const u = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  u.searchParams.set('client_id', env.META_APP_ID);
  u.searchParams.set('client_secret', env.META_APP_SECRET);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('code', code);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(data.error?.message || 'Meta token exchange failed.');
  return data.access_token;
}

async function exchangeForLongLivedToken(env, token) {
  const version = env.META_GRAPH_VERSION || 'v24.0';
  const u = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  u.searchParams.set('grant_type', 'fb_exchange_token');
  u.searchParams.set('client_id', env.META_APP_ID);
  u.searchParams.set('client_secret', env.META_APP_SECRET);
  u.searchParams.set('fb_exchange_token', token);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(data.error?.message || 'Long-lived token exchange failed.');
  return data.access_token;
}

async function fetchManagedPages(env, userToken) {
  const version = env.META_GRAPH_VERSION || 'v24.0';
  const u = new URL(`https://graph.facebook.com/${version}/me/accounts`);
  u.searchParams.set('fields', 'id,name,access_token,tasks,instagram_business_account{id,username,name}');
  u.searchParams.set('access_token', userToken);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Could not load Facebook Pages.');
  return data.data || [];
}

async function saveMetaCandidates(env, pages) {
  const now = new Date().toISOString();
  await env.DB.prepare('DELETE FROM meta_page_candidates').run();
  for (const page of pages) {
    if (!page.access_token) continue;
    const encrypted = await encryptSecret(page.access_token, env.TOKEN_ENCRYPTION_KEY);
    const ig = page.instagram_business_account || {};
    await env.DB.prepare(`
      INSERT INTO meta_page_candidates (page_id, page_name, page_token_encrypted, instagram_id, instagram_username, instagram_name, selected, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(page.id, page.name || 'Facebook Page', encrypted, ig.id || null, ig.username || null, ig.name || null, now, now).run();
  }
}

async function cleanupUnusedMedia(env, key) {
  if (!env.MEDIA || !key) return;
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM posts WHERE media_key=?').bind(key).first();
    if (Number(row?.count || 0) === 0) await env.MEDIA.delete(key);
  } catch (err) {
    console.warn('Could not clean up unused media', key, err);
  }
}

async function processDuePosts(env) {
  const now = new Date().toISOString();

  // Recover an invocation that was interrupted while a platform was processing.
  // This prevents a post from displaying "posting" forever.
  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await env.DB.prepare(`
    UPDATE posts
    SET status='failed',
        last_error=COALESCE(last_error, 'Publishing timed out before completion. Confirm it is not already live, then tap Retry.'),
        updated_at=?
    WHERE status='publishing' AND updated_at < ?
  `).bind(now, staleCutoff).run();

  // Queued Reels are intentionally handled by cron because video transcoding can
  // take several minutes. Scheduled posts are handled here as before.
  const { results } = await env.DB.prepare(`
    SELECT id FROM posts
    WHERE status='queued'
       OR (status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?)
    ORDER BY CASE WHEN scheduled_at IS NULL THEN created_at ELSE scheduled_at END ASC
    LIMIT 10
  `).bind(now).all();
  for (const row of results) {
    await processPost(env, row.id);
  }
}

async function processPost(env, id) {
  const row = await env.DB.prepare(`
    SELECT id, caption, platforms, media_key, media_type, status, scheduled_at, instagram_options
    FROM posts WHERE id=?
  `).bind(id).first();
  if (!row || !['queued', 'scheduled', 'ready_to_publish', 'failed', 'partial_failed'].includes(row.status)) return;
  if (row.status === 'scheduled' && row.scheduled_at && new Date(row.scheduled_at) > new Date()) return;

  const claimed = await env.DB.prepare(`
    UPDATE posts SET status='publishing', updated_at=?
    WHERE id=? AND status IN ('queued','scheduled','ready_to_publish','failed','partial_failed')
  `).bind(new Date().toISOString(), id).run();
  if (!claimed.meta?.changes) return;

  const post = parsePost(row);
  const results = {};
  const errors = [];
  for (const platform of post.platforms) {
    try {
      if (platform === 'facebook') results.facebook = await publishFacebook(env, post);
      else if (platform === 'facebook_reel') results.facebook_reel = await publishFacebookReel(env, post);
      else if (platform === 'instagram' || platform.startsWith('instagram_')) results[platform] = await publishInstagram(env, post, platform === 'instagram' ? 'post' : platform.replace('instagram_',''));
      else if (platform === 'threads') results.threads = await publishThreads(env, post);
      else if (platform === 'tiktok') results.tiktok = await uploadTikTokDraft(env, post);
      else throw new Error(`${platform} publishing is not connected yet.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[platform] = { ok: false, error: message };
      errors.push(`${platform}: ${message}`);
      console.error(`Publishing ${id} to ${platform} failed`, err);
    }
  }

  const successes = Object.values(results).filter(r => r?.ok).length;
  const finalStatus = successes === post.platforms.length ? 'published' : successes > 0 ? 'partial_failed' : 'failed';
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE posts
    SET status=?, published_at=?, publish_results=?, last_error=?, updated_at=?
    WHERE id=?
  `).bind(
    finalStatus,
    successes ? now : null,
    JSON.stringify(results),
    errors.length ? errors.join(' | ') : null,
    now,
    id
  ).run();
}

function tiktokConfigured(env) {
  return Boolean(env.DB && env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

async function handleTikTokCallback(url, env) {
  if (!tiktokConfigured(env)) return new Response('TikTok is not configured.', { status: 503 });
  const state = url.searchParams.get('state') || '';
  if (!(await verifySignedState(state, env.TIKTOK_CLIENT_SECRET))) return new Response('Invalid or expired TikTok state.', { status: 400 });
  if (url.searchParams.get('error')) {
    console.error('TikTok OAuth error', url.searchParams.get('error'), url.searchParams.get('error_description'));
    return Response.redirect(`${url.origin}/?tiktok=error`, 302);
  }
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect(`${url.origin}/?tiktok=error`, 302);
  try {
    const redirectUri = `${url.origin}/api/tiktok/callback`;
    const token = await exchangeTikTokCode(env, code, redirectUri);
    const profile = await fetchTikTokProfile(token.access_token);
    const now = new Date();
    const accessExpires = new Date(now.getTime() + Number(token.expires_in || 0) * 1000).toISOString();
    const refreshExpires = new Date(now.getTime() + Number(token.refresh_expires_in || 0) * 1000).toISOString();
    await env.DB.prepare(`
      INSERT INTO tiktok_account
        (id, open_id, display_name, avatar_url, access_token_encrypted, refresh_token_encrypted,
         access_token_expires_at, refresh_token_expires_at, scopes, created_at, updated_at)
      VALUES ('tiktok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        open_id=excluded.open_id, display_name=excluded.display_name, avatar_url=excluded.avatar_url,
        access_token_encrypted=excluded.access_token_encrypted, refresh_token_encrypted=excluded.refresh_token_encrypted,
        access_token_expires_at=excluded.access_token_expires_at, refresh_token_expires_at=excluded.refresh_token_expires_at,
        scopes=excluded.scopes, updated_at=excluded.updated_at
    `).bind(
      token.open_id || profile.open_id || null,
      profile.display_name || 'TikTok',
      profile.avatar_url || null,
      await encryptSecret(token.access_token, env.TOKEN_ENCRYPTION_KEY),
      await encryptSecret(token.refresh_token, env.TOKEN_ENCRYPTION_KEY),
      accessExpires,
      refreshExpires,
      token.scope || '',
      now.toISOString(),
      now.toISOString()
    ).run();
    return Response.redirect(`${url.origin}/?tiktok=connected`, 302);
  } catch (err) {
    console.error('TikTok callback error', err);
    const msg = encodeURIComponent(err instanceof Error ? err.message : String(err));
    return Response.redirect(`${url.origin}/?tiktok=error&message=${msg}`, 302);
  }
}

async function tiktokStatus(env) {
  if (!tiktokConfigured(env)) return json({ configured: false, connected: false });
  try {
    const row = await env.DB.prepare(`
      SELECT open_id, display_name, avatar_url, access_token_expires_at, scopes
      FROM tiktok_account WHERE id='tiktok'
    `).first();
    if (!row) return json({ configured: true, connected: false });
    return json({ configured: true, connected: true, account: {
      openId: row.open_id, displayName: row.display_name, avatarUrl: row.avatar_url,
      accessTokenExpiresAt: row.access_token_expires_at, scopes: String(row.scopes || '').split(',').filter(Boolean),
    }, mode: 'draft_upload' });
  } catch (err) {
    return json({ configured: true, connected: false, schemaNeeded: true, error: 'Run the database schema update.' }, { status: 503 });
  }
}

async function exchangeTikTokCode(env, code, redirectUri) {
  const form = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error_description || data.error?.message || data.error || `TikTok token request failed (${r.status}).`);
  if (!data.access_token || !data.refresh_token) throw new Error('TikTok did not return access and refresh tokens.');
  return data;
}

async function refreshTikTokToken(env, row) {
  const refreshToken = await decryptSecret(row.refresh_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
  const form = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error_description || data.error?.message || data.error || `TikTok token refresh failed (${r.status}).`);
  const now = new Date();
  await env.DB.prepare(`
    UPDATE tiktok_account SET access_token_encrypted=?, refresh_token_encrypted=?,
      access_token_expires_at=?, refresh_token_expires_at=?, scopes=?, updated_at=? WHERE id='tiktok'
  `).bind(
    await encryptSecret(data.access_token, env.TOKEN_ENCRYPTION_KEY),
    await encryptSecret(data.refresh_token || refreshToken, env.TOKEN_ENCRYPTION_KEY),
    new Date(now.getTime() + Number(data.expires_in || 0) * 1000).toISOString(),
    new Date(now.getTime() + Number(data.refresh_expires_in || 0) * 1000).toISOString(),
    data.scope || row.scopes || '',
    now.toISOString()
  ).run();
  return data.access_token;
}

async function getTikTokAccessToken(env) {
  if (!tiktokConfigured(env)) throw new Error('TikTok is not configured.');
  const row = await env.DB.prepare(`
    SELECT access_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at, scopes
    FROM tiktok_account WHERE id='tiktok'
  `).first();
  if (!row) throw new Error('TikTok is not connected.');
  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (expiresAt && expiresAt - Date.now() < 5 * 60 * 1000) return refreshTikTokToken(env, row);
  return decryptSecret(row.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
}

async function fetchTikTokProfile(accessToken) {
  const u = new URL('https://open.tiktokapis.com/v2/user/info/');
  u.searchParams.set('fields', 'open_id,avatar_url,display_name');
  const r = await fetch(u, { headers:{ authorization:`Bearer ${accessToken}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error?.code && data.error.code !== 'ok') throw new Error(data.error?.message || 'Could not load TikTok profile.');
  return data.data?.user || {};
}

async function uploadTikTokDraft(env, post) {
  if (!post.media_key) throw new Error('TikTok requires a photo or video.');
  const token = await getTikTokAccessToken(env);
  const mediaUrl = publicMediaUrl(env, post.media_key);
  const isVideo = String(post.media_type || '').startsWith('video/');
  const isImage = String(post.media_type || '').startsWith('image/');
  if (!isVideo && !isImage) throw new Error('Unsupported TikTok media type.');

  let endpoint;
  let body;
  if (isVideo) {
    endpoint = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
    body = { source_info: { source:'PULL_FROM_URL', video_url:mediaUrl } };
  } else {
    endpoint = 'https://open.tiktokapis.com/v2/post/publish/content/init/';
    body = {
      post_info: {
        title: String(post.caption || '').split(/\n+/)[0].slice(0, 90),
        description: String(post.caption || '').slice(0, 4000),
      },
      source_info: { source:'PULL_FROM_URL', photo_cover_index:0, photo_images:[mediaUrl] },
      post_mode:'MEDIA_UPLOAD',
      media_type:'PHOTO',
    };
  }
  const r = await fetch(endpoint, {
    method:'POST',
    headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json; charset=UTF-8' },
    body:JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  const errorCode = data.error?.code;
  if (!r.ok || (errorCode && errorCode !== 'ok')) throw new Error(data.error?.message || `TikTok upload failed (${r.status}).`);
  if (!data.data?.publish_id) throw new Error('TikTok did not return a publish ID.');
  return { ok:true, draft:true, publishId:data.data.publish_id, note:'Finish this draft in the TikTok app.' };
}

function threadsConfigured(env) {
  return Boolean(env.DB && env.THREADS_APP_ID && env.THREADS_APP_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

async function clearThreadsAccount(env) {
  if (!env.DB) return;
  await env.DB.prepare('DELETE FROM threads_account').run().catch(() => null);
}

async function handleThreadsDeauthorize(request, env) {
  // Meta sends a signed_request when a user deauthorizes. For this single-account
  // app, deleting the stored Threads account/token is the required cleanup.
  await request.text().catch(() => '');
  await clearThreadsAccount(env);
  return json({ ok:true });
}

async function handleThreadsDelete(request, url, env) {
  // Meta data-deletion callbacks expect a confirmation code and status URL.
  await request.text().catch(() => '');
  await clearThreadsAccount(env);
  const code = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return json({
    url: `${url.origin}/threads-delete-status?code=${encodeURIComponent(code)}`,
    confirmation_code: code,
  });
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch] || ch));
}

async function handleThreadsCallback(url, env) {
  if (!threadsConfigured(env)) return Response.redirect(`${url.origin}/?threads=error`, 302);
  const state=url.searchParams.get('state') || '';
  if (!(await verifySignedState(state, env.THREADS_APP_SECRET))) return new Response('Invalid or expired Threads state.', { status:400 });
  if (url.searchParams.get('error')) return Response.redirect(`${url.origin}/?threads=error`,302);
  const code=url.searchParams.get('code'); if(!code) return Response.redirect(`${url.origin}/?threads=error`,302);
  try {
    const redirectUri=`${url.origin}/api/threads/callback`;
    const short=await exchangeThreadsCode(env, code, redirectUri);
    const long=await exchangeThreadsLongLived(env, short.access_token);
    const token=long.access_token || short.access_token;
    const expires=Number(long.expires_in || 3600);
    const profile=await fetchThreadsProfile(token);
    const now=new Date();
    await env.DB.prepare(`
      INSERT INTO threads_account (id,user_id,username,access_token_encrypted,access_token_expires_at,scopes,created_at,updated_at)
      VALUES ('threads',?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,username=excluded.username,access_token_encrypted=excluded.access_token_encrypted,
        access_token_expires_at=excluded.access_token_expires_at,scopes=excluded.scopes,updated_at=excluded.updated_at
    `).bind(
      String(profile.id || short.user_id || ''), profile.username || null,
      await encryptSecret(token, env.TOKEN_ENCRYPTION_KEY), new Date(now.getTime()+expires*1000).toISOString(),
      'threads_basic,threads_content_publish', now.toISOString(), now.toISOString()
    ).run();
    return Response.redirect(`${url.origin}/?threads=connected`,302);
  } catch(err) {
    console.error('Threads callback error',err); const msg=encodeURIComponent(err instanceof Error ? err.message : String(err));
    return Response.redirect(`${url.origin}/?threads=error&message=${msg}`,302);
  }
}

async function threadsStatus(env) {
  if (!threadsConfigured(env)) return json({ configured:false, connected:false });
  try {
    const row=await env.DB.prepare(`SELECT user_id,username,access_token_expires_at,scopes FROM threads_account WHERE id='threads'`).first();
    if(!row) return json({ configured:true, connected:false });
    return json({ configured:true, connected:true, account:{ userId:row.user_id, username:row.username, accessTokenExpiresAt:row.access_token_expires_at, scopes:String(row.scopes||'').split(',').filter(Boolean) } });
  } catch { return json({ configured:true, connected:false, schemaNeeded:true, error:'Run the database schema update.' }, { status:503 }); }
}

async function exchangeThreadsCode(env, code, redirectUri) {
  const form=new URLSearchParams({ client_id:env.THREADS_APP_ID, client_secret:env.THREADS_APP_SECRET, grant_type:'authorization_code', redirect_uri:redirectUri, code });
  const r=await fetch('https://graph.threads.net/oauth/access_token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});
  const data=await r.json().catch(()=>({})); if(!r.ok || !data.access_token) throw new Error(data.error_message || data.error?.message || 'Threads token exchange failed.'); return data;
}
async function exchangeThreadsLongLived(env, shortToken) {
  const u=new URL('https://graph.threads.net/access_token'); u.searchParams.set('grant_type','th_exchange_token'); u.searchParams.set('client_secret',env.THREADS_APP_SECRET); u.searchParams.set('access_token',shortToken);
  const r=await fetch(u); const data=await r.json().catch(()=>({})); if(!r.ok || !data.access_token) throw new Error(data.error_message || data.error?.message || 'Threads long-lived token exchange failed.'); return data;
}
async function refreshThreadsToken(env, row) {
  const token=await decryptSecret(row.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
  const u=new URL('https://graph.threads.net/refresh_access_token'); u.searchParams.set('grant_type','th_refresh_token'); u.searchParams.set('access_token',token);
  const r=await fetch(u); const data=await r.json().catch(()=>({})); if(!r.ok || !data.access_token) throw new Error(data.error_message || data.error?.message || 'Threads token refresh failed.');
  const now=new Date(); await env.DB.prepare(`UPDATE threads_account SET access_token_encrypted=?,access_token_expires_at=?,updated_at=? WHERE id='threads'`).bind(await encryptSecret(data.access_token,env.TOKEN_ENCRYPTION_KEY),new Date(now.getTime()+Number(data.expires_in||5184000)*1000).toISOString(),now.toISOString()).run(); return data.access_token;
}
async function getThreadsAccessToken(env) {
  const row=await env.DB.prepare(`SELECT access_token_encrypted,access_token_expires_at FROM threads_account WHERE id='threads'`).first(); if(!row) throw new Error('Threads is not connected.');
  const exp=row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0; if(exp && exp-Date.now()<7*24*60*60*1000) return refreshThreadsToken(env,row); return decryptSecret(row.access_token_encrypted,env.TOKEN_ENCRYPTION_KEY);
}
async function fetchThreadsProfile(token) {
  const u=new URL('https://graph.threads.net/v1.0/me'); u.searchParams.set('fields','id,username'); u.searchParams.set('access_token',token); const r=await fetch(u); const data=await r.json().catch(()=>({})); if(!r.ok || !data.id) throw new Error(data.error?.message || 'Could not load Threads profile.'); return data;
}
async function publishThreads(env, post) {
  if(!threadsConfigured(env)) throw new Error('Threads is not configured.');
  const row=await env.DB.prepare(`SELECT user_id FROM threads_account WHERE id='threads'`).first(); if(!row?.user_id) throw new Error('Threads is not connected.');
  const token=await getThreadsAccessToken(env); const create=new URLSearchParams(); create.set('access_token',token); create.set('text',post.caption);
  if(post.media_key) { const mediaUrl=publicMediaUrl(env,post.media_key); if(String(post.media_type||'').startsWith('video/')){create.set('media_type','VIDEO');create.set('video_url',mediaUrl);} else if(String(post.media_type||'').startsWith('image/')){create.set('media_type','IMAGE');create.set('image_url',mediaUrl);} else throw new Error('Unsupported Threads media type.'); } else create.set('media_type','TEXT');
  const created=await threadsGraphPost(`https://graph.threads.net/v1.0/${row.user_id}/threads`,create); if(!created.id) throw new Error('Threads did not return a container ID.');
  await waitForThreadsContainer(created.id,token); const publish=new URLSearchParams({access_token:token,creation_id:created.id}); const out=await threadsGraphPost(`https://graph.threads.net/v1.0/${row.user_id}/threads_publish`,publish); return {ok:true,id:out.id||null,containerId:created.id};
}
async function waitForThreadsContainer(id,token) {
  for(let i=0;i<15;i++){ const u=new URL(`https://graph.threads.net/v1.0/${id}`); u.searchParams.set('fields','status,error_message');u.searchParams.set('access_token',token); const r=await fetch(u); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error?.message || 'Could not check Threads media status.'); if(['FINISHED','PUBLISHED'].includes(data.status)) return; if(['ERROR','EXPIRED'].includes(data.status)) throw new Error(data.error_message || `Threads media status: ${data.status}`); await sleep(2000); } throw new Error('Threads is still processing the media. Retry the post in a moment.');
}
async function threadsGraphPost(endpoint, form) { const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form}); const data=await r.json().catch(()=>({})); if(!r.ok || data.error) throw new Error(data.error?.message || data.error_message || `Threads request failed (${r.status}).`); return data; }

async function publishFacebook(env, post) {
  const account = await loadSocialAccount(env, 'facebook');
  if (!account) throw new Error('Facebook is not connected.');
  const token = await decryptSecret(account.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
  const version = env.META_GRAPH_VERSION || 'v24.0';
  let endpoint;
  const form = new URLSearchParams();
  form.set('access_token', token);

  if (post.media_key) {
    const mediaUrl = publicMediaUrl(env, post.media_key);
    if (String(post.media_type || '').startsWith('video/')) {
      endpoint = `https://graph-video.facebook.com/${version}/${account.external_account_id}/videos`;
      form.set('file_url', mediaUrl);
      form.set('description', post.caption);
      form.set('published', 'true');
    } else {
      endpoint = `https://graph.facebook.com/${version}/${account.external_account_id}/photos`;
      form.set('url', mediaUrl);
      form.set('caption', post.caption);
      form.set('published', 'true');
    }
  } else {
    endpoint = `https://graph.facebook.com/${version}/${account.external_account_id}/feed`;
    form.set('message', post.caption);
  }

  const data = await graphPost(endpoint, form);
  return { ok: true, id: data.post_id || data.id || null };
}

async function publishFacebookReel(env, post) {
  const account = await loadSocialAccount(env, 'facebook');
  if (!account) throw new Error('Facebook is not connected.');
  if (!post.media_key || !String(post.media_type || '').startsWith('video/')) throw new Error('Facebook Reel requires a video.');
  const token = await decryptSecret(account.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
  const version = env.META_GRAPH_VERSION || 'v24.0';
  const mediaUrl = publicMediaUrl(env, post.media_key);

  const startForm = new URLSearchParams();
  startForm.set('access_token', token);
  startForm.set('upload_phase', 'start');
  const started = await graphPost(`https://graph.facebook.com/${version}/me/video_reels`, startForm);
  if (!started.video_id || !started.upload_url) throw new Error('Facebook did not return a Reel upload session.');

  const uploadResponse = await fetch(started.upload_url, {
    method:'POST',
    headers:{
      'Authorization':`OAuth ${token}`,
      'file_url':mediaUrl,
      'User-Agent':'RickParma-SocialPublisher/0.6.6',
    },
  });
  const uploaded = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || uploaded.success === false || uploaded.error) {
    throw new Error(uploaded.error?.message || 'Facebook Reel upload failed.');
  }

  const finishForm = new URLSearchParams();
  finishForm.set('access_token', token);
  finishForm.set('video_id', started.video_id);
  finishForm.set('upload_phase', 'finish');
  finishForm.set('video_state', 'PUBLISHED');
  finishForm.set('description', post.caption);
  const finished = await graphPost(`https://graph.facebook.com/${version}/me/video_reels`, finishForm);
  return { ok:true, id:finished.id || started.video_id, videoId:started.video_id, type:'reel' };
}

async function publishInstagram(env, post, publishType = 'post') {
  const account = await loadSocialAccount(env, 'instagram');
  if (!account) throw new Error('Instagram is not connected to the selected Facebook Page.');
  if (!post.media_key) throw new Error('Instagram requires a photo or video.');
  const token = await decryptSecret(account.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);
  const version = env.META_GRAPH_VERSION || 'v24.0';
  const mediaUrl = publicMediaUrl(env, post.media_key);
  const isVideo = String(post.media_type || '').startsWith('video/');
  const isImage = String(post.media_type || '').startsWith('image/');
  if (!isVideo && !isImage) throw new Error('Unsupported Instagram media type.');
  if (isImage && post.media_type !== 'image/jpeg') throw new Error('Instagram image publishing requires JPEG. Re-select the image so the app can convert it.');
  if (publishType === 'post' && !isImage) throw new Error('Instagram Post currently requires a photo. Choose Reel for video.');
  if (publishType === 'reel' && !isVideo) throw new Error('Instagram Reel requires a video.');

  const createForm = new URLSearchParams();
  createForm.set('access_token', token);
  if (publishType !== 'story') createForm.set('caption', post.caption);
  const igOptions = normalizeInstagramOptions(post.instagram_options);
  if (publishType !== 'story' && igOptions.collaborators.length) {
    createForm.set('collaborators', JSON.stringify(igOptions.collaborators));
  }
  if (publishType !== 'story' && igOptions.userTags.length) {
    const tags = publishType === 'post'
      ? igOptions.userTags.map(tag => ({ username:tag.username, x:tag.x, y:tag.y }))
      : igOptions.userTags.map(tag => ({ username:tag.username }));
    createForm.set('user_tags', JSON.stringify(tags));
  }
  if (publishType === 'story') {
    createForm.set('media_type', 'STORIES');
    if (isVideo) createForm.set('video_url', mediaUrl); else createForm.set('image_url', mediaUrl);
  } else if (publishType === 'reel') {
    createForm.set('media_type', 'REELS');
    createForm.set('video_url', mediaUrl);
    createForm.set('share_to_feed', 'true');
    if (igOptions.audioName) createForm.set('audio_name', igOptions.audioName);
  } else {
    createForm.set('image_url', mediaUrl);
  }

  const created = await graphPost(`https://graph.facebook.com/${version}/${account.external_account_id}/media`, createForm);
  if (!created.id) throw new Error('Instagram did not return a media container ID.');
  await waitForInstagramContainer(version, created.id, token, { video: isVideo });
  const publishForm = new URLSearchParams();
  publishForm.set('access_token', token);
  publishForm.set('creation_id', created.id);
  const published = await graphPost(`https://graph.facebook.com/${version}/${account.external_account_id}/media_publish`, publishForm);
  return { ok:true, id:published.id || null, containerId:created.id, type:publishType };
}

async function waitForInstagramContainer(version, containerId, token, { video = false } = {}) {
  // Meta video containers (Reels and video Stories) are asynchronous and may
  // need several minutes. Meta recommends checking roughly once per minute for
  // no more than five minutes. Images remain on the faster polling path.
  const attempts = video ? 6 : 12;
  const intervalMs = video ? 60_000 : 1_500;
  for (let i = 0; i < attempts; i++) {
    const u = new URL(`https://graph.facebook.com/${version}/${containerId}`);
    u.searchParams.set('fields', 'status_code,status');
    u.searchParams.set('access_token', token);
    const r = await fetch(u);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Could not check Instagram media status.');
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'PUBLISHED') return;
    if (['ERROR', 'EXPIRED'].includes(data.status_code)) throw new Error(data.status || `Instagram media status: ${data.status_code}`);
    if (i < attempts - 1) await sleep(intervalMs);
  }
  throw new Error('Instagram video is still processing after five minutes. Confirm the video meets Reel requirements, then tap Retry.');
}

async function graphPost(endpoint, form) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error?.message || `Meta request failed (${r.status}).`);
  return data;
}

async function loadSocialAccount(env, platform) {
  return env.DB.prepare(`
    SELECT platform, external_account_id, parent_account_id, access_token_encrypted
    FROM social_accounts WHERE platform=?
  `).bind(platform).first();
}

function publicMediaUrl(env, key) {
  const base = String(env.APP_BASE_URL || '').replace(/\/$/, '');
  if (!base || !/^https:\/\//i.test(base)) throw new Error('APP_BASE_URL must be set to the deployed HTTPS app URL.');
  return `${base}/media/${encodeURIComponent(key)}`;
}

function sanitizeMediaKey(key) {
  if (!key || key.length > 180) return '';
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return '';
  return key;
}

function normalizeInstagramUsername(value = '') {
  const username = String(value || '').trim().replace(/^@+/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(username) ? username : '';
}

function normalizeInstagramOptions(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const audioName = String(raw.audioName || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const collaborators = Array.isArray(raw.collaborators)
    ? [...new Map(raw.collaborators.map(v => normalizeInstagramUsername(v)).filter(Boolean).map(v => [v.toLowerCase(), v])).values()].slice(0, 3)
    : [];
  const userTags = Array.isArray(raw.userTags)
    ? [...new Map(raw.userTags.map(tag => {
        const username = normalizeInstagramUsername(tag?.username);
        if (!username) return null;
        const out = { username };
        const x = Number(tag?.x), y = Number(tag?.y);
        if (Number.isFinite(x)) out.x = x;
        if (Number.isFinite(y)) out.y = y;
        return [username.toLowerCase(), out];
      }).filter(Boolean)).values()].slice(0, 20)
    : [];
  return { userTags, collaborators, audioName };
}

function validateInstagramOptions(value, platforms = [], mediaType = '') {
  const hasInstagram = platforms.some(p => p === 'instagram' || String(p).startsWith('instagram_'));
  if (!hasInstagram || !value) return { value:null };
  const rawTags = Array.isArray(value.userTags) ? value.userTags : [];
  const rawCollabs = Array.isArray(value.collaborators) ? value.collaborators : [];
  const rawAudioName = String(value.audioName || '').trim();
  if (rawAudioName.length > 100) return { error:'Instagram Reel audio name must be 100 characters or fewer.' };
  if (rawTags.length > 20) return { error:'Instagram supports up to 20 profile tags.' };
  if (rawCollabs.length > 3) return { error:'Instagram supports up to 3 collaborators.' };
  for (const tag of rawTags) if (!normalizeInstagramUsername(tag?.username)) return { error:'One of the Instagram tag usernames is invalid.' };
  for (const username of rawCollabs) if (!normalizeInstagramUsername(username)) return { error:'One of the Instagram collaborator usernames is invalid.' };
  const options = normalizeInstagramOptions(value);
  const isPhotoPost = platforms.includes('instagram_post') && String(mediaType || '').startsWith('image/');
  if (isPhotoPost) {
    for (const tag of options.userTags) {
      if (!Number.isFinite(tag.x) || !Number.isFinite(tag.y) || tag.x < 0 || tag.x > 1 || tag.y < 0 || tag.y > 1) {
        return { error:`Place @${tag.username} on the Instagram photo before publishing.` };
      }
    }
  }
  if (platforms.includes('instagram_story')) return { value:null };
  if (!platforms.includes('instagram_reel')) options.audioName = '';
  return { value:options.userTags.length || options.collaborators.length || options.audioName ? options : null };
}

function parsePost(row) {
  return {
    ...row,
    platforms: safeJson(row.platforms, []),
    publish_results: safeJson(row.publish_results, null),
    instagram_options: safeJson(row.instagram_options, null),
  };
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

async function createSignedState(secret) {
  const payload = `${Date.now()}:${crypto.randomUUID()}`;
  const sig = await hmac(payload, secret);
  return `${base64Url(new TextEncoder().encode(payload))}.${sig}`;
}

async function verifySignedState(value, secret) {
  try {
    const [payload64, supplied] = value.split('.');
    if (!payload64 || !supplied) return false;
    const payload = new TextDecoder().decode(base64UrlDecode(payload64));
    const [timestamp] = payload.split(':');
    if (!timestamp || Date.now() - Number(timestamp) > 10 * 60 * 1000) return false;
    const expected = await hmac(payload, secret);
    return constantTimeEqual(expected, supplied);
  } catch { return false; }
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return base64Url(new Uint8Array(sig));
}

function constantTimeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function encryptSecret(value, secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(cipher))}`;
}

async function decryptSecret(value, secret) {
  const [iv64, cipher64] = String(value || '').split('.');
  if (!iv64 || !cipher64) throw new Error('Stored access token is invalid.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlDecode(iv64) }, key, base64UrlDecode(cipher64));
  return new TextDecoder().decode(plain);
}

function base64Url(bytes) {
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
