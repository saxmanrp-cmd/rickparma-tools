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
      if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', style: {}, textContent: '', className: '', open: false, showModal() { this.open = true; }, classList: { toggle() {} } });
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
  vm.runInContext(`invoiceDates = [{ ...blankInvoiceDate(), eventDate:'2026-12-01', timeStart:'19:00', timeEnd:'21:00' }];
    events = [{ ...blankEvent(), dateId:invoiceDates[0].id, eventName:'Jazz night', venueName:'The Lounge',
    addrStreet:'123 Main St', addrCity:'Las Vegas', eventDate:'2026-12-01',
    timeStart:'19:00', timeEnd:'21:00', perfType:'Singer/Saxophonist',
    description:'Two sets', amount:'800' }];`, context);
  context.renderInvoiceDates();
  context.renderEvents();
}

test('dates appear between client and event info and control each chosen location date', () => {
  const { context, elements, events } = app();
  firstLocation(context);
  assert.match(html, /<h2>Client Info<\/h2>[\s\S]*?<h2>Dates<\/h2>[\s\S]*?<h2>Event Info<\/h2>/);
  assert.doesNotMatch(elements.get('event-entries').innerHTML, /Use Previous/);
  assert.match(html, /onclick="addLocation\(\)">\+ Add Location/);
  context.addInvoiceDate();
  context.setInvoiceDate(1, 'eventDate', '2026-12-02');
  context.setInvoiceDate(1, 'allDay', true);
  assert.match(elements.get('invoice-dates').innerHTML, /id="invoice-all-day-1" type="checkbox" checked/);
  context.addDate(0);
  assert.equal(events()[0].locationId, events()[1].locationId);
  assert.equal(events()[1].venueName, 'The Lounge');
  assert.equal(events()[1].eventDate, '2026-12-02');
  assert.equal(events()[1].allDay, true);
  assert.equal(events()[0].allDay, false);
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $1600.00');
  assert.match(elements.get('event-entries').innerHTML, /onclick="addDate\(0\)">\+ Add Date/);
  context.setLocationField(0, 'venueName', 'New Venue');
  assert.deepEqual(events().map(event => event.venueName), ['New Venue', 'New Venue']);
  context.setInvoiceDate(1, 'eventDate', '2026-12-03');
  assert.equal(events()[1].eventDate, '2026-12-03');
  context.removeDate(1);
  assert.equal(events().length, 1);
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $800.00');
  context.removeDate(0);
  assert.equal(events().length, 1);
});

test('locations can choose the dates selected above and retain their own prices', () => {
  const { context, elements, events } = app();
  firstLocation(context);
  context.addInvoiceDate();
  context.setInvoiceDate(1, 'eventDate', '2026-12-02');
  context.setInvoiceDate(1, 'allDay', true);
  context.addLocation();
  assert.match(elements.get('event-entries').innerHTML, /onclick="usePreviousEvent\(1\)">Use Previous/);
  assert.match(elements.get('event-entries').innerHTML, /onchange="selectLocationDate\(1, this.value\)"/);
  assert.match(elements.get('event-entries').innerHTML, /December 1, 2026/);
  assert.match(elements.get('event-entries').innerHTML, /December 2, 2026 \(All Day\)/);
  vm.runInContext("selectLocationDate(1, invoiceDates[1].id)", context);
  context.usePreviousEvent(1);
  assert.equal(events()[1].eventDate, '2026-12-02');
  assert.equal(events()[1].allDay, true);
  assert.equal(events()[1].amount, '800');
  context.addDate(1);
  vm.runInContext("selectLocationDate(2, invoiceDates[0].id)", context);
  assert.equal(events()[2].eventDate, '2026-12-01');
  assert.equal(events()[2].timeStart, '19:00');
  assert.equal(events()[2].allDay, false);
  context.setLocationField(1, 'venueName', 'Second Venue');
  assert.deepEqual(events().map(event => event.venueName), ['The Lounge','Second Venue','Second Venue']);
  vm.runInContext("events[2].amount = '900';", context);
  context.updateBalance();
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $2500.00');
  const invoice = { events: events(), lineItems: [], clientName: 'Client', invoiceNumber: 1001, createdAt: '2026-11-11' };
  const printable = context.buildInvoiceBody(invoice, context.invoiceTotal(invoice));
  assert.equal((printable.match(/class="bill-to"/g) || []).length, 1);
  assert.doesNotMatch(printable, /Location [123]|Date [123]:|Singer\/Saxophonist/);
  assert.equal((printable.match(/123 Main St/g) || []).length, 1);
  assert.match(printable, /123 Main St<br>Las Vegas/);
  assert.doesNotMatch(printable, /Second Venue/);
  assert.match(printable, /December 2, 2026 — All Day/);
  assert.match(printable, /December 1, 2026 — 7:00PM – 9:00PM/);
  assert.match(printable, /\$2,500\.00|\$2500\.00/);
  context.removeEvent(1);
  assert.equal(events().length, 1);
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $800.00');
});

test('a shared address appears once under the payer while dates stay in description rows', () => {
  const { context, events } = app();
  firstLocation(context);
  context.addLocation();
  context.usePreviousEvent(1);
  vm.runInContext("events[1].eventDate = '2026-12-02';", context);
  context.addLocation();
  context.usePreviousEvent(2);
  vm.runInContext("events[2].eventDate = '2026-12-03';", context);
  const invoice = { events:events(), lineItems:[], clientName:'One Payer', invoiceNumber:1002, createdAt:'2026-11-11' };
  const body = context.buildInvoiceBody(invoice, context.invoiceTotal(invoice));
  const billTo = body.slice(body.indexOf('class="bill-to"'), body.indexOf('class="section-divider"'));
  const table = body.slice(body.indexOf('<table>'));
  assert.match(billTo, /One Payer/);
  assert.match(billTo, /The Lounge<br>123 Main St<br>Las Vegas/);
  assert.equal((body.match(/123 Main St/g) || []).length, 1);
  assert.doesNotMatch(table, /123 Main St|Jazz night|Location [123]|Date [123]:/);
  assert.match(table, /December 1, 2026 — 7:00PM – 9:00PM/);
  assert.match(table, /December 2, 2026 — 7:00PM – 9:00PM/);
  assert.match(table, /December 3, 2026 — 7:00PM – 9:00PM/);
});

test('different addresses appear with their respective dates in description rows', () => {
  const { context, events } = app();
  firstLocation(context);
  context.addLocation();
  context.setLocationField(1, 'addrStreet', '456 Side St');
  context.setLocationField(1, 'addrCity', 'Henderson');
  vm.runInContext("events[1].eventDate = '2026-12-02';", context);
  const invoice = { events:events(), lineItems:[], clientName:'One Payer', invoiceNumber:1003, createdAt:'2026-11-11' };
  const body = context.buildInvoiceBody(invoice, context.invoiceTotal(invoice));
  const billTo = body.slice(body.indexOf('class="bill-to"'), body.indexOf('class="section-divider"'));
  const table = body.slice(body.indexOf('<table>'));
  assert.doesNotMatch(billTo, /123 Main St|456 Side St/);
  assert.match(table, /123 Main St<br>Las Vegas<br>December 1, 2026/);
  assert.match(table, /456 Side St<br>Henderson<br>December 2, 2026/);
  assert.doesNotMatch(table, /Location [12]|Date [12]:/);
});

test('calendar selection preserves the date-specific schedule and distinct Apple event IDs', async () => {
  const { context, elements, events, googleCalendarURL, calendarBlob } = app();
  firstLocation(context);
  context.addInvoiceDate();
  context.setInvoiceDate(1, 'eventDate', '2026-12-02');
  context.setInvoiceDate(1, 'allDay', true);
  context.addDate(0);
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
  assert.match(elements.get('invoice-dates').innerHTML, /id="invoice-all-day-0" type="checkbox" checked/);
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $1100.00');
  const saved = context.collectFormData();
  assert.equal(saved.events[0].addrStreet, '');
  assert.equal(saved.events[0].allDay, true);
  assert.equal(saved.events[1].allDay, true);
  assert.equal(saved.invoiceDates.length, 2);
});

test('removing a selected date reassigns its locations to the remaining date', () => {
  const { context, events } = app();
  firstLocation(context);
  context.addInvoiceDate();
  context.setInvoiceDate(1, 'eventDate', '2026-12-02');
  context.addLocation();
  vm.runInContext('selectLocationDate(1, invoiceDates[1].id)', context);
  context.removeInvoiceDate(1);
  assert.equal(events()[1].eventDate, '2026-12-01');
  assert.equal(events()[1].dateId, events()[0].dateId);
  assert.equal(context.collectFormData().invoiceDates.length, 1);
});

test('one app invoice produces separate date copies whose totals include shared charges once', async () => {
  const { context, elements } = app();
  firstLocation(context);
  context.addInvoiceDate();
  context.setInvoiceDate(1, 'eventDate', '2026-12-02');
  context.addInvoiceDate();
  context.setInvoiceDate(2, 'eventDate', '2026-12-03');
  context.addDate(0);
  context.addDate(0);
  vm.runInContext(`events[1].amount='900'; events[2].amount='1000';
    lineItems=[{description:'Travel',amount:'10.00'}];
    currentId='one-record'; splitByDate=true;`, context);
  const master = context.collectFormData();
  const ids = Array.from(context.invoiceDateIds(master));
  assert.equal(ids.length, 3);
  const copies = ids.map(id => context.invoiceForDate(master, id));
  assert.deepEqual(copies.map(copy => copy.events.length), [1,1,1]);
  assert.deepEqual(copies.map(copy => copy.lineItems[0].amount), ['3.34','3.33','3.33']);
  assert.equal(copies.reduce((sum, copy) => sum + context.invoiceTotal(copy), 0), context.invoiceTotal(master));
  assert.deepEqual(copies.map(copy => copy.events[0].eventDate), ['2026-12-01','2026-12-02','2026-12-03']);
  vm.runInContext('invoices=[collectFormData()]', context);
  context.openMultipleInvoiceShares();
  assert.equal(elements.get('multiple-invoice-dialog').open, true);
  assert.equal((elements.get('multiple-invoice-links').innerHTML.match(/Send \/ Share/g) || []).length, 3);
  let shared;
  context.navigator = { share: async value => { shared = value; } };
  await context.shareAllDateLinks();
  assert.equal((shared.text.match(/invoice-creator\.html\?sign=one-record&date=/g) || []).length, 3);
});
