import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function env(overrides = {}) {
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    MUSIXMATCH_API_KEY: 'test-key',
    ...overrides
  };
}

test('health endpoint reports service status', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/health'), env());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'rick-lyrics-finder');
  assert.equal(body.musixmatchConfigured, true);
});

test('match requires title and artist', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/match?title=September'), env());
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
});

test('match refuses to run without a server-side Musixmatch key', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/api/match?title=September&artist=Earth%2C%20Wind%20%26%20Fire'),
    env({ MUSIXMATCH_API_KEY: '' })
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'MUSIXMATCH_KEY_MISSING');
});

test('match returns canonical Musixmatch track metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'api.musixmatch.com');
    assert.equal(url.pathname, '/ws/1.1/matcher.track.get');
    assert.equal(url.searchParams.get('q_track'), 'September');
    assert.equal(url.searchParams.get('q_artist'), 'Earth, Wind & Fire');
    assert.equal(url.searchParams.get('apikey'), 'test-key');

    return new Response(JSON.stringify({
      message: {
        header: { status_code: 200 },
        body: {
          track: {
            track_name: 'September',
            artist_name: 'Earth, Wind & Fire',
            album_name: 'The Best of Earth, Wind & Fire, Vol. 1',
            has_lyrics: 1,
            instrumental: 0,
            restricted: 0,
            track_share_url: 'https://www.musixmatch.com/lyrics/Earth-Wind-Fire/September'
          }
        }
      }
    }), { headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await worker.fetch(
      new Request('https://example.test/api/match?title=September&artist=Earth%2C%20Wind%20%26%20Fire'),
      env()
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.source, 'Musixmatch');
    assert.equal(body.title, 'September');
    assert.equal(body.artist, 'Earth, Wind & Fire');
    assert.equal(body.hasLyrics, true);
    assert.match(body.musixmatchUrl, /^https:\/\/www\.musixmatch\.com\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
