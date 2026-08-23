const SMS_WORKER = 'https://sms-blast.saxmanrp.workers.dev';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers:{ 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

function cleanEntry(entry={}) {
  return {
    id:String(entry.blastId || entry.id || `${entry.at || ''}-${entry.message || ''}`).slice(0,180),
    at:String(entry.at || ''),
    message:String(entry.message || '').slice(0,2200),
    mediaUrl:String(entry.mediaUrl || '').slice(0,1000),
    segmentLabel:String(entry.segmentLabel || 'Text Blast').slice(0,120),
    sent:Number(entry.sent || 0),
    failed:Number(entry.failed || 0),
  };
}

export async function handleTextBlastRequest(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/text-blast')) return null;

  const token = String(request.headers.get('x-text-blast-token') || '').trim();
  if (!token) return json({ error:'Text Blast password required.' }, { status:401 });

  if ((url.pathname === '/api/text-blast/history' || url.pathname === '/api/text-blast/check') && request.method === 'GET') {
    try {
      const response = await fetch(`${SMS_WORKER}/api/blastlog`, {
        headers:{ 'X-Admin-Token':token, accept:'application/json' },
        cf:{ cacheTtl:0, cacheEverything:false },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json({ error:response.status === 401 || response.status === 403 ? 'Text Blast password is not correct.' : (data.error || 'Could not reach Text Blast.') }, { status:response.status === 401 || response.status === 403 ? 401 : 502 });
      const log = (Array.isArray(data.log) ? data.log : []).map(cleanEntry).sort((a,b) => String(b.at).localeCompare(String(a.at)));
      if (url.pathname === '/api/text-blast/check') return json({ ok:true, connected:true, latest:log[0] || null });
      return json({ ok:true, connected:true, log:log.slice(0,50) });
    } catch {
      return json({ error:'Could not reach Text Blast right now.' }, { status:502 });
    }
  }

  return json({ error:'Not found.' }, { status:404 });
}
