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

test('business invoices have their own list, issuer, and shared client link', () => {
  const { context } = app();
  vm.runInContext(`invoices=[{id:'legacy',invoiceNumber:1001},{id:'agency',profileId:BUSINESS_PROFILE,invoiceNumber:1001}]; activeProfile=BUSINESS_PROFILE`, context);
  assert.equal(vm.runInContext('visibleInvoices().length', context), 1);
  assert.equal(vm.runInContext('visibleInvoices()[0].id', context), 'agency');
  assert.equal(vm.runInContext('nextInvoiceNumber()', context), 1002);
  assert.equal(vm.runInContext("issuerFor({profileId:BUSINESS_PROFILE}).email", context), 'contact@parmaentertainmentgroup.com');
  assert.match(context.invoiceShareLink('pay', 'agency'), /profile=parma-entertainment-group-llc$/);
  assert.equal(vm.runInContext("sharedInvoice(invoices,'agency')", context), undefined);
  vm.runInContext('activeProfile=PERSONAL_PROFILE', context);
  assert.equal(vm.runInContext('visibleInvoices()[0].id', context), 'legacy');
  assert.doesNotMatch(context.invoiceShareLink('pay', 'legacy'), /profile=/);
});

test('opening LLC history reconciles a confirmed payment into its status badge', async () => {
  const { context, elements } = app();
  context.localStorage = { setItem() {} };
  vm.runInContext(`activeProfile=BUSINESS_PROFILE; invoices=[{
    id:'llc-paid', profileId:BUSINESS_PROFILE, clientName:'Test Client',
    events:[{amount:'3.00',eventDate:''}], lineItems:[], payments:[]
  }]`, context);
  context.refreshBusinessInvoice = async () => ({
    id:'llc-paid', profileId:'parma-entertainment-group-llc', clientName:'Test Client',
    events:[{amount:'3.00',eventDate:''}], lineItems:[], payments:[{amount:3,source:'business_payment_hub'}]
  });
  await context.refreshBusinessHistory();
  assert.match(elements.get('history-list').innerHTML, /PAID IN FULL/);
  assert.doesNotMatch(elements.get('history-list').innerHTML, /UNPAID/);
});

test('client signature posts to website so the saved signature can trigger an alert', async () => {
  const { context, elements } = app();
  elements.set('client-name-input', { value:'Jane Client' });
  elements.set('client-date-input', { value:'2026-11-13' });
  elements.set('cursive-canvas', { toDataURL:() => 'data:image/png;base64,AAAA' });
  elements.set('sign-submit-btn', { disabled:false, textContent:'' });
  let request;
  context.fetch = async (url, options) => {
    request = { url, options };
    return { ok:true, json:async () => ({ invoice:{ id:'business', clientSignatureImg:'data:image/png;base64,AAAA' } }) };
  };
  context.renderClientInvoice = () => {};
  await context.submitClientSignature('business', 'day-1');
  assert.equal(request.url, 'https://rickparma.com/api/invoices/sign');
  assert.equal(request.options.method, 'POST');
  assert.equal(JSON.parse(request.options.body).dateId, 'day-1');
  assert.equal(JSON.parse(request.options.body).name, 'Jane Client');
});

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
    currentId='one-record';`, context);
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
  assert.equal((elements.get('multiple-invoice-links').innerHTML.match(/type="url"/g) || []).length, 1);
  assert.match(elements.get('multiple-invoice-links').innerHTML, /One link for all 3 dates/);
  assert.match(elements.get('multiple-invoice-links').innerHTML, /\?sign=one-record&amp;sequence=1/);
  let shared;
  context.navigator = { share: async value => { shared = value; } };
  await context.shareSequenceLink();
  assert.match(shared.text, /invoice-creator\.html\?sign=one-record&sequence=1/);
  assert.doesNotMatch(shared.text, /&date=/);
});

test('one sequence link advances through three separate date signatures in selected order', () => {
  const { context, elements } = app();
  firstLocation(context);
  context.addInvoiceDate();
  context.setInvoiceDate(1, 'eventDate', '2026-12-02');
  context.addInvoiceDate();
  context.setInvoiceDate(2, 'eventDate', '2026-12-03');
  context.addDate(0);
  context.addDate(0);
  const inv = context.collectFormData();
  const ids = Array.from(context.invoiceDateIds(inv));
  context.prepareInvoicePDF = () => {};
  context.renderSequenceInvoice(inv);
  assert.match(elements.get('print-content').innerHTML, /Invoice 1 of 3/);
  assert.match(elements.get('print-content').innerHTML, /December 1, 2026/);
  assert.doesNotMatch(elements.get('print-content').innerHTML, /Payment Type|December 2, 2026/);
  inv.dateSignatures[ids[0]] = { clientSignatureImg:'data:image/png;base64,one', clientSignedName:'First Signer', clientSignDate:'2026-12-01' };
  context.renderSequenceInvoice(inv);
  assert.match(elements.get('print-content').innerHTML, /Invoice 2 of 3/);
  assert.match(elements.get('print-content').innerHTML, /December 2, 2026/);
  assert.doesNotMatch(elements.get('print-content').innerHTML, /December 1, 2026/);
  inv.dateSignatures[ids[1]] = { clientSignatureImg:'data:image/png;base64,two', clientSignedName:'Second Signer', clientSignDate:'2026-12-02' };
  context.renderSequenceInvoice(inv);
  assert.match(elements.get('print-content').innerHTML, /Invoice 3 of 3/);
  inv.dateSignatures[ids[2]] = { clientSignatureImg:'data:image/png;base64,three', clientSignedName:'Third Signer', clientSignDate:'2026-12-03' };
  context.renderSequenceInvoice(inv);
  assert.match(elements.get('print-content').innerHTML, /All 3 dates signed/);
  assert.equal((elements.get('print-content').innerHTML.match(/class="sig-grid"/g) || []).length, 3);
});

test('previewing multiple invoices does not persist a sharing mode', async () => {
  const { context } = app();
  firstLocation(context);
  context.addInvoiceDate();
  context.setInvoiceDate(1, 'eventDate', '2026-12-02');
  context.addDate(0);
  let saves = 0;
  let opened = 0;
  context.saveInvoiceCore = async () => { saves++; return true; };
  context.openMultipleInvoiceShares = () => { opened++; };
  await context.saveAsMultipleInvoices();
  assert.equal(saves, 1);
  assert.equal(opened, 1);
  assert.equal(context.collectFormData().splitByDate, undefined);
});

test('combined print has one signature while each separate date link has its own', () => {
  const { context, elements } = app();
  firstLocation(context);
  context.addInvoiceDate();
  context.setInvoiceDate(1, 'eventDate', '2026-12-02');
  context.addDate(0);
  vm.runInContext("currentId='one-record';", context);
  context.prepareInvoicePDF = () => {};
  context.renderPrintView();
  const combined = elements.get('print-content').innerHTML;
  assert.equal((combined.match(/class="sig-grid"/g) || []).length, 1);
  assert.doesNotMatch(combined, /Date 1 —|Date 2 —/);

  const master = context.collectFormData();
  const ids = Array.from(context.invoiceDateIds(master));
  master.dateSignatures[ids[0]] = { clientSignatureImg:'data:image/png;base64,signed', clientSignedName:'First Signer', clientSignDate:'2026-12-01' };
  context.renderClientInvoice(master, ids[0]);
  assert.equal((elements.get('print-content').innerHTML.match(/class="sig-grid"/g) || []).length, 1);
  assert.match(elements.get('print-content').innerHTML, /First Signer/);
  context.renderClientInvoice(master, ids[1]);
  assert.equal((elements.get('print-content').innerHTML.match(/class="sig-grid"/g) || []).length, 1);
  assert.match(elements.get('print-content').innerHTML, /Client Signature/);
  assert.doesNotMatch(elements.get('print-content').innerHTML, /First Signer/);
});
