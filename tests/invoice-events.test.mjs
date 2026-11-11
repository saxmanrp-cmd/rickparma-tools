import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../invoice-creator.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function app() {
  const elements = new Map();
  let calendarBlob;
  let googleCalendarURL;
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', style: {}, textContent: '', className: '', classList: { toggle() {} } });
      return elements.get(id);
    }
  };
  const context = vm.createContext({
    URLSearchParams, Blob, location: { search: '' }, document,
    URL: { createObjectURL(blob) { calendarBlob = blob; return 'blob:test'; }, revokeObjectURL() {} },
    window: { open(url) { googleCalendarURL = url; }, location: {} },
    setTimeout() {}, alert(message) { throw new Error(message); }
  });
  vm.runInContext(script.slice(0, script.indexOf('if (signId) {')), context);
  return {
    context, elements, events: () => JSON.parse(vm.runInContext('JSON.stringify(events)', context)),
    calendarBlob: () => calendarBlob, googleCalendarURL: () => googleCalendarURL
  };
}

function firstLocation(context) {
  vm.runInContext(`events = [{ ...blankEvent(), eventName: 'Jazz night', venueName: 'The Lounge',
    addrStreet: '123 Main St', addrCity: 'Las Vegas', eventDate: '2026-12-01',
    timeStart: '19:00', timeEnd: '21:00', perfType: 'Singer/Saxophonist',
    description: 'Two sets', amount: '800' }];`, context);
  context.renderEvents();
}

test('one location has multiple independently priced dates and per-date All Day settings', () => {
  const { context, elements, events } = app();
  firstLocation(context);
  assert.doesNotMatch(elements.get('event-entries').innerHTML, /Use Previous/);
  assert.match(html, /onclick="addLocation\(\)">\+ Add Location/);
  context.addDate(0);
  vm.runInContext("events[1].eventDate = '2026-12-02';", context);
  context.toggleAllDay(1, true);
  assert.equal(events()[0].locationId, events()[1].locationId);
  assert.equal(events()[1].venueName, 'The Lounge');
  assert.equal(events()[1].eventDate, '2026-12-02');
  assert.equal(events()[1].allDay, true);
  assert.equal(events()[0].allDay, false);
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $1600.00');
  assert.match(elements.get('event-entries').innerHTML, /id="all-day-1" type="checkbox" checked/);
  assert.match(elements.get('event-entries').innerHTML, /onclick="addDate\(0\)">\+ Add Date/);
  context.setLocationField(0, 'venueName', 'New Venue');
  assert.deepEqual(events().map(event => event.venueName), ['New Venue', 'New Venue']);
  context.removeDate(1);
  assert.equal(events().length, 1);
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $800.00');
  context.removeDate(0);
  assert.equal(events().length, 1);
});

test('new locations can copy details and choose each earlier date independently', () => {
  const { context, elements, events } = app();
  firstLocation(context);
  context.addDate(0);
  vm.runInContext("events[1].eventDate = '2026-12-02';", context);
  context.toggleAllDay(1, true);
  context.addLocation();
  assert.match(elements.get('event-entries').innerHTML, /onclick="usePreviousEvent\(2\)">Use Previous/);
  assert.match(elements.get('event-entries').innerHTML, /onchange="usePreviousDate\(2, this.value\)"/);
  assert.match(elements.get('event-entries').innerHTML, /December 1, 2026/);
  assert.match(elements.get('event-entries').innerHTML, /December 2, 2026 — All Day/);
  context.usePreviousDate(2, '1');
  context.usePreviousEvent(2);
  assert.equal(events()[2].eventDate, '2026-12-02');
  assert.equal(events()[2].allDay, true);
  assert.equal(events()[2].venueName, 'The Lounge');
  assert.equal(events()[2].amount, '800');
  context.addDate(2);
  context.usePreviousDate(3, '0');
  assert.equal(events()[3].eventDate, '2026-12-01');
  assert.equal(events()[3].timeStart, '19:00');
  assert.equal(events()[3].timeEnd, '21:00');
  assert.equal(events()[3].allDay, false);
  assert.equal(events()[2].eventDate, '2026-12-02');
  context.setLocationField(2, 'venueName', 'Second Venue');
  assert.deepEqual(events().map(event => event.venueName), ['The Lounge','The Lounge','Second Venue','Second Venue']);
  vm.runInContext("events[3].amount = '900';", context);
  context.updateBalance();
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $3300.00');
  const invoice = { events: events(), lineItems: [], clientName: 'Client', invoiceNumber: 1001, createdAt: '2026-11-11' };
  const printable = context.buildInvoiceBody(invoice, context.invoiceTotal(invoice));
  assert.equal((printable.match(/Location 1 — Jazz night/g) || []).length, 1);
  assert.equal((printable.match(/Location 2 — Jazz night/g) || []).length, 1);
  assert.match(printable, /Date 1: December 2, 2026 — All Day/);
  assert.match(printable, /Date 2: December 1, 2026 — 7:00PM – 9:00PM/);
  assert.match(printable, /\$3,300\.00|\$3300\.00/);
  context.removeEvent(2);
  assert.equal(events().length, 2);
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $1600.00');
});

test('calendar selection preserves the date-specific schedule and distinct Apple event IDs', async () => {
  const { context, elements, events, googleCalendarURL, calendarBlob } = app();
  firstLocation(context);
  context.addDate(0);
  vm.runInContext("events[1].eventDate = '2026-12-02';", context);
  context.toggleAllDay(1, true);
  const invoice = { id: 'invoice-test', invoiceNumber: 1001, events: events() };
  elements.get('calendar-event').value = '1';
  assert.equal(context.selectedCalendarEvent(invoice).eventDate, '2026-12-02');
  assert.equal(context.selectedCalendarEvent(invoice).calendarDateIndex, 1);
  // Exercise the calendar buttons with the same form data the editor saves.
  context.document.getElementById('f-name').value = 'Client';
  vm.runInContext("currentId = 'invoice-test'; currentInvoiceNumber = 1001;", context);
  context.addToGoogleCalendar();
  assert.match(googleCalendarURL(), /dates=20261202\/20261203/);
  context.addToAppleCalendar();
  assert.match(await calendarBlob().text(), /UID:invoice-test-1@rickparma.com/);
  assert.match(await calendarBlob().text(), /DTSTART;VALUE=DATE:20261202/);
  elements.get('calendar-event').value = '0';
  context.addToAppleCalendar();
  assert.match(await calendarBlob().text(), /UID:invoice-test-0@rickparma.com/);
  assert.match(await calendarBlob().text(), /DTSTART:20261201T190000/);
});

test('older invoices load as separate locations and keep all-day dates', () => {
  const { context, events, elements } = app();
  vm.runInContext(`invoices = [{ id:'old', invoiceNumber:1000, clientName:'Client', events:[
    { eventDate:'2026-12-01', venueName:'One', amount:'500' },
    { eventDate:'2026-12-02', venueName:'Two', amount:'600' }
  ] }];`, context);
  context.editInvoice('old');
  assert.equal(new Set(events().map(event => event.locationId)).size, 2);
  assert.match(elements.get('event-entries').innerHTML, /Location 2/);
  assert.match(elements.get('event-entries').innerHTML, /id="all-day-0" type="checkbox" checked/);
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $1100.00');
  const saved = context.collectFormData();
  assert.equal(saved.events[0].addrStreet, '');
  assert.equal(saved.events[0].allDay, true);
  assert.equal(saved.events[1].allDay, true);
});
