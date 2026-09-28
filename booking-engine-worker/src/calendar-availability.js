const CALENDAR_ID = 'ee79e1557e817dd0e6986fac5545e97cf36f3a9537862731c7e9adc12ea58186@group.calendar.google.com';
const TIMEZONE = 'America/Los_Angeles';

function unfoldIcs(text = '') {
  return String(text).replace(/\r?\n[ \t]/g, '');
}

function decodeIcs(value = '') {
  return String(value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsDate(value = '') {
  const raw = String(value).trim();
  if (/^\d{8}$/.test(raw)) {
    return { iso: `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T00:00:00`, allDay: true };
  }
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss = '00', z] = match;
  return { iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}${z ? 'Z' : ''}`, allDay: false };
}

async function fetchEvents() {
  const endpoint = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
  const response = await fetch(endpoint, {
    headers: { accept: 'text/calendar' },
    cf: { cacheTtl: 120 }
  });
  if (!response.ok) throw new Error(`Rick calendar returned ${response.status}.`);
  const text = unfoldIcs(await response.text());
  return text.split('BEGIN:VEVENT').slice(1).map(block => block.split('END:VEVENT')[0]).map(block => {
    const fields = {};
    for (const line of block.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const left = line.slice(0, colon);
      const key = left.split(';')[0].toUpperCase();
      if (!(key in fields)) fields[key] = line.slice(colon + 1);
    }
    const start = parseIcsDate(fields.DTSTART);
    const end = parseIcsDate(fields.DTEND);
    if (!start) return null;
    return {
      id: decodeIcs(fields.UID || ''),
      title: decodeIcs(fields.SUMMARY || 'Busy'),
      location: decodeIcs(fields.LOCATION || ''),
      start: start.iso,
      end: end?.iso || start.iso,
      allDay: start.allDay
    };
  }).filter(Boolean);
}

function dateKey(date, timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function eventTouchesDate(event, requestedDate) {
  const start = new Date(event.start);
  const end = new Date(event.end || event.start);
  if (Number.isNaN(start.getTime())) return false;
  if (event.allDay) return String(event.start).slice(0, 10) === requestedDate;
  const startKey = dateKey(start);
  // Google end timestamps are exclusive. Subtract a small amount so an event ending
  // at midnight does not mark the next date as busy.
  const endKey = dateKey(new Date(Math.max(start.getTime(), end.getTime() - 1000)));
  return requestedDate >= startKey && requestedDate <= endKey;
}

export function extractIsoDates(value = '') {
  const matches = String(value).match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [];
  return [...new Set(matches)].slice(0, 8);
}

export async function checkRickAvailability(requestedDates = []) {
  const dates = [...new Set((requestedDates || []).flatMap(extractIsoDates))].slice(0, 8);
  if (!dates.length) return { source: 'rick-parma-shows-calendar', dates: [], summary: 'No exact calendar date was identified.' };
  const events = await fetchEvents();
  const results = dates.map(date => {
    const conflicts = events.filter(event => eventTouchesDate(event, date));
    return {
      date,
      status: conflicts.length ? 'busy' : 'looks_open',
      conflicts: conflicts.map(event => ({ title: event.title, start: event.start, end: event.end, location: event.location }))
    };
  });
  const open = results.filter(r => r.status === 'looks_open').map(r => r.date);
  const busy = results.filter(r => r.status === 'busy').map(r => r.date);
  return {
    source: 'rick-parma-shows-calendar',
    checkedAt: new Date().toISOString(),
    timezone: TIMEZONE,
    dates: results,
    summary: [
      open.length ? `Calendar currently looks open: ${open.join(', ')}` : '',
      busy.length ? `Calendar conflict: ${busy.join(', ')}` : ''
    ].filter(Boolean).join(' • ')
  };
}
