import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Weekly Planner schema upgrades cleanly and fresh schema contains content plan storage', () => {
  const schema = read('schema.sql');
  const migration = read('migrations/0004_content_plan.sql');
  const fresh = new DatabaseSync(':memory:');
  fresh.exec(schema);
  const freshColumns = fresh.prepare('PRAGMA table_info(content_plan_items)').all().map(row => row.name);
  for (const column of ['id','week_key','title','kind','media_accept','caption_starter','why_text','scheduled_for','status','source','created_at','updated_at']) {
    assert.equal(freshColumns.includes(column), true, `fresh content plan missing ${column}`);
  }
  const previous = schema.replace(/\nCREATE TABLE IF NOT EXISTS content_plan_items[\s\S]*$/, '');
  const upgraded = new DatabaseSync(':memory:');
  upgraded.exec(previous);
  assert.equal(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_plan_items'").get(), undefined);
  upgraded.exec(migration);
  assert.equal(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_plan_items'").get().name, 'content_plan_items');
});

test('Weekly Planner stays wired but secondary in Flyer First v0.7.6', () => {
  const entry = read('src/entry.js');
  const backend = read('src/content-plan.js');
  const planner = read('public/weekly-planner.js');
  const flyer = read('public/flyer-first.js');
  const smart = read('public/smart-plan.js');
  const sw = read('public/service-worker.js');
  const pkg = read('package.json');

  for (const needle of ['/api/content-plan/generate','content_plan_items','week_key','allowedStatuses','weekly-planner','validSource','gig-campaign:','source=?']) {
    assert.equal(backend.includes(needle), true, `content plan backend missing ${needle}`);
  }
  assert.equal(entry.includes('handleContentPlanRequest'), true);
  assert.equal(entry.includes("const VERSION = '0.7.6'"), true);
  assert.equal(entry.includes("url.pathname.startsWith('/api/content-plan')"), true);
  assert.equal(entry.includes('isLegacySessionAuthenticated'), true);

  for (const needle of ['Weekly Planner','Your content week','Build My Week','Rebuild','Start Post','/api/content-plan/generate','/api/intelligence/profile','bestFormat','bestWindow','captionStarter','scheduledFor',"navigate('create')"]) {
    assert.equal(planner.includes(needle), true, `Weekly Planner client missing ${needle}`);
  }
  assert.equal(flyer.includes('Extra content ideas for the week · optional'), true);
  assert.equal(smart.includes("loadScript('/weekly-planner.js','weekly-planner')"), true);
  assert.equal(smart.includes("'/flyer-first.js','flyer-first'"), true);
  for (const asset of ['/weekly-planner.js','/easy-mode.js','/flyer-first.js']) assert.equal(sw.includes(`'${asset}'`), true);
  assert.equal(sw.includes('social-publisher-shell-v760'), true);
  for (const pathName of ['src/content-plan.js','public/weekly-planner.js','public/easy-mode.js','public/flyer-first.js']) assert.equal(pkg.includes(pathName), true);
  assert.equal(pkg.includes('"version": "0.7.6"'), true);
});
