import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('social-publisher');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);
const mustReplace = (text, from, to, label) => {
  if (!text.includes(from)) throw new Error(`Could not patch ${label}`);
  return text.replace(from, to);
};

const performanceSnippet = read('tools/v068-performance-snippet.txt');
const reachFull = read('tools/v068-reach-full.txt');

// Database schema + migration.
let schema = read('schema.sql');
if (!schema.includes('  timezone TEXT,')) {
  schema = mustReplace(schema, '  instagram_options TEXT,\n  last_error TEXT,', '  instagram_options TEXT,\n  timezone TEXT,\n  last_error TEXT,', 'posts timezone schema');
}
if (!schema.includes('CREATE TABLE IF NOT EXISTS performance_tracking')) {
  schema += `\n\nCREATE TABLE IF NOT EXISTS performance_tracking (\n  post_id TEXT NOT NULL,\n  platform TEXT NOT NULL,\n  external_id TEXT,\n  check_index INTEGER NOT NULL DEFAULT 0,\n  next_check_at TEXT,\n  completed INTEGER NOT NULL DEFAULT 0,\n  last_metrics TEXT,\n  last_score REAL NOT NULL DEFAULT 0,\n  last_error TEXT,\n  last_checked_at TEXT,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY (post_id, platform)\n);\n\nCREATE INDEX IF NOT EXISTS idx_performance_tracking_due ON performance_tracking(completed, next_check_at);\n\nCREATE TABLE IF NOT EXISTS performance_snapshots (\n  id TEXT PRIMARY KEY,\n  post_id TEXT NOT NULL,\n  platform TEXT NOT NULL,\n  external_id TEXT,\n  captured_at TEXT NOT NULL,\n  age_hours REAL NOT NULL DEFAULT 0,\n  metrics_json TEXT NOT NULL,\n  performance_score REAL NOT NULL DEFAULT 0,\n  source TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_performance_snapshots_post ON performance_snapshots(post_id, platform, captured_at);\n`;
}
write('schema.sql', schema);
write('migrations/0002_performance_learning.sql', `ALTER TABLE posts ADD COLUMN timezone TEXT;\n\nCREATE TABLE IF NOT EXISTS performance_tracking (\n  post_id TEXT NOT NULL,\n  platform TEXT NOT NULL,\n  external_id TEXT,\n  check_index INTEGER NOT NULL DEFAULT 0,\n  next_check_at TEXT,\n  completed INTEGER NOT NULL DEFAULT 0,\n  last_metrics TEXT,\n  last_score REAL NOT NULL DEFAULT 0,\n  last_error TEXT,\n  last_checked_at TEXT,\n  updated_at TEXT NOT NULL,\n  PRIMARY KEY (post_id, platform)\n);\n\nCREATE INDEX IF NOT EXISTS idx_performance_tracking_due ON performance_tracking(completed, next_check_at);\n\nCREATE TABLE IF NOT EXISTS performance_snapshots (\n  id TEXT PRIMARY KEY,\n  post_id TEXT NOT NULL,\n  platform TEXT NOT NULL,\n  external_id TEXT,\n  captured_at TEXT NOT NULL,\n  age_hours REAL NOT NULL DEFAULT 0,\n  metrics_json TEXT NOT NULL,\n  performance_score REAL NOT NULL DEFAULT 0,\n  source TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_performance_snapshots_post ON performance_snapshots(post_id, platform, captured_at);\n`);

// Backend.
let backend = read('src/index.js');
backend = backend.replace("version: '0.6.7'", "version: '0.6.8'");
backend = backend.replaceAll('RickParma-SocialPublisher/0.6.7', 'RickParma-SocialPublisher/0.6.8');

if (!backend.includes("url.pathname === '/api/intelligence/profile'")) {
  const marker = "    if (url.pathname === '/api/posts' && request.method === 'GET') {";
  const route = `    if (url.pathname === '/api/intelligence/profile' && request.method === 'GET') {\n      if (!env.DB) return json({ error:'D1 binding DB is not configured.' }, { status:503 });\n      const timezone = url.searchParams.get('timezone') || '';\n      return json(await buildPerformanceProfile(env, timezone));\n    }\n\n    if (url.pathname === '/api/intelligence/refresh' && request.method === 'POST') {\n      if (!env.DB) return json({ error:'D1 binding DB is not configured.' }, { status:503 });\n      await processPerformanceTracking(env);\n      const timezone = url.searchParams.get('timezone') || '';\n      return json(await buildPerformanceProfile(env, timezone));\n    }\n\n`;
  backend = mustReplace(backend, marker, route + marker, 'intelligence API routes');
}
backend = backend.replace('publish_results, instagram_options, last_error, created_at, updated_at', 'publish_results, instagram_options, timezone, last_error, created_at, updated_at');

if (!backend.includes('const timezone = validTimeZone(String(body.timezone || \'\')) || null;')) {
  backend = mustReplace(backend,
    '      const instagramOptions = igOptionsResult.value;\n      const id = crypto.randomUUID();',
    "      const instagramOptions = igOptionsResult.value;\n      const timezone = validTimeZone(String(body.timezone || '')) || null;\n      const id = crypto.randomUUID();",
    'create post timezone');
}
backend = backend.replace(
  'INSERT INTO posts (id, caption, platforms, media_key, media_type, status, scheduled_at, instagram_options, created_at, updated_at)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  'INSERT INTO posts (id, caption, platforms, media_key, media_type, status, scheduled_at, instagram_options, timezone, created_at, updated_at)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
backend = mustReplace(backend,
  '        instagramOptions ? JSON.stringify(instagramOptions) : null,\n        now,\n        now\n      ).run();',
  '        instagramOptions ? JSON.stringify(instagramOptions) : null,\n        timezone,\n        now,\n        now\n      ).run();',
  'create post timezone bind');

// Scheduled edits also preserve/update browser timezone.
const secondIgMarker = '      const instagramOptions = igOptionsResult.value;\n\n      const now = new Date().toISOString();';
if (backend.includes(secondIgMarker)) {
  backend = backend.replace(secondIgMarker, "      const instagramOptions = igOptionsResult.value;\n      const timezone = validTimeZone(String(body.timezone || '')) || null;\n\n      const now = new Date().toISOString();");
}
backend = backend.replace(
  'SET caption=?, platforms=?, media_key=?, media_type=?, scheduled_at=?, instagram_options=?,\n            last_error=NULL, publish_results=NULL, updated_at=?',
  'SET caption=?, platforms=?, media_key=?, media_type=?, scheduled_at=?, instagram_options=?, timezone=?,\n            last_error=NULL, publish_results=NULL, updated_at=?'
);
backend = mustReplace(backend,
  '        scheduledDate.toISOString(),\n        instagramOptions ? JSON.stringify(instagramOptions) : null,\n        now,\n        id\n      ).run();',
  '        scheduledDate.toISOString(),\n        instagramOptions ? JSON.stringify(instagramOptions) : null,\n        timezone,\n        now,\n        id\n      ).run();',
  'scheduled edit timezone bind');

backend = backend.replace('    ctx.waitUntil(processDuePosts(env));', '    ctx.waitUntil(Promise.all([processDuePosts(env), processPerformanceTracking(env)]));');

if (!backend.includes('seedPerformanceTracking(env, post, results, now)')) {
  const endMarker = "    id\n  ).run();\n}\n\nfunction tiktokConfigured(env) {";
  const replacement = "    id\n  ).run();\n  if (successes) await seedPerformanceTracking(env, post, results, now);\n}\n\n" + performanceSnippet + "\nfunction tiktokConfigured(env) {";
  backend = mustReplace(backend, endMarker, replacement, 'performance tracking seed/functions');
}
write('src/index.js', backend);

// Frontend sends browser timezone with posts.
let app = read('public/app.js');
app = app.replace(
  'body:JSON.stringify({ caption:draft.caption, platforms:draft.platforms, status:apiStatus, scheduledAt:draft.scheduledAt, mediaKey, mediaType, instagramOptions:draft.instagramOptions }),',
  "body:JSON.stringify({ caption:draft.caption, platforms:draft.platforms, status:apiStatus, scheduledAt:draft.scheduledAt, mediaKey, mediaType, instagramOptions:draft.instagramOptions, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || null }),"
);
app = app.replace(
  '      instagramOptions:draft.instagramOptions,\n    }),',
  '      instagramOptions:draft.instagramOptions,\n      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || null,\n    }),'
);
write('public/app.js', app);

// Reach Intelligence now consumes learned performance profile.
write('public/reach-intelligence.js', reachFull);

let html = read('public/index.html');
if (!html.includes('id="reachPersonalizedSummary"')) {
  html = mustReplace(html,
    '              </div>\n              <div class="reach-intel-grid">',
    '              </div>\n              <div id="reachPersonalizedSummary" class="reach-personalized-summary">PERFORMANCE LEARNING · loading your results…</div>\n              <div class="reach-intel-grid">',
    'Reach Intelligence personalized summary');
}
html = html.replace('<div class="reach-intel-note">Learning mode:', '<div id="reachLearningNote" class="reach-intel-note">Learning mode:');
html = html.replace('Social Publisher v0.6.7</div>', 'Social Publisher v0.6.8</div>');
write('public/index.html', html);

let css = read('public/styles.css');
if (!css.includes('v0.6.8 Performance Learning')) {
  css += `\n/* v0.6.8 Performance Learning */\n.reach-personalized-summary{margin:-2px 0 10px;border:1px solid rgba(155,122,255,.32);background:rgba(124,92,255,.08);border-radius:10px;padding:7px 9px;color:#cfc4ff;font-size:8px;font-weight:900;letter-spacing:.08em}.reach-intel-note{border-top:1px solid rgba(255,255,255,.05);padding-top:8px}\n`;
}
write('public/styles.css', css);

let sw = read('public/service-worker.js');
sw = sw.replace("const CACHE = 'social-publisher-shell-v670';", "const CACHE = 'social-publisher-shell-v680';");
write('public/service-worker.js', sw);

// Versions + check script.
write('package.json', read('package.json')
  .replace('"version": "0.6.7"', '"version": "0.6.8"')
  .replace('"check": "node --check src/index.js && node --check public/app.js"', '"check": "node --check src/index.js && node --check public/app.js && node --check public/reach-intelligence.js"'));
write('package-lock.json', read('package-lock.json').replaceAll('"version": "0.6.7"', '"version": "0.6.8"'));
write('VERSION.txt', 'Rick Parma Social Publisher\nVersion 0.6.8 - Performance Learning\n');
write('UPGRADE-v0.6.8.md', `# Social Publisher v0.6.8\n\nPerformance Learning turns Reach Intelligence from general guidance into a system that learns from published results.\n\n- Automatically tracks supported Instagram and Facebook post engagement after publishing.\n- Samples results around 2h, 24h and 72h and backfills recent published posts.\n- Normalizes performance within each platform before comparing formats and timing.\n- Learns best day/time windows, strongest format and useful caption patterns after 5 usable posts.\n- Reach Intelligence switches from Learning Mode to Personalized Mode automatically.\n- Browser timezone is stored on new posts so timing is learned in the creator's local time.\n- Threads is prepared for performance learning but needs threads_manage_insights permission before its metrics can join the model.\n- TikTok draft uploads cannot be reliably mapped to a final TikTok post yet, so TikTok is not used in the learning score.\n- Existing Max Reach routing, retries and publishing behavior are unchanged.\n\nDatabase migration required: npm run db:migrate\nNo new secrets are required. Existing platform connections do not need to be disconnected.\n`);

// Tests.
let tests = read('tests/smoke.test.mjs');
tests = tests.replace("assert.equal(health.version, '0.6.7');", "assert.equal(health.version, '0.6.8');");
if (!tests.includes("test('Performance Learning schema upgrades cleanly'")) {
  tests += `\n\ntest('Performance Learning schema upgrades cleanly', () => {\n  const schema = read('schema.sql');\n  const migration1 = read('migrations/0001_instagram_options.sql');\n  const migration2 = read('migrations/0002_performance_learning.sql');\n  const fresh = new DatabaseSync(':memory:');\n  fresh.exec(schema);\n  const columns = fresh.prepare('PRAGMA table_info(posts)').all().map(row => row.name);\n  assert.equal(columns.includes('timezone'), true);\n  assert.equal(fresh.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='performance_tracking'\").get().name, 'performance_tracking');\n  assert.equal(fresh.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='performance_snapshots'\").get().name, 'performance_snapshots');\n  const previous = schema\n    .replace(/\\n\\s*instagram_options TEXT,/, '')\n    .replace(/\\n\\s*timezone TEXT,/, '')\n    .replace(/\\n\\nCREATE TABLE IF NOT EXISTS performance_tracking[\\s\\S]*$/, '');\n  const upgraded = new DatabaseSync(':memory:');\n  upgraded.exec(previous);\n  upgraded.exec(migration1);\n  upgraded.exec(migration2);\n  const upgradedColumns = upgraded.prepare('PRAGMA table_info(posts)').all().map(row => row.name);\n  assert.equal(upgradedColumns.includes('instagram_options'), true);\n  assert.equal(upgradedColumns.includes('timezone'), true);\n});\n\ntest('Performance Learning is wired into publishing and Reach Intelligence', () => {\n  const backend = read('src/index.js');\n  const frontend = read('public/app.js');\n  const reach = read('public/reach-intelligence.js');\n  const html = read('public/index.html');\n  const sw = read('public/service-worker.js');\n  for (const needle of ['processPerformanceTracking','seedPerformanceTracking','fetchInstagramPerformance','fetchFacebookPerformance','buildPerformanceProfile','/api/intelligence/profile','performance_snapshots']) assert.equal(backend.includes(needle), true, 'backend missing ' + needle);\n  assert.equal(frontend.includes('resolvedOptions().timeZone'), true);\n  for (const needle of ['loadPerformanceProfile','nextPersonalizedSlot','PERSONALIZED','Use My Best Time','bestFormat','captionPattern']) assert.equal(reach.includes(needle), true, 'reach missing ' + needle);\n  assert.equal(html.includes('id=\"reachPersonalizedSummary\"'), true);\n  assert.equal(html.includes('id=\"reachLearningNote\"'), true);\n  assert.equal(sw.includes('social-publisher-shell-v680'), true);\n});\n`;
}
write('tests/smoke.test.mjs', tests);

console.log('Built Social Publisher v0.6.8 Performance Learning');
