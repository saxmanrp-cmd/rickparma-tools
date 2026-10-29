import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker.js';

const adminHeaders = { 'X-Admin-Token': 'test-admin' };

function env() {
  return {
    ADMIN_TOKEN: 'test-admin',
    PAYMENT_HUB_TOKEN: 'test-payment',
    openai_api_key: 'test-openai',
    SUBSCRIBERS_KV: {
      async get() { return null; },
      async put() {},
    },
  };
}

function calendarPayload() {
  return {
    items: [{
      id: 'show-1',
      summary: 'Rick Parma Live',
      location: 'The Smith Center',
      start: { dateTime: '2026-11-14T19:00:00-08:00' },
      end: { dateTime: '2026-11-14T21:00:00-08:00' },
      htmlLink: 'https://calendar.google.com/show-1',
    }],
  };
}

test('calendar endpoint returns normalized upcoming RickParma.com events', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /googleapis\.com\/calendar\/v3/);
    return Response.json(calendarPayload());
  };
  try {
    const response = await worker.fetch(new Request('https://sms-blast.test/api/ai-writer/calendar', { headers: adminHeaders }), env(), {});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.events[0], {
      id: 'show-1',
      title: 'Rick Parma Live',
      location: 'The Smith Center',
      description: '',
      start: '2026-11-14T19:00:00-08:00',
      end: '2026-11-14T21:00:00-08:00',
      url: 'https://calendar.google.com/show-1',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI draft fetches the selected event server-side and uses the Responses API', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('googleapis.com')) return Response.json(calendarPayload());
    if (String(url).includes('api.openai.com')) {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'gpt-5-mini');
      assert.equal(body.store, false);
      assert.match(body.input, /The Smith Center/);
      assert.match(body.input, /Make it upbeat/);
      return Response.json({ output: [{ content: [{ type: 'output_text', text: 'Hey {{first_name}}! Join me at The Smith Center.' }] }] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const response = await worker.fetch(new Request('https://sms-blast.test/api/ai-writer/draft', {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: 'show-1', prompt: 'Make it upbeat' }),
    }), env(), {});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).draft, 'Hey {{first_name}}! Join me at The Smith Center.');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('prompt-only drafts do not require a calendar request', async () => {
  const originalFetch = globalThis.fetch;
  let calendarCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('googleapis.com')) calendarCalls++;
    const body = JSON.parse(options.body);
    assert.match(body.input, /holiday party bookings/);
    return Response.json({ output_text: 'Now booking holiday parties. Reply for availability!' });
  };
  try {
    const response = await worker.fetch(new Request('https://sms-blast.test/api/ai-writer/draft', {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Promote holiday party bookings' }),
    }), env(), {});
    assert.equal(response.status, 200);
    assert.equal(calendarCalls, 0);
    assert.equal((await response.json()).draft, 'Now booking holiday parties. Reply for availability!');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI writer remains behind admin authentication', async () => {
  const response = await worker.fetch(new Request('https://sms-blast.test/api/ai-writer/calendar'), env(), {});
  assert.equal(response.status, 401);
});
