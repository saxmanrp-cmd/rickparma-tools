import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handleSiteCalendarRequest } from '../src/site-calendar.js';
import { validSource } from '../src/content-plan.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('site calendar bridge normalizes Google events and matches website flyers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value.includes('www.googleapis.com/calendar/v3/calendars/')) {
      return new Response(JSON.stringify({ items:[{
        id:'show-123',
        summary:"Easy's Cocktail Lounge",
        location:'ARIA Resort & Casino, Las Vegas, NV',
        description:'Friday night show. Tickets: https://example.com/tickets',
        htmlLink:'https://calendar.google.com/event?eid=test',
        status:'confirmed',
        start:{ dateTime:'2026-09-19T20:00:00-07:00' },
        end:{ dateTime:'2026-09-19T22:00:00-07:00' },
      }] }), { headers:{'content-type':'application/json'} });
    }
    if (value.includes('rickparma.com/flyers.json')) {
      return new Response(JSON.stringify([{ src:'https://rickparma.com/media/easys.mp4', dates:['2026-09-19'] }]), { headers:{'content-type':'application/json'} });
    }
    throw new Error(`Unexpected fetch ${value}`);
  };

  try {
    const response = await handleSiteCalendarRequest(new Request('https://social.test/api/site-calendar/gigs'));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.source, 'google-calendar-api');
    assert.equal(data.events.length, 1);
    assert.equal(data.events[0].title, "Easy's Cocktail Lounge");
    assert.equal(data.events[0].dateKey, '2026-09-19');
    assert.equal(data.events[0].infoUrl, 'https://example.com/tickets');
    assert.equal(data.events[0].flyerSrc, 'https://rickparma.com/media/easys.mp4');
    assert.equal(data.events[0].allDay, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google Calendar campaign sources are accepted by content-plan validation', () => {
  assert.equal(validSource('gig-campaign:gcal:show-123'), 'gig-campaign:gcal:show-123');
  assert.equal(validSource('gig-campaign:gcal:abc_DEF-123'), 'gig-campaign:gcal:abc_DEF-123');
  assert.equal(validSource('gig-campaign:gcal:'), '');
  assert.equal(validSource('gig-campaign:gcal:bad value'), '');
});

test('v0.7.4 client wires Google Calendar shows into Gig Campaigns', () => {
  const backend = read('src/site-calendar.js');
  const entry = read('src/entry.js');
  const client = read('public/calendar-sync.js');
  const smart = read('public/smart-plan.js');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');

  for (const needle of [
    'www.googleapis.com/calendar/v3/calendars/',
    'singleEvents',
    'orderBy',
    'flyers.json',
    'public/basic.ics',
    'rickparma-google-calendar',
  ]) assert.equal(backend.includes(needle), true, `calendar bridge missing ${needle}`);

  assert.equal(entry.includes('handleSiteCalendarRequest'), true);
  assert.equal(entry.includes("url.pathname.startsWith('/api/site-calendar')"), true);
  assert.equal(entry.includes("const VERSION = '0.7.4'"), true);

  for (const needle of [
    'Upcoming from RickParma.com',
    'GOOGLE CALENDAR',
    '/api/site-calendar/gigs',
    '/api/content-plan/generate',
    'gig-campaign:gcal:',
    'Build Campaign',
    'Campaign Ready',
    'flyerSrc',
    'infoUrl',
    'campaignPhases',
  ]) assert.equal(client.includes(needle), true, `calendar sync client missing ${needle}`);

  assert.equal(smart.includes("'/calendar-sync.js','calendar-sync'"), true);
  assert.equal(sw.includes("'/calendar-sync.js'"), true);
  assert.equal(sw.includes('social-publisher-shell-v740'), true);
  assert.equal(pkg.includes('src/site-calendar.js'), true);
  assert.equal(pkg.includes('public/calendar-sync.js'), true);
  assert.equal(pkg.includes('"version": "0.7.4"'), true);
});
