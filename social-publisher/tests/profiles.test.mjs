import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0005_publisher_profiles.sql', import.meta.url), 'utf8');

function d1(db) {
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async first() { return db.prepare(sql).get(...values) || null; },
        async all() { return { results: db.prepare(sql).all(...values) }; },
        async run() { const meta = db.prepare(sql).run(...values); return { meta:{ changes:meta.changes } }; },
      };
    },
    async batch(statements) { for (const statement of statements) await statement.run(); },
  };
}

async function encryptedToken(value, secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(value));
  const b64 = bytes => Buffer.from(bytes).toString('base64url');
  return `${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}

test('migration keeps existing music posts and gives Fuel a separate account store', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id TEXT PRIMARY KEY, created_at TEXT NOT NULL); INSERT INTO posts VALUES ('legacy', '2026-01-01');`);
  db.exec(migration);
  assert.equal(db.prepare("SELECT profile_id FROM posts WHERE id='legacy'").get().profile_id, 'music');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='profile_social_accounts'").get().name, 'profile_social_accounts');
  const fresh = new DatabaseSync(':memory:');
  fresh.exec(schema);
  assert.equal(fresh.prepare("SELECT profile_id FROM posts LIMIT 1").all().length, 0);
});

test('music and Fuel posts, account selection, and mutations are isolated', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO social_accounts (id, platform, account_name, external_account_id, access_token_encrypted, created_at, updated_at) VALUES ('facebook','facebook','Rick Music','music-page','music-token',?,?)`).run(now,now);
  db.prepare(`INSERT INTO meta_page_candidates (page_id,page_name,page_token_encrypted,instagram_id,instagram_username,selected,created_at,updated_at) VALUES ('fuel-page','Fuel Facebook','fuel-token','fuel-ig','fuelhandle',0,?,?)`).run(now,now);
  const env = { DB:d1(db), APP_PASSWORD:'test-pass', SESSION_SECRET:'test-secret', META_APP_ID:'test-id', META_APP_SECRET:'test-secret', TOKEN_ENCRYPTION_KEY:'test-key' };
  const ctx = { waitUntil() {} };
  const call = async (path, method='GET', body, cookie) => worker.fetch(new Request(`https://publisher.test${path}`, {
    method, headers:{ ...(cookie ? { cookie } : {}), ...(body ? { 'content-type':'application/json' } : {}) },
    body:body ? JSON.stringify(body) : undefined,
  }), env, ctx);
  const login = await call('/api/auth/login','POST',{password:'test-pass'});
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const request = (path, method='GET', body) => call(path,method,body,cookie);

  let response = await request('/api/meta/select','POST',{pageId:'fuel-page',profileId:'fuel'});
  assert.equal(response.status, 200);
  assert.equal((await (await request('/api/meta/status?profileId=music')).json()).facebook.id, 'music-page');
  let fuel = await (await request('/api/meta/status?profileId=fuel')).json();
  assert.equal(fuel.facebook.id, 'fuel-page');
  assert.equal(fuel.instagram.username, 'fuelhandle');

  const scheduledAt = new Date(Date.now() + 86400000).toISOString();
  const post = (caption,profileId) => ({caption,profileId,platforms:['facebook'],status:'scheduled',scheduledAt});
  const fuelPost = await (await request('/api/posts','POST',post('Fuel update','fuel'))).json();
  const musicPost = await (await request('/api/posts','POST',post('Music update','music'))).json();
  assert.equal(fuelPost.status, 'scheduled');
  assert.equal((await (await request('/api/posts?profileId=fuel')).json()).posts.map(p=>p.caption).join(','), 'Fuel update');
  assert.equal((await (await request('/api/posts?profileId=music')).json()).posts.map(p=>p.caption).join(','), 'Music update');
  assert.equal((await request(`/api/posts/${fuelPost.id}?profileId=music`,'PATCH',post('Wrong','music'))).status, 404);
  assert.equal((await request(`/api/posts/${fuelPost.id}?profileId=music`,'DELETE')).status, 404);
  assert.equal((await request('/api/posts','POST',{...post('Wrong network','fuel'),platforms:['threads']})).status, 400);

  response = await request('/api/meta/disconnect','POST',{profileId:'fuel'});
  assert.equal(response.status, 200);
  fuel = await (await request('/api/meta/status?profileId=fuel')).json();
  assert.equal(fuel.connected, false);
  assert.equal((await (await request('/api/meta/status?profileId=music')).json()).facebook.id, 'music-page');
  assert.equal(db.prepare('SELECT profile_id FROM posts WHERE id=?').get(musicPost.id).profile_id, 'music');
  assert.equal(db.prepare('SELECT profile_id FROM posts WHERE id=?').get(fuelPost.id).profile_id, 'fuel');
});

test('queued posts route to the account saved on each post after switching profiles', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const now = new Date().toISOString();
  const secret = 'test-key';
  const musicToken = await encryptedToken('music-token', secret);
  const fuelToken = await encryptedToken('fuel-token', secret);
  db.prepare(`INSERT INTO social_accounts (id,platform,account_name,external_account_id,access_token_encrypted,created_at,updated_at) VALUES ('facebook','facebook','Music','music-page',?,?,?)`).run(musicToken,now,now);
  db.prepare(`INSERT INTO profile_social_accounts (profile_id,platform,account_name,external_account_id,access_token_encrypted,created_at,updated_at) VALUES ('fuel','facebook','Fuel','fuel-page',?,?,?)`).run(fuelToken,now,now);
  const env = {DB:d1(db),APP_PASSWORD:'test-pass',SESSION_SECRET:'test-secret',TOKEN_ENCRYPTION_KEY:secret};
  const tasks = [];
  const ctx = {waitUntil(promise) { tasks.push(promise); }};
  const originalFetch = globalThis.fetch;
  const destinations = [];
  globalThis.fetch = async (url, options) => {
    destinations.push({url:String(url), token:new URLSearchParams(options.body).get('access_token')});
    return new Response(JSON.stringify({id:`posted-${destinations.length}`}), {headers:{'content-type':'application/json'}});
  };
  try {
    const login = await worker.fetch(new Request('https://publisher.test/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'test-pass'})}),env,ctx);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    for (const profileId of ['fuel','music']) {
      const response = await worker.fetch(new Request('https://publisher.test/api/posts',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({caption:'One post',platforms:['facebook'],status:'queued',profileId})}),env,ctx);
      assert.equal(response.status, 201);
      await Promise.all(tasks.splice(0));
    }
    assert.deepEqual(destinations.map(d=>[new URL(d.url).pathname,d.token]), [
      ['/v24.0/fuel-page/feed','fuel-token'],
      ['/v24.0/music-page/feed','music-token'],
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM posts WHERE status='published'").get().n, 2);
  } finally { globalThis.fetch = originalFetch; }
});
