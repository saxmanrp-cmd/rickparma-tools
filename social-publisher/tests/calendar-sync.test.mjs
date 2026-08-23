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

test('site calendar flyer proxy only accepts RickParma.com media', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://rickparma.com/media/easys.jpg');
    return new Response(new Uint8Array([1,2,3]), { headers:{'content-type':'image/jpeg'} });
  };
  try {
    const good = await handleSiteCalendarRequest(new Request('https://social.test/api/site-calendar/flyer?src=https%3A%2F%2Frickparma.com%2Fmedia%2Feasys.jpg'));
    assert.equal(good.status, 200);
    assert.equal(good.headers.get('content-type'), 'image/jpeg');

    const bad = await handleSiteCalendarRequest(new Request('https://social.test/api/site-calendar/flyer?src=https%3A%2F%2Fevil.example%2Fflyer.jpg'));
    assert.equal(bad.status, 400);
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

test('v0.7.6 Calendar is flyer-first with a post-type dropdown', () => {
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
    '/api/site-calendar/flyer',
    'safeFlyerUrl',
  ]) assert.equal(backend.includes(needle), true, `calendar bridge missing ${needle}`);

  assert.equal(entry.includes('handleSiteCalendarRequest'), true);
  assert.equal(entry.includes("url.pathname.startsWith('/api/site-calendar')"), true);
  assert.equal(entry.includes("const VERSION = '0.7.6'"), true);

  for (const needle of [
    'Your upcoming shows',
    'Post the flyer now',
    'Announcement',
    'Reminder',
    'Day of show',
    'Last call',
    'After show / thank you',
    'Build all reminders',
    '/api/site-calendar/flyer',
    'handleMedia(file)',
    '/api/content-plan/generate',
    'gig-campaign:gcal:',
    'campaignPhases',
  ]) assert.equal(client.includes(needle), true, `calendar sync client missing ${needle}`);

  assert.equal(smart.includes("'/calendar-sync.js','calendar-sync'"), true);
  assert.equal(smart.includes("'/flyer-first.js','flyer-first'"), true);
  for (const asset of ['/calendar-sync.js','/easy-mode.js','/flyer-first.js']) assert.equal(sw.includes(`'${asset}'`), true);
  assert.equal(sw.includes('social-publisher-shell-v760'), true);
  for (const pathName of ['src/site-calendar.js','public/calendar-sync.js','public/easy-mode.js','public/flyer-first.js']) assert.equal(pkg.includes(pathName), true);
  assert.equal(pkg.includes('"version": "0.7.6"'), true);
});
