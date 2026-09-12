const API_BASE = 'https://api.musixmatch.com/ws/1.1/matcher.track.get';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function clean(value) {
  return String(value || '').trim();
}

function statusMessage(status) {
  if (status === 401) return 'Musixmatch rejected the API key.';
  if (status === 402) return 'This Musixmatch account or plan does not allow this request.';
  if (status === 403) return 'Musixmatch did not allow access to this track.';
  if (status === 404) return 'No Musixmatch match was found for that title and artist.';
  if (status === 429) return 'Musixmatch rate limit reached. Try again shortly.';
  return 'Musixmatch could not complete the request.';
}

async function handleMatch(request, env) {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  const title = clean(url.searchParams.get('title'));
  const artist = clean(url.searchParams.get('artist'));

  if (!title || !artist) {
    return json({ ok: false, error: 'Enter both a song title and artist.' }, 400);
  }

  if (!clean(env?.MUSIXMATCH_API_KEY)) {
    return json({
      ok: false,
      code: 'MUSIXMATCH_KEY_MISSING',
      error: 'Musixmatch API key is not configured yet.'
    }, 503);
  }

  const endpoint = new URL(API_BASE);
  endpoint.searchParams.set('apikey', env.MUSIXMATCH_API_KEY);
  endpoint.searchParams.set('q_track', title);
  endpoint.searchParams.set('q_artist', artist);

  let response;
  try {
    response = await fetch(endpoint, {
      headers: {
        accept: 'application/json',
        'user-agent': 'rick-lyrics-finder/1.0'
      }
    });
  } catch {
    return json({ ok: false, error: 'Could not reach Musixmatch.' }, 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return json({ ok: false, error: 'Musixmatch returned an unreadable response.' }, 502);
  }

  const musixmatchStatus = Number(data?.message?.header?.status_code || response.status || 500);
  const track = data?.message?.body?.track;

  if (musixmatchStatus !== 200 || !track) {
    const status = musixmatchStatus === 404 ? 404 : 502;
    return json({
      ok: false,
      source: 'Musixmatch',
      musixmatchStatus,
      error: statusMessage(musixmatchStatus)
    }, status);
  }

  return json({
    ok: true,
    source: 'Musixmatch',
    title: clean(track.track_name) || title,
    artist: clean(track.artist_name) || artist,
    album: clean(track.album_name),
    hasLyrics: Number(track.has_lyrics || 0) === 1,
    instrumental: Number(track.instrumental || 0) === 1,
    restricted: Number(track.restricted || 0) === 1,
    musixmatchUrl: clean(track.track_share_url)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'rick-lyrics-finder',
        musixmatchConfigured: Boolean(clean(env?.MUSIXMATCH_API_KEY))
      });
    }

    if (url.pathname === '/api/match') {
      return handleMatch(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
