const CALENDAR_ID = 'ee79e1557e817dd0e6986fac5545e97cf36f3a9537862731c7e9adc12ea58186@group.calendar.google.com';
const CALENDAR_API_KEY = 'AIzaSyCea0FN28V6xlJtKaKYJhwLI3xa9v8Pr6s';
const SITE_ORIGIN = 'https://rickparma.com';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers:{ 'content-type':'application/json; charset=utf-8', ...(init.headers || {}) },
});

function extractFirstUrl(value='') {
  const match = String(value).match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? match[0].replace(/[.,;!?]+$/, '') : '';
}

function dateKeyFromGoogleStart(start={}) {
  if (start.date) return String(start.date).slice(0,10);
  if (start.dateTime) return String(start.dateTime).slice(0,10);
  return '';
}

function normalizeGoogleEvent(event, flyerMap) {
  const start = event?.start?.dateTime || (event?.start?.date ? `${event.start.date}T12:00:00` : null);
  const end = event?.end?.dateTime || (event?.end?.date ? `${event.end.date}T12:00:00` : null);
  const dateKey = dateKeyFromGoogleStart(event?.start || {});
  const description = String(event?.description || '');
  return {
    id:String(event?.id || ''),
    title:String(event?.summary || 'Show'),
    location:String(event?.location || ''),
    description,
    htmlLink:String(event?.htmlLink || ''),
    start,
    end,
    allDay:!event?.start?.dateTime,
    dateKey,
    infoUrl:extractFirstUrl(description),
    flyerSrc:dateKey ? (flyerMap[dateKey] || '') : '',
    source:'rickparma-google-calendar',
  };
}

async function fetchFlyerMap() {
  try {
    const response = await fetch(`${SITE_ORIGIN}/flyers.json?bust=${Date.now()}`, {
      headers:{ accept:'application/json' },
      cf:{ cacheTtl:60, cacheEverything:false },
    });
    if (!response.ok) return {};
    const flyers = await response.json();
    const map = {};
    for (const flyer of Array.isArray(flyers) ? flyers : []) {
      for (const date of Array.isArray(flyer?.dates) ? flyer.dates : []) {
        if (!map[date] && flyer?.src) map[date] = String(flyer.src);
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function fetchGoogleEvents() {
  const timeMin = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const endpoint = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`);
  endpoint.searchParams.set('key', CALENDAR_API_KEY);
  endpoint.searchParams.set('singleEvents', 'true');
  endpoint.searchParams.set('orderBy', 'startTime');
  endpoint.searchParams.set('maxResults', '40');
  endpoint.searchParams.set('timeMin', timeMin);

  const response = await fetch(endpoint.toString(), {
    headers:{ accept:'application/json', referer:`${SITE_ORIGIN}/` },
    cf:{ cacheTtl:120, cacheEverything:false },
  });
  if (!response.ok) throw new Error(`Google Calendar API returned ${response.status}.`);
  const data = await response.json();
  return Array.isArray(data.items) ? data.items : [];
}

function unfoldIcs(text='') {
  return String(text).replace(/\r?\n[ \t]/g, '');
}

function decodeIcs(value='') {
  return String(value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsDate(value='') {
  const raw = String(value).trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T12:00:00`;
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const [,y,m,d,hh,mm,ss='00',z] = match;
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${z ? 'Z' : ''}`;
}

async function fetchIcsFallback() {
  const endpoint = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
  const response = await fetch(endpoint, { headers:{ accept:'text/calendar' }, cf:{ cacheTtl:120 } });
  if (!response.ok) throw new Error(`Google Calendar ICS returned ${response.status}.`);
  const text = unfoldIcs(await response.text());
  const now = Date.now() - 2 * 60 * 60 * 1000;
  return text.split('BEGIN:VEVENT').slice(1).map(block => block.split('END:VEVENT')[0]).map(block => {
    const fields = {};
    for (const line of block.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const left = line.slice(0,colon);
      const key = left.split(';')[0].toUpperCase();
      if (!(key in fields)) fields[key] = line.slice(colon + 1);
    }
    const start = parseIcsDate(fields.DTSTART);
    const end = parseIcsDate(fields.DTEND);
    const allDay = /^\d{8}$/.test(String(fields.DTSTART || ''));
    const dateKey = start ? start.slice(0,10) : '';
    return {
      id:decodeIcs(fields.UID || crypto.randomUUID()),
      title:decodeIcs(fields.SUMMARY || 'Show'),
      location:decodeIcs(fields.LOCATION || ''),
      description:decodeIcs(fields.DESCRIPTION || ''),
      htmlLink:decodeIcs(fields.URL || ''),
      start,
      end,
      allDay,
      dateKey,
      infoUrl:extractFirstUrl(decodeIcs(fields.DESCRIPTION || '')),
      flyerSrc:'',
      source:'rickparma-google-calendar-ics',
    };
  }).filter(event => event.start && new Date(event.end || event.start).getTime() >= now)
    .sort((a,b) => String(a.start).localeCompare(String(b.start)))
    .slice(0,40);
}

export async function handleSiteCalendarRequest(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/site-calendar/gigs' || request.method !== 'GET') return null;

  const flyerMap = await fetchFlyerMap();
  try {
    const events = (await fetchGoogleEvents())
      .filter(event => event?.status !== 'cancelled')
      .map(event => normalizeGoogleEvent(event, flyerMap))
      .filter(event => event.start);
    return json({ ok:true, source:'google-calendar-api', calendar:'Rick Parma Shows', events });
  } catch (apiError) {
    try {
      const events = (await fetchIcsFallback()).map(event => ({
        ...event,
        flyerSrc:event.dateKey ? (flyerMap[event.dateKey] || '') : '',
      }));
      return json({ ok:true, source:'google-calendar-ics', calendar:'Rick Parma Shows', events, warning:apiError.message });
    } catch (icsError) {
      return json({ error:'Could not load the Rick Parma Shows calendar.', details:[apiError.message, icsError.message] }, { status:502 });
    }
  }
}
