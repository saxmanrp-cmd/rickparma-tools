const PREFIX = 'comic-templates/';
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

function toTemplate(object) {
  const meta = object.customMetadata || {};
  const id = object.key.startsWith(PREFIX) ? object.key.slice(PREFIX.length) : object.key;
  return {
    id,
    key:object.key,
    url:publicMediaUrl(object.key),
    name:meta.name || id.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' '),
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

export async function handleComicTemplateRequest(request, env={}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/comic-templates')) return null;
  if (!env.MEDIA) return json({ error:'Media storage is not configured.' }, { status:503 });

  if (url.pathname === '/api/comic-templates' && request.method === 'GET') {
    const listed = await env.MEDIA.list({
      prefix:PREFIX,
      include:['customMetadata','httpMetadata'],
      limit:100,
    });
    const templates = (listed.objects || [])
      .filter(object => /^image\//i.test(object.httpMetadata?.contentType || '') || /\.(png|jpe?g|webp)$/i.test(object.key))
      .map(toTemplate)
      .sort((a,b) => (a.pairId || a.name).localeCompare(b.pairId || b.name) || a.format.localeCompare(b.format));
    return json({ ok:true, templates });
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
    const customMetadata = {
      name:safeMeta(request.headers.get('x-template-name') || id.replace(/\.[^.]+$/,'')),
      pairId:safeMeta(request.headers.get('x-template-pair') || ''),
      format,
      bubbleX:numberMeta(request.headers.get('x-bubble-x')),
      bubbleY:numberMeta(request.headers.get('x-bubble-y')),
      bubbleWidth:numberMeta(request.headers.get('x-bubble-width')),
      bubbleHeight:numberMeta(request.headers.get('x-bubble-height')),
    };
    await env.MEDIA.put(key, request.body, {
      httpMetadata:{ contentType },
      customMetadata,
    });
    return json({
      ok:true,
      template:{ id, key, url:publicMediaUrl(key), name:customMetadata.name, pairId:customMetadata.pairId, format, bubble:{ x:Number(customMetadata.bubbleX || 0), y:Number(customMetadata.bubbleY || 0), width:Number(customMetadata.bubbleWidth || 0), height:Number(customMetadata.bubbleHeight || 0) } },
    }, { status:201 });
  }

  if (request.method === 'DELETE') {
    await env.MEDIA.delete(PREFIX + id);
    return json({ ok:true, id });
  }

  return json({ error:'Method not allowed.' }, { status:405 });
}
