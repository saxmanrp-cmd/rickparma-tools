const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers:{ 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

const allowedStatuses = new Set(['planned','started','done','dismissed']);
const allowedKinds = new Set(['short','photo','video']);

function parseItem(row) {
  return {
    id:row.id,
    weekKey:row.week_key,
    title:row.title,
    kind:row.kind,
    mediaAccept:row.media_accept || 'image/*,video/*',
    captionStarter:row.caption_starter || '',
    why:row.why_text || '',
    scheduledFor:row.scheduled_for || null,
    status:row.status,
    source:row.source,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
  };
}

function cleanText(value, max=500) {
  return String(value || '').trim().slice(0, max);
}

export async function handleContentPlanRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/content-plan')) return null;
  if (!env.DB) return json({ error:'D1 binding DB is not configured.' }, { status:503 });

  if (url.pathname === '/api/content-plan' && request.method === 'GET') {
    const weekKey = cleanText(url.searchParams.get('weekKey'), 20);
    const query = weekKey
      ? env.DB.prepare(`SELECT * FROM content_plan_items WHERE week_key=? ORDER BY scheduled_for, created_at`).bind(weekKey)
      : env.DB.prepare(`SELECT * FROM content_plan_items WHERE status != 'dismissed' ORDER BY scheduled_for, created_at LIMIT 30`);
    const { results = [] } = await query.all();
    return json({ items:results.map(parseItem) });
  }

  if (url.pathname === '/api/content-plan/generate' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const weekKey = cleanText(body.weekKey, 20);
    const items = Array.isArray(body.items) ? body.items.slice(0, 7) : [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return json({ error:'weekKey must be YYYY-MM-DD.' }, { status:400 });
    if (!items.length) return json({ error:'At least one content-plan item is required.' }, { status:400 });

    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare(`DELETE FROM content_plan_items WHERE week_key=? AND status='planned'`).bind(weekKey),
    ];
    const created = [];

    for (const raw of items) {
      const title = cleanText(raw.title, 160);
      const kind = cleanText(raw.kind, 20);
      const captionStarter = cleanText(raw.captionStarter, 2200);
      if (!title || !captionStarter || !allowedKinds.has(kind)) continue;
      const id = crypto.randomUUID();
      const mediaAccept = cleanText(raw.mediaAccept, 80) || 'image/*,video/*';
      const why = cleanText(raw.why, 700);
      const scheduledFor = raw.scheduledFor && !Number.isNaN(new Date(raw.scheduledFor).getTime()) ? new Date(raw.scheduledFor).toISOString() : null;
      statements.push(env.DB.prepare(`
        INSERT INTO content_plan_items
          (id, week_key, title, kind, media_accept, caption_starter, why_text, scheduled_for, status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', 'weekly-planner', ?, ?)
      `).bind(id, weekKey, title, kind, mediaAccept, captionStarter, why, scheduledFor, now, now));
      created.push({ id, weekKey, title, kind, mediaAccept, captionStarter, why, scheduledFor, status:'planned', source:'weekly-planner', createdAt:now, updatedAt:now });
    }

    if (!created.length) return json({ error:'No valid content-plan items were supplied.' }, { status:400 });
    await env.DB.batch(statements);
    return json({ ok:true, items:created }, { status:201 });
  }

  const itemMatch = url.pathname.match(/^\/api\/content-plan\/([^/]+)$/);
  if (itemMatch && request.method === 'PATCH') {
    const body = await request.json().catch(() => ({}));
    const status = cleanText(body.status, 20);
    if (!allowedStatuses.has(status)) return json({ error:'Invalid content-plan status.' }, { status:400 });
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`UPDATE content_plan_items SET status=?, updated_at=? WHERE id=?`)
      .bind(status, now, decodeURIComponent(itemMatch[1])).run();
    if (!result?.meta?.changes) return json({ error:'Content-plan item not found.' }, { status:404 });
    return json({ ok:true, status });
  }

  if (url.pathname === '/api/content-plan/clear' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const weekKey = cleanText(body.weekKey, 20);
    if (!weekKey) return json({ error:'weekKey is required.' }, { status:400 });
    await env.DB.prepare(`DELETE FROM content_plan_items WHERE week_key=? AND status='planned'`).bind(weekKey).run();
    return json({ ok:true });
  }

  return json({ error:'Content-plan route not found.' }, { status:404 });
}
