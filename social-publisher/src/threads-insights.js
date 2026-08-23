export const THREADS_INSIGHTS_SCOPE = 'threads_manage_insights';

function isThreadsAuthorizeUrl(url) {
  return /(^|\.)threads\.net$/i.test(url.hostname) && url.pathname.includes('/oauth/authorize');
}

export function addThreadsInsightsScope(response) {
  if (!response || response.status < 300 || response.status >= 400) return response;
  const location = response.headers.get('location');
  if (!location) return response;

  let authUrl;
  try { authUrl = new URL(location); }
  catch { return response; }
  if (!isThreadsAuthorizeUrl(authUrl)) return response;

  const scopes = new Set(
    String(authUrl.searchParams.get('scope') || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );
  scopes.add(THREADS_INSIGHTS_SCOPE);
  authUrl.searchParams.set('scope', [...scopes].join(','));

  const headers = new Headers(response.headers);
  headers.set('location', authUrl.toString());
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isSuccessfulThreadsCallback(response) {
  if (!response || response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get('location') || '';
  try {
    return new URL(location).searchParams.get('threads') === 'connected';
  } catch {
    return false;
  }
}

export async function persistThreadsInsightsScope(response, env) {
  if (!isSuccessfulThreadsCallback(response) || !env?.DB) return false;

  const row = await env.DB.prepare("SELECT scopes FROM threads_account WHERE id='threads'").first().catch(() => null);
  if (!row) return false;

  const scopes = new Set(
    String(row.scopes || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );
  scopes.add(THREADS_INSIGHTS_SCOPE);
  const nextScopes = [...scopes].join(',');

  await env.DB.prepare("UPDATE threads_account SET scopes=?, updated_at=? WHERE id='threads'")
    .bind(nextScopes, new Date().toISOString())
    .run();
  return true;
}
