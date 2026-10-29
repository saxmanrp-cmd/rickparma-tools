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

test('multiple send-later blasts stay easy to queue', () => {
  assert.match(html, /id="scheduleAnotherBlastBtn"/);
  assert.match(html, /id="scheduledQueueCount">0 queued/);
  assert.match(appScript, /pendingItems\.length} queued/);
  assert.match(appScript, /prepareAnotherScheduledBlast\(statusText = ''\)/);
  assert.match(appScript, /blastWhen\.value = 'scheduled'/);
  assert.match(appScript, /blastScheduleFields\.classList\.remove\('hidden'\)/);
  assert.match(appScript, /prepareAnotherScheduledBlast\(wasEditing \? 'Saved changes! You can schedule another blast below\.' : 'Scheduled! Add another blast below\.'\)/);
  assert.match(appScript, /apiFetch\(editingScheduledId \? '\/api\/scheduled\/update' : '\/api\/scheduled'/);
});

test('AI writer supports calendar shows and custom prompts without sending automatically', () => {
  assert.match(html, /id="aiWriterEvent"/);
  assert.match(html, /id="aiWriterPrompt"/);
  assert.match(html, /id="aiWriterBtn"/);
  assert.match(appScript, /apiFetch\('\/api\/ai-writer\/calendar'/);
  assert.match(appScript, /apiFetch\('\/api\/ai-writer\/draft'/);
  assert.match(appScript, /JSON\.stringify\(\{ eventId, prompt \}\)/);
  assert.match(appScript, /blastMessage\.value = sanitizeToGSM7\(data\.draft \|\| ''\)/);
  assert.match(appScript, /updateStatsLine\(\)/);
  assert.match(appScript, /aiWriterEvent\.value = events\[0\]\.id/);
  assert.match(appScript, /upcoming shows loaded\. The next show is selected\./);
  assert.match(appScript, /document\.createElement\('option'\)/);
  assert.match(appScript, /aiWriterEvent\.appendChild\(option\)/);
  assert.doesNotMatch(appScript, /escapeHtml\(/);
  const writerHandler = appScript.match(/aiWriterBtn\.addEventListener\('click',[\s\S]*?\n      \}\);/)?.[0] || '';
  assert.doesNotMatch(writerHandler, /\/api\/send|\/api\/scheduled/);
});
