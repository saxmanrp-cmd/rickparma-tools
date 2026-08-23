import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  THREADS_INSIGHTS_SCOPE,
  addThreadsInsightsScope,
  persistThreadsInsightsScope,
} from '../src/threads-insights.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Threads authorization redirect adds performance insights permission', () => {
  const original = Response.redirect(
    'https://threads.net/oauth/authorize?client_id=123&scope=threads_basic%2Cthreads_content_publish&state=signed',
    302
  );
  const upgraded = addThreadsInsightsScope(original);
  const location = new URL(upgraded.headers.get('location'));
  const scopes = location.searchParams.get('scope').split(',');
  assert.equal(scopes.includes('threads_basic'), true);
  assert.equal(scopes.includes('threads_content_publish'), true);
  assert.equal(scopes.includes(THREADS_INSIGHTS_SCOPE), true);
});

test('successful Threads callback records the granted insights scope', async () => {
  let updateArgs = null;
  const env = {
    DB: {
      prepare(sql) {
        if (sql.startsWith('SELECT scopes')) {
          return { first: async () => ({ scopes:'threads_basic,threads_content_publish' }) };
        }
        if (sql.startsWith('UPDATE threads_account')) {
          return {
            bind(...args) {
              updateArgs = args;
              return { run: async () => ({ success:true }) };
            },
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    },
  };

  const response = Response.redirect('https://social.test/?threads=connected', 302);
  assert.equal(await persistThreadsInsightsScope(response, env), true);
  assert.ok(updateArgs);
  assert.equal(String(updateArgs[0]).split(',').includes(THREADS_INSIGHTS_SCOPE), true);
});

test('Threads performance learning is wired through the existing collector', () => {
  const core = read('src/index.js');
  const entry = read('src/entry.js');
  const packageJson = read('package.json');

  assert.equal(core.includes("if (platform === 'threads') return fetchThreadsPerformance(env, externalId);"), true);
  assert.equal(core.includes("metric:'views,likes,replies,reposts,quotes,shares'"), true);
  assert.equal(core.includes("scopes.includes('threads_manage_insights')"), true);
  assert.equal(entry.includes('addThreadsInsightsScope'), true);
  assert.equal(entry.includes('persistThreadsInsightsScope'), true);
  assert.equal(packageJson.includes('src/threads-insights.js'), true);
});
