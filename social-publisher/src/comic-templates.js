const PREFIX = 'comic-templates/';
const CATEGORY_KEY = `${PREFIX}_categories.json`;
const DEFAULT_CATEGORY = 'Rick Parma Comics';
const REMOVED_CATEGORIES = new Set(['people talking']);
const MAX_BYTES = 30 * 1024 * 1024;

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers:{ 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

function safeId(value='') {
  return String(value)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,140);
}

function safeMeta(value='', max=120) {
  return String(value || '').trim().slice(0,max);
}

function imageExtension(contentType='') {
  const type = String(contentType).toLowerCase().split(';')[0].trim();
  return ({
    'image/jpeg':'.jpg',
    'image/png':'.png',
    'image/webp':'.webp',
  })[type] || '';
}

function inferFormat(id='', explicit='') {
  const requested = String(explicit || '').toLowerCase();
  if (requested === 'story' || requested === 'feed') return requested;
  const value = String(id).toLowerCase();
  if (/9x16|9-16|story|reel/.test(value)) return 'story';
  if (/4x5|4-5|feed/.test(value)) return 'feed';
  return 'unknown';
}

function numberMeta(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return String(Math.max(0, Math.min(1, n)));
}

function publicMediaUrl(key) {
  return `/media/${encodeURIComponent(key)}`;
}

function normalizeCategories(values=[]) {
  const seen = new Set();
  const categories = [];
  for (const raw of [DEFAULT_CATEGORY, ...values]) {
    const name = safeMeta(raw, 80);
    if (!name) continue;
    const key = name.toLowerCase();
    if (REMOVED_CATEGORIES.has(key) || seen.has(key)) continue;
    seen.add(key);
    categories.push(name);
  }
  return categories;
}

async function readCategories(env) {
  try {
    const object = await env.MEDIA.get(CATEGORY_KEY);
    if (!object) return [DEFAULT_CATEGORY];
    const parsed = JSON.parse(await object.text());
    return normalizeCategories(Array.isArray(parsed) ? parsed : parsed?.categories || []);
  } catch {
    return [DEFAULT_CATEGORY];
  }
}

async function writeCategories(env, categories) {
  const normalized = normalizeCategories(categories);
  await env.MEDIA.put(CATEGORY_KEY, JSON.stringify({ categories:normalized }), {
    httpMetadata:{ contentType:'application/json; charset=utf-8' },
  });
  return normalized;
}

async function ensureCategory(env, raw) {
  const category = safeMeta(raw, 80) || DEFAULT_CATEGORY;
  const categories = await readCategories(env);
  if (!categories.some(name => name.toLowerCase() === category.toLowerCase())) {
    categories.push(category);
    await writeCategories(env, categories);
  }
  return category;
}

function toTemplate(object) {
  const meta = object.customMetadata || {};
  const id = object.key.startsWith(PREFIX) ? object.key.slice(PREFIX.length) : object.key;
  return {
    id,
    key:object.key,
    url:publicMediaUrl(object.key),
    name:meta.name || id.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' '),
    category:meta.category || DEFAULT_CATEGORY,
    pairId:meta.pairId || '',
    format:inferFormat(id, meta.format),
    size:Number(object.size || 0),
    uploadedAt:object.uploaded ? new Date(object.uploaded).toISOString() : null,
    bubble:{
      x:Number(meta.bubbleX || 0),
      y:Number(meta.bubbleY || 0),
      width:Number(meta.bubbleWidth || 0),
      height:Number(meta.bubbleHeight || 0),
    },
  };
}

function customMetadataFromHeaders(request, id, format, category) {
  return {
    name:safeMeta(request.headers.get('x-template-name') || id.replace(/\.[^.]+$/,'')),
    category,
    pairId:safeMeta(request.headers.get('x-template-pair') || ''),
    format,
    bubbleX:numberMeta(request.headers.get('x-bubble-x')),
    bubbleY:numberMeta(request.headers.get('x-bubble-y')),
    bubbleWidth:numberMeta(request.headers.get('x-bubble-width')),
    bubbleHeight:numberMeta(request.headers.get('x-bubble-height')),
  };
}

export async function handleComicTemplateRequest(request, env={}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/comic-templates')) return null;
  if (!env.MEDIA) return json({ error:'Media storage is not configured.' }, { status:503 });

  if (url.pathname === '/api/comic-templates/categories') {
    if (request.method === 'GET') {
      return json({ ok:true, categories:await readCategories(env) });
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const name = safeMeta(body.name, 80);
      if (!name) return json({ error:'Category name is required.' }, { status:400 });
      const categories = await readCategories(env);
      if (!categories.some(category => category.toLowerCase() === name.toLowerCase())) categories.push(name);
      return json({ ok:true, categories:await writeCategories(env, categories), category:name }, { status:201 });
    }
    return json({ error:'Method not allowed.' }, { status:405 });
  }

  if (url.pathname === '/api/comic-templates' && request.method === 'GET') {
    const listed = await env.MEDIA.list({
      prefix:PREFIX,
      include:['customMetadata','httpMetadata'],
      limit:500,
    });
    const templates = (listed.objects || [])
      .filter(object => object.key !== CATEGORY_KEY)
      .filter(object => /^image\//i.test(object.httpMetadata?.contentType || '') || /\.(png|jpe?g|webp)$/i.test(object.key))
      .map(toTemplate)
      .sort((a,b) => a.category.localeCompare(b.category) || (a.pairId || a.name).localeCompare(b.pairId || b.name) || a.format.localeCompare(b.format));
    const categories = normalizeCategories([...(await readCategories(env)), ...templates.map(template => template.category)]);
    return json({ ok:true, templates, categories });
  }

  const match = url.pathname.match(/^\/api\/comic-templates\/([^/]+)$/);
  if (!match) return json({ error:'Not found.' }, { status:404 });

  let id = safeId(decodeURIComponent(match[1] || ''));
  if (!id) return json({ error:'Template name is required.' }, { status:400 });

  if (request.method === 'PUT') {
    const contentType = String(request.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!['image/jpeg','image/png','image/webp'].includes(contentType)) {
      return json({ error:'Comic templates must be JPG, PNG, or WebP images.' }, { status:415 });
    }
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BYTES) return json({ error:'Template image is too large.' }, { status:413 });
    const ext = imageExtension(contentType);
    if (!/\.(png|jpe?g|webp)$/i.test(id)) id += ext;
    const key = PREFIX + id;
    const format = inferFormat(id, request.headers.get('x-template-format'));
    const category = await ensureCategory(env, request.headers.get('x-template-category'));
    const customMetadata = customMetadataFromHeaders(request, id, format, category);
    await env.MEDIA.put(key, request.body, {
      httpMetadata:{ contentType },
      customMetadata,
    });
    return json({ ok:true, template:toTemplate({ key, size:contentLength, uploaded:new Date(), httpMetadata:{contentType}, customMetadata }) }, { status:201 });
  }

  if (request.method === 'PATCH') {
    const key = PREFIX + id;
    const existing = await env.MEDIA.get(key);
    if (!existing) return json({ error:'Template not found.' }, { status:404 });
    const body = await request.json().catch(() => ({}));
    const old = existing.customMetadata || {};
    const category = body.category !== undefined ? await ensureCategory(env, body.category) : (old.category || DEFAULT_CATEGORY);
    const format = body.format !== undefined ? inferFormat(id, body.format) : inferFormat(id, old.format);
    const bubble = body.bubble && typeof body.bubble === 'object' ? body.bubble : {};
    const customMetadata = {
      name:body.name !== undefined ? safeMeta(body.name) : (old.name || id.replace(/\.[^.]+$/,'')),
      category,
      pairId:body.pairId !== undefined ? safeMeta(body.pairId) : (old.pairId || ''),
      format,
      bubbleX:bubble.x !== undefined ? numberMeta(bubble.x) : (old.bubbleX || ''),
      bubbleY:bubble.y !== undefined ? numberMeta(bubble.y) : (old.bubbleY || ''),
      bubbleWidth:bubble.width !== undefined ? numberMeta(bubble.width) : (old.bubbleWidth || ''),
      bubbleHeight:bubble.height !== undefined ? numberMeta(bubble.height) : (old.bubbleHeight || ''),
    };
    const httpMetadata = existing.httpMetadata || { contentType:'application/octet-stream' };
    await env.MEDIA.put(key, existing.body, { httpMetadata, customMetadata });
    return json({ ok:true, template:toTemplate({ key, size:existing.size, uploaded:new Date(), httpMetadata, customMetadata }) });
  }

  if (request.method === 'DELETE') {
    await env.MEDIA.delete(PREFIX + id);
    return json({ ok:true, id });
  }

  return json({ error:'Method not allowed.' }, { status:405 });
}
