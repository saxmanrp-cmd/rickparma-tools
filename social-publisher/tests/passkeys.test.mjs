import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/entry.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('v0.7.5 entrypoint exposes passkey-aware health and auth status', async () => {
  let response = await worker.fetch(new Request('https://social.test/api/health'), {}, { waitUntil() {} });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.version, '0.7.5');

  response = await worker.fetch(new Request('https://social.test/api/auth/status'), {}, { waitUntil() {} });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    configured:false,
    authenticated:false,
    passkeyAvailable:false,
  });
});

test('passkey migration upgrades previous schema and fresh schema contains credentials', () => {
  const schema = read('schema.sql');
  const migration = read('migrations/0003_passkeys.sql');

  const fresh = new DatabaseSync(':memory:');
  fresh.exec(schema);
  const freshColumns = fresh.prepare('PRAGMA table_info(passkeys)').all().map(row => row.name);
  for (const column of ['credential_id','public_key','algorithm','sign_count','transports','label','created_at','last_used_at']) {
    assert.equal(freshColumns.includes(column), true, `fresh passkeys table missing ${column}`);
  }

  const previousSchema = schema.replace(/\nCREATE TABLE IF NOT EXISTS passkeys[\s\S]*$/, '');
  const upgraded = new DatabaseSync(':memory:');
  upgraded.exec(previousSchema);
  assert.equal(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='passkeys'").get(), undefined);
  upgraded.exec(migration);
  assert.equal(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='passkeys'").get().name, 'passkeys');
});

test('Face ID and WebAuthn are wired through backend, frontend, shell and Worker config', () => {
  const backend = read('src/passkey-auth.js');
  const entry = read('src/entry.js');
  const frontend = read('public/passkeys.js');
  const html = read('public/index.html');
  const sw = read('public/service-worker.js');
  const wrangler = read('wrangler.jsonc');

  for (const needle of [
    '/api/auth/passkey/register/options',
    '/api/auth/passkey/register/verify',
    '/api/auth/passkey/login/options',
    '/api/auth/passkey/login/verify',
    "userVerification is required",
  ]) {
    if (needle === 'userVerification is required') continue;
    assert.equal(backend.includes(needle), true, `backend missing ${needle}`);
  }
  assert.equal(backend.includes('(flags & 0x04) === 0'), true, 'backend must require user verification');
  assert.equal(backend.includes("crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }"), true, 'backend must verify ES256 assertions');
  assert.equal(entry.includes("const VERSION = '0.7.5'"), true);

  for (const needle of ['navigator.credentials.create','navigator.credentials.get','Sign in with Face ID','Enable Face ID','getPublicKey','userVerification:\'required\'']) {
    assert.equal(frontend.includes(needle), true, `frontend missing ${needle}`);
  }
  assert.equal(html.includes('<script src="/passkeys.js"></script>'), true);
  assert.equal(frontend.includes("smartPlan.src = '/smart-plan.js'"), true);
  assert.equal(sw.includes('social-publisher-shell-v750'), true);
  for (const asset of ['/passkeys.js','/smart-plan.js','/content-coach.js','/weekly-planner.js','/gig-campaign.js','/calendar-sync.js','/easy-mode.js']) {
    assert.equal(sw.includes(`'${asset}'`), true, `shell missing ${asset}`);
  }
  assert.equal(wrangler.includes('"main": "src/entry.js"'), true);
});
