import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../invoice-creator.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const inv = { id: 'test', invoiceNumber: 1234, createdAt: '2026-11-06', clientName: 'Client', events: [], lineItems: [], payments: [] };
function app() {
  const elements = new Map();
  const context = vm.createContext({
    URLSearchParams, File, Blob, location: { search: '' }, setInterval() {},
    localStorage: { getItem() { return null; }, setItem() {} },
    document: { hidden: true, addEventListener() {}, querySelectorAll() { return []; }, getElementById(id) {
      if (!elements.has(id)) elements.set(id, { innerHTML: '', value: '', textContent: '', open: false, showModal() { this.open = true; }, close() { this.open = false; }, style: {}, classList: { toggle() {}, add() {}, remove() {} } });
      return elements.get(id);
    } },
    fetch: async () => ({ json: async () => ({ record: { invoices: [] } }) }),
    console: { ...console, error() {} }
  });
  // Skip startup; tests render fixtures without accessing live invoice records.
  vm.runInContext(script.slice(0, script.indexOf('if (signId) {')), context);
  return { context, elements };
}

test('unsigned shared invoice includes a printable signature line and performer signature', () => {
  const { context, elements } = app();
  context.renderClientInvoice(inv);
  const output = elements.get('print-content').innerHTML;
  assert.equal((output.match(/class="sig-grid"/g) || []).length, 1);
  assert.match(output, /Client Signature/);
  assert.match(output, /class="rick-sig"/);
  assert.ok(output.indexOf('class="sig-grid"') < output.indexOf('class="sign-card no-print"'));
  assert.match(output, /saveInvoicePDF\(this\)/);
});

test('signed shared invoice retains actual signer and both signatures without blank duplicate', () => {
  const { context, elements } = app();
  context.renderClientInvoice({ ...inv, clientSignatureImg: 'data:image/png;base64,test', clientSignedName: 'Different Signer', clientSignDate: '2026-11-07' });
  const output = elements.get('print-content').innerHTML;
  assert.equal((output.match(/class="sig-grid"/g) || []).length, 1);
  assert.match(output, /Different Signer/);
  assert.doesNotMatch(output, />Client Signature</);
  assert.equal((output.match(/<img /g) || []).length, 2);
});

test('PDF preparation failure restores controls and offers retry or print', async () => {
  const { context, elements } = app();
  await context.prepareInvoicePDF();
  assert.match(elements.get('pdf-export-status').textContent, /Tap Save PDF to retry, or use Print/);
  assert.equal(vm.runInContext('invoicePDFState.preparing', context), false);
});

function readyPDF(context) {
  vm.runInContext("invoicePDFState.file = new File(['%PDF-1.3'], 'Invoice-1234.pdf', { type: 'application/pdf' });", context);
}

test('Save PDF passes an actual PDF file to native sharing immediately, without a web URL', async () => {
  const { context } = app();
  readyPDF(context);
  let shared;
  let downloads = 0;
  context.downloadInvoicePDF = () => downloads++;
  context.navigator = { canShare: data => data.files[0] instanceof File, share: data => { shared = data; return Promise.resolve(); } };
  const button = { disabled: false };
  const pending = context.saveInvoicePDF(button);
  // Must happen synchronously in the tap, before any asynchronous PDF generation.
  assert.equal(shared.files[0].type, 'application/pdf');
  assert.equal(shared.files[0].name, 'Invoice-1234.pdf');
  assert.equal(shared.url, undefined);
  assert.equal(await shared.files[0].text(), '%PDF-1.3');
  await pending;
  assert.equal(downloads, 0);
  assert.equal(button.disabled, false);
});

test('Print opens native PDF sharing directly so iPhone can choose Print', async () => {
  const { context, elements } = app();
  readyPDF(context);
  let shared;
  let browserPrints = 0;
  context.window = { print: () => browserPrints++ };
  context.navigator = { canShare: data => data.files[0] instanceof File, share: data => { shared = data; return Promise.resolve(); } };
  const button = { disabled: false };
  const pending = context.printInvoice(button);
  assert.equal(shared.files[0].name, 'Invoice-1234.pdf');
  assert.equal(shared.files[0].type, 'application/pdf');
  assert.match(elements.get('pdf-export-status').textContent, /Choose Print/);
  await pending;
  assert.equal(browserPrints, 0);
  assert.equal(button.disabled, false);
});

test('Print uses the browser print dialog when file sharing is unavailable', async () => {
  const { context } = app();
  let printed = 0;
  context.window = { print: () => printed++ };
  context.navigator = {};
  await context.printInvoice({ disabled: false });
  assert.equal(printed, 1);
});

test('Print offers the PDF file on iPhone when native file sharing is unavailable', async () => {
  const { context, elements } = app();
  readyPDF(context);
  let downloaded;
  let browserPrints = 0;
  context.navigator = { userAgent: 'iPhone' };
  context.window = { print: () => browserPrints++ };
  context.downloadInvoicePDF = file => { downloaded = file; };
  await context.printInvoice({ disabled: false });
  assert.equal(downloaded.name, 'Invoice-1234.pdf');
  assert.equal(browserPrints, 0);
  assert.match(elements.get('pdf-export-status').textContent, /Open the downloaded PDF/);
});

test('closing native sharing does not open a PDF page or trigger a download', async () => {
  const { context, elements } = app();
  readyPDF(context);
  let downloads = 0;
  context.downloadInvoicePDF = () => downloads++;
  context.navigator = { canShare: () => true, share: () => Promise.reject({ name: 'AbortError' }) };
  const button = { disabled: false };
  await context.saveInvoicePDF(button);
  assert.equal(downloads, 0);
  assert.equal(elements.get('pdf-export-status').textContent, '');
  assert.equal(button.disabled, false);
});

test('share permission failure keeps the PDF ready for another tap without navigating', async () => {
  const { context, elements } = app();
  readyPDF(context);
  let downloads = 0;
  context.downloadInvoicePDF = () => downloads++;
  context.navigator = { canShare: () => true, share: () => Promise.reject({ name: 'NotAllowedError' }) };
  const button = { disabled: false };
  await context.saveInvoicePDF(button);
  assert.equal(downloads, 0);
  assert.match(elements.get('pdf-export-status').textContent, /Tap Save PDF again/);
  assert.equal(vm.runInContext('invoicePDFState.file.name', context), 'Invoice-1234.pdf');
  assert.equal(button.disabled, false);
});

test('browsers without PDF file sharing receive a file download', async () => {
  const { context } = app();
  readyPDF(context);
  let downloaded;
  context.navigator = {};
  context.downloadInvoicePDF = file => { downloaded = file; };
  await context.saveInvoicePDF({ disabled: false });
  assert.equal(downloaded.name, 'Invoice-1234.pdf');
});

test('a slower previous invoice cannot replace the current prepared PDF', async () => {
  const { context } = app();
  const view = context.document.getElementById('view-print');
  let number = 'old';
  Object.assign(view, {
    querySelector: () => ({ dataset: { invoiceNumber: number } }),
    cloneNode: () => ({ style: {}, classList: { add() {} }, querySelectorAll: () => [] })
  });
  const pending = [];
  context.html2pdf = () => ({ set() { return this; }, from() { return this; }, outputPdf(type) {
    assert.equal(type, 'blob');
    return new Promise(resolve => pending.push(resolve));
  } });
  const first = context.prepareInvoicePDF();
  number = 'new';
  const second = context.prepareInvoicePDF();
  for (let i = 0; i < 8 && pending.length < 2; i++) await Promise.resolve();
  assert.equal(pending.length, 2);
  pending[1](new Blob(['new']));
  await second;
  pending[0](new Blob(['old']));
  await first;
  assert.equal(vm.runInContext('invoicePDFState.file.name', context), 'Invoice-new.pdf');
  assert.equal(await vm.runInContext('invoicePDFState.file.text()', context), 'new');
});

for (const [action, kind] of [['shareForSignature', 'sign'], ['sharePaymentLink', 'pay'], ['shareReceiptLink', 'receipt']]) {
  test(`${action} offers a link without sending a text until selected`, async () => {
    const { context, elements } = app();
    let saves = 0;
    const texts = [];
    let copied;
    context.saveInvoiceCore = async () => { saves++; vm.runInContext("currentId = 'test invoice';", context); };
    context.sendInvoiceText = async (...args) => { texts.push(args); };
    context.navigator = { clipboard: { writeText: async value => { copied = value; } } };
    await context[action]();
    assert.equal(saves, 1);
    assert.equal(elements.get('invoice-share-dialog').open, true);
    assert.deepEqual(texts, []);
    await context.copyInvoiceShareLink();
    assert.equal(copied, `https://saxmanrp-cmd.github.io/rickparma-tools/invoice-creator.html?${kind}=test%20invoice`);
    assert.deepEqual(texts, []);
    assert.match(elements.get('invoice-share-status').textContent, /Link copied/);
    await context.sendSelectedInvoiceText();
    assert.equal(texts.length, 1);
    assert.equal(texts[0][0], kind);
    assert.equal(elements.get('invoice-share-dialog').open, false);
    assert.equal(elements.get('invoice-share-text').disabled, false);
  });
}

test('Share for Signature offers one whole-invoice link even for a previously split invoice', async () => {
  const { context, elements } = app();
  vm.runInContext("currentId='old'; invoices=[{id:'old',splitByDate:true,events:[{dateId:'date-1'},{dateId:'date-2'}]}];", context);
  context.saveInvoiceCore = async () => true;
  await context.shareForSignature();
  assert.equal(elements.get('invoice-share-dialog').open, true);
  assert.equal(context.document.getElementById('multiple-invoice-dialog').open, false);
  assert.equal(elements.get('invoice-share-link').value, 'https://saxmanrp-cmd.github.io/rickparma-tools/invoice-creator.html?sign=old');
});

test('blocked clipboard leaves the link selected for manual copying', async () => {
  const { context, elements } = app();
  context.navigator = { clipboard: { writeText: async () => { throw new Error('Blocked'); } } };
  const input = context.document.getElementById('invoice-share-link');
  input.value = 'https://example.com/';
  let selected = false;
  input.focus = () => {};
  input.select = () => { selected = true; };
  input.setSelectionRange = () => {};
  await context.copyInvoiceShareLink();
  assert.equal(selected, true);
  assert.match(elements.get('invoice-share-status').textContent, /Touch and hold/);
});
