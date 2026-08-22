from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]


def read(rel):
    return (root / rel).read_text()


def write(rel, text):
    (root / rel).write_text(text)


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing expected text for {label}')
    return text.replace(old, new, 1)


# Backend
src = read('src/index.js')
src = src.replace("version: '0.6.6'", "version: '0.6.6.1'")
src = src.replace('RickParma-SocialPublisher/0.6.6', 'RickParma-SocialPublisher/0.6.6.1')
src = replace_once(
    src,
    "p === 'instagram_reel' || p === 'instagram_story' || p === 'facebook_reel'",
    "p === 'instagram_reel' || p === 'instagram_story' || p === 'facebook_reel' || p === 'threads'",
    'long video cron routing',
)
src = replace_once(
    src,
    'const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();',
    'const staleCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();',
    'stale publishing cutoff',
)

retry_pattern = re.compile(r"    if \(url\.pathname\.match\(\^?/api/posts|$a\)", re.S)
old_retry = '''    if (url.pathname.match(/^\\/api\\/posts\\/[^/]+\\/retry$/) && request.method === 'POST') {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE posts SET status='queued', last_error=NULL, updated_at=? WHERE id=?").bind(now, id).run();
      ctx.waitUntil(processPost(env, id));
      return json({ ok: true });
    }
'''
new_retry = '''    if (url.pathname.match(/^\\/api\\/posts\\/[^/]+\\/retry$/) && request.method === 'POST') {
      const id = decodeURIComponent(url.pathname.split('/')[3]);
      const existing = await env.DB.prepare(`
        SELECT status, publish_results FROM posts WHERE id=?
      `).bind(id).first();
      if (!existing) return json({ error:'Post not found.' }, { status:404 });
      if (!['failed','partial_failed'].includes(existing.status)) {
        return json({ error:'Only failed posts can be retried.' }, { status:409 });
      }
      const priorResults = safeJson(existing.publish_results, {});
      const failedPlatforms = Object.entries(priorResults)
        .filter(([, result]) => !result?.ok)
        .map(([platform]) => platform);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE posts SET status='queued', last_error=NULL, updated_at=? WHERE id=?").bind(now, id).run();
      // Cron owns retries so long-running video processing is not tied to an HTTP request lifetime.
      return json({ ok:true, status:'queued', failedPlatforms });
    }
'''
src = replace_once(src, old_retry, new_retry, 'retry endpoint')

process_pattern = re.compile(r"async function processPost\(env, id\) \{.*?\n\}\n\nfunction tiktokConfigured", re.S)
new_process = '''async function processPost(env, id) {
  const row = await env.DB.prepare(`
    SELECT id, caption, platforms, media_key, media_type, status, scheduled_at, instagram_options, publish_results
    FROM posts WHERE id=?
  `).bind(id).first();
  if (!row || !['queued', 'scheduled', 'ready_to_publish', 'failed', 'partial_failed'].includes(row.status)) return;
  if (row.status === 'scheduled' && row.scheduled_at && new Date(row.scheduled_at) > new Date()) return;

  const claimed = await env.DB.prepare(`
    UPDATE posts SET status='publishing', updated_at=?
    WHERE id=? AND status IN ('queued','scheduled','ready_to_publish','failed','partial_failed')
  `).bind(new Date().toISOString(), id).run();
  if (!claimed.meta?.changes) return;

  const post = parsePost(row);
  const previousResults = post.publish_results && typeof post.publish_results === 'object' ? post.publish_results : {};
  const isRetry = Object.keys(previousResults).length > 0;
  const results = isRetry ? { ...previousResults } : {};
  const platformsToPublish = isRetry
    ? post.platforms.filter(platform => !previousResults[platform]?.ok)
    : post.platforms;

  for (const platform of platformsToPublish) {
    try {
      if (platform === 'facebook') results.facebook = await publishFacebook(env, post);
      else if (platform === 'facebook_reel') results.facebook_reel = await publishFacebookReel(env, post);
      else if (platform === 'instagram' || platform.startsWith('instagram_')) results[platform] = await publishInstagram(env, post, platform === 'instagram' ? 'post' : platform.replace('instagram_',''));
      else if (platform === 'threads') results.threads = await publishThreads(env, post);
      else if (platform === 'tiktok') results.tiktok = await uploadTikTokDraft(env, post);
      else throw new Error(`${platform} publishing is not connected yet.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[platform] = { ok:false, error:message };
      console.error(`Publishing ${id} to ${platform} failed`, err);
    }
  }

  const successes = post.platforms.filter(platform => results[platform]?.ok).length;
  const failures = post.platforms
    .filter(platform => !results[platform]?.ok)
    .map(platform => `${platform}: ${results[platform]?.error || 'Publishing failed.'}`);
  const finalStatus = successes === post.platforms.length ? 'published' : successes > 0 ? 'partial_failed' : 'failed';
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE posts
    SET status=?, published_at=?, publish_results=?, last_error=?, updated_at=?
    WHERE id=?
  `).bind(
    finalStatus,
    successes ? now : null,
    JSON.stringify(results),
    failures.length ? failures.join(' | ') : null,
    now,
    id
  ).run();
}

function tiktokConfigured'''
src, count = process_pattern.subn(new_process, src, count=1)
if count != 1:
    raise SystemExit('Could not replace processPost')

threads_pattern = re.compile(r"async function waitForThreadsContainer\(id,token\) \{.*?\n\}", re.S)
new_threads_wait = '''async function waitForThreadsContainer(id,token) {
  // Threads video containers commonly need longer than the old ~30 second window.
  // Cron owns video jobs, so allow up to roughly four minutes before surfacing a retry.
  const attempts = 17;
  const intervalMs = 15_000;
  for (let i = 0; i < attempts; i++) {
    const u = new URL(`https://graph.threads.net/v1.0/${id}`);
    u.searchParams.set('fields','status,error_message');
    u.searchParams.set('access_token',token);
    const r = await fetch(u);
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.error?.message || 'Could not check Threads media status.');
    if (['FINISHED','PUBLISHED'].includes(data.status)) return;
    if (['ERROR','EXPIRED'].includes(data.status)) throw new Error(data.error_message || `Threads media status: ${data.status}`);
    if (i < attempts - 1) await sleep(intervalMs);
  }
  throw new Error('Threads is still processing the media after several minutes. Retry will target Threads only.');
}'''
src, count = threads_pattern.subn(new_threads_wait, src, count=1)
if count != 1:
    raise SystemExit('Could not replace Threads polling')
write('src/index.js', src)

# Tests
tests = read('tests/smoke.test.mjs')
tests = tests.replace("assert.equal(health.version, '0.6.6');", "assert.equal(health.version, '0.6.6.1');")
append_test = r'''

test('Threads video jobs and retries are cron-owned and failed-only', () => {
  const backend = read('src/index.js');
  assert.equal(backend.includes("p === 'facebook_reel' || p === 'threads'"), true);
  assert.equal(backend.includes('const attempts = 17;'), true);
  assert.equal(backend.includes('const intervalMs = 15_000;'), true);
  assert.equal(backend.includes('SELECT status, publish_results FROM posts WHERE id=?'), true);
  assert.equal(backend.includes("post.platforms.filter(platform => !previousResults[platform]?.ok)"), true);
  assert.equal(backend.includes("const results = isRetry ? { ...previousResults } : {};"), true);
  const retryBlock = backend.match(/if \(url\.pathname\.match\(\/\^\\\/api\\\/posts.*?failedPlatforms \}\);\n    \}/s)?.[0] || '';
  assert.equal(retryBlock.includes('ctx.waitUntil(processPost(env, id))'), false);
});
'''
if "Threads video jobs and retries are cron-owned and failed-only" not in tests:
    tests += append_test
write('tests/smoke.test.mjs', tests)

# Version files
package = read('package.json').replace('"version": "0.6.6"', '"version": "0.6.6.1"', 1)
write('package.json', package)
lock = read('package-lock.json')
lock = lock.replace('"version": "0.6.6"', '"version": "0.6.6.1"', 2)
write('package-lock.json', lock)
write('VERSION.txt', 'Rick Parma Social Publisher\nVersion 0.6.6.1 - Threads video retry reliability\n')

sw = read('public/service-worker.js')
sw = replace_once(sw, "const CACHE = 'social-publisher-shell-v660';", "const CACHE = 'social-publisher-shell-v661';", 'service worker cache')
write('public/service-worker.js', sw)

write('UPGRADE-v0.6.6.1.md', '''# Social Publisher v0.6.6.1\n\nReliability patch for multi-platform Max Reach video posts.\n\n- Threads video processing now waits up to roughly four minutes instead of about 30 seconds.\n- Video jobs that include Threads are owned by the scheduled worker rather than an HTTP background task.\n- Retry preserves prior successful platform receipts and publishes only destinations that previously failed.\n- Retry is accepted only for failed or partially failed posts.\n- Publishing stale-job recovery window increased to 20 minutes to accommodate sequential Meta/Threads video processing.\n- No D1 migration, secrets, or account reconnects are required.\n''')
