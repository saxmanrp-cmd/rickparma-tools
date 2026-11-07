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
    URLSearchParams, location: { search: '' }, setInterval() {},
    localStorage: { getItem() { return null; }, setItem() {} },
    document: { hidden: true, addEventListener() {}, getElementById(id) {
      if (!elements.has(id)) elements.set(id, { innerHTML: '', value: '', textContent: '', open: false, showModal() { this.open = true; }, close() { this.open = false; }, style: {}, classList: { toggle() {}, add() {}, remove() {} } });
      return elements.get(id);
    } },
    fetch: async () => ({ json: async () => ({ record: { invoices: [] } }) }),
    console
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

test('PDF export failure restores save control and offers print fallback', async () => {
  const { context } = app();
  let message;
  context.alert = value => { message = value; };
  const button = { textContent: 'Save PDF', disabled: false };
  await context.saveInvoicePDF(button);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Save PDF');
  assert.match(message, /use Print/);
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
