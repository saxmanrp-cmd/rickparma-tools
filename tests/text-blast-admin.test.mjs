import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const appScript = scripts.at(-1);

test('Text Blast Admin inline JavaScript parses', () => {
  assert.ok(appScript, 'inline application script is present');
  assert.doesNotThrow(() => new Function(appScript));
});

test('phone matching uses the JOIN-repair normalization helper', () => {
  const match = appScript.match(/function normalizeSubscriberPhone\(phone\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, 'normalization helper is present');
  const normalizeSubscriberPhone = new Function('phone', match[1]);

  assert.equal(normalizeSubscriberPhone('+1 (702) 555-0123'), '7025550123');
  assert.equal(normalizeSubscriberPhone('1-702-555-0123'), '7025550123');
  assert.equal(normalizeSubscriberPhone('7025550123'), '7025550123');
  assert.match(appScript, /openQuickEditSubscriber\(phone\)[\s\S]*findSubscriberByPhone\(phone\)/);
  assert.match(appScript, /body: JSON\.stringify\(\{ phone: sub\.phone, name, tags \}\)/);
});

test('Messages quick edit reuses subscriber update and refreshes both views', () => {
  assert.match(html, /id="quickEditSubscriberModal"/);
  assert.match(html, /data-action="edit-subscriber"/);
  assert.match(appScript, /apiFetch\('\/api\/subscribers\/update'/);
  assert.match(appScript, /subscribers = data\.subscribers;[\s\S]*?renderSubscribers\(\);\s*await loadConversations\(\);/);
  assert.doesNotMatch(
    appScript.match(/quickEditSubscriberSave\.addEventListener\('click',[\s\S]*?\n  \}\);/)?.[0] || '',
    /\/api\/subscribers\/add/,
  );
});

test('quick edit is limited to active subscriber records', () => {
  assert.match(appScript, /if \(!sub \|\| sub\.status !== 'active'\) return;/);
  assert.match(appScript, /isActiveSubscriber\(c\.phone\) \? `<button class="quick-edit-button"[^`]+data-action="edit-subscriber">EDIT<\/button>`/);
});

test('conversation, delete, remove, and JOIN recovery behavior remains wired', () => {
  assert.match(appScript, /e\.stopPropagation\(\);\s*openQuickEditSubscriber/);
  assert.match(appScript, /el\.addEventListener\('click', \(\) => openThread\(el\.dataset\.phone\)\)/);
  assert.match(appScript, /data-action="delete-one"/);
  assert.match(appScript, /data-action="unsub-one"/);
  assert.match(appScript, /apiFetch\('\/api\/subscribers\/remove'/);
  assert.match(appScript, /repairMissingJoinSubscribers\(rawConvos\)/);
  assert.match(appScript, /command === 'JOIN' \|\| stopCommands\.has\(command\)/);
});

test('Auto Reply copy reflects production command ordering', () => {
  assert.match(html, /STOP variants and START\/YES\/UNSTOP are handled automatically before these rules\./);
});
