import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../invoice-creator.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function app() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', style: {}, textContent: '', className: '' });
      return elements.get(id);
    }
  };
  const context = vm.createContext({ URLSearchParams, location: { search: '' }, document });
  vm.runInContext(script.slice(0, script.indexOf('if (signId) {')), context);
  return { context, elements, events: () => JSON.parse(vm.runInContext('JSON.stringify(events)', context)) };
}

test('Use Previous appears on later events and fills details without replacing their dates or times', () => {
  const { context, elements, events } = app();
  vm.runInContext(`events = [
    { ...blankEvent(), eventName: 'Jazz night', venueName: 'The Lounge', addrStreet: '123 Main St',
      addrCity: 'Las Vegas', eventDate: '2026-12-01', timeStart: '19:00', timeEnd: '21:00',
      perfType: 'Singer/Saxophonist', description: 'Two sets', amount: '800' }
  ];`, context);
  context.renderEvents();
  assert.doesNotMatch(elements.get('event-entries').innerHTML, /Use Previous/);

  context.addEvent();
  assert.match(elements.get('event-entries').innerHTML, /onclick="usePreviousEvent\(1\)">Use Previous/);
  vm.runInContext("events[1].eventDate = '2026-12-02'; events[1].timeStart = '20:00';", context);
  context.usePreviousEvent(1);
  assert.equal(events()[1].venueName, 'The Lounge');
  assert.equal(events()[1].addrStreet, '123 Main St');
  assert.equal(events()[1].perfType, 'Singer/Saxophonist');
  assert.equal(events()[1].description, 'Two sets');
  assert.equal(events()[1].amount, '800');
  assert.equal(events()[1].eventDate, '2026-12-02');
  assert.equal(events()[1].timeStart, '20:00');
  assert.equal(events()[1].timeEnd, '');
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $1600.00');
  assert.match(elements.get('event-entries').innerHTML, /value="The Lounge"/);

  vm.runInContext("events[1].venueName = 'Second Venue';", context);
  assert.equal(events()[0].venueName, 'The Lounge');
  context.addEvent();
  context.usePreviousEvent(2);
  assert.equal(events()[2].venueName, 'Second Venue');
  assert.equal(events()[2].eventDate, '');
  assert.equal(events()[2].timeStart, '');
  assert.equal(events()[2].timeEnd, '');
  assert.equal(elements.get('invoice-total').textContent, 'Invoice Total: $2400.00');
});
