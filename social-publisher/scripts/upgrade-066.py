from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(rel):
    return (ROOT / rel).read_text()

def write(rel, text):
    (ROOT / rel).write_text(text)

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

def replace_n(text, old, new, expected, label):
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f'{label}: expected {expected} matches, found {count}')
    return text.replace(old, new)

# package version
p = read('package.json')
p = replace_once(p, '"version": "0.6.5.1"', '"version": "0.6.6"', 'package version')
write('package.json', p)

# backend
s = read('src/index.js')
s = replace_once(s, "version: '0.6.5.1'", "version: '0.6.6'", 'health version')
s = replace_n(
    s,
    "const allowedPlatforms = ['facebook','instagram','instagram_post','instagram_story','instagram_reel','threads','tiktok'];",
    "const allowedPlatforms = ['facebook','facebook_reel','instagram','instagram_post','instagram_story','instagram_reel','threads','tiktok'];",
    2,
    'allowed platforms'
)
s = replace_n(
    s,
    "if (body.platforms.includes('instagram_reel') && body.mediaKey && !mt.startsWith('video/')) return json({ error:'Instagram Reel requires a video.' }, { status:400 });",
    "if (body.platforms.includes('instagram_reel') && body.mediaKey && !mt.startsWith('video/')) return json({ error:'Instagram Reel requires a video.' }, { status:400 });\n      if (body.platforms.includes('facebook_reel') && body.mediaKey && !mt.startsWith('video/')) return json({ error:'Facebook Reel requires a video.' }, { status:400 });",
    2,
    'Facebook Reel validation'
)
s = replace_once(
    s,
    "const instagramVideoJob = mt.startsWith('video/') && body.platforms.some(p =>\n          p === 'instagram_reel' || p === 'instagram_story'\n        );\n        if (!instagramVideoJob) ctx.waitUntil(processPost(env, id));",
    "const longVideoJob = mt.startsWith('video/') && body.platforms.some(p =>\n          p === 'instagram_reel' || p === 'instagram_story' || p === 'facebook_reel'\n        );\n        if (!longVideoJob) ctx.waitUntil(processPost(env, id));",
    'long video job routing'
)
s = replace_once(
    s,
    "if (platform === 'facebook') results.facebook = await publishFacebook(env, post);\n      else if (platform === 'instagram' || platform.startsWith('instagram_'))",
    "if (platform === 'facebook') results.facebook = await publishFacebook(env, post);\n      else if (platform === 'facebook_reel') results.facebook_reel = await publishFacebookReel(env, post);\n      else if (platform === 'instagram' || platform.startsWith('instagram_'))",
    'process Facebook Reel'
)
fb_reel_fn = '''\nasync function publishFacebookReel(env, post) {\n  const account = await loadSocialAccount(env, 'facebook');\n  if (!account) throw new Error('Facebook is not connected.');\n  if (!post.media_key || !String(post.media_type || '').startsWith('video/')) throw new Error('Facebook Reel requires a video.');\n  const token = await decryptSecret(account.access_token_encrypted, env.TOKEN_ENCRYPTION_KEY);\n  const version = env.META_GRAPH_VERSION || 'v24.0';\n  const mediaUrl = publicMediaUrl(env, post.media_key);\n\n  const startForm = new URLSearchParams();\n  startForm.set('access_token', token);\n  startForm.set('upload_phase', 'start');\n  const started = await graphPost(`https://graph.facebook.com/${version}/me/video_reels`, startForm);\n  if (!started.video_id || !started.upload_url) throw new Error('Facebook did not return a Reel upload session.');\n\n  const uploadResponse = await fetch(started.upload_url, {\n    method:'POST',\n    headers:{\n      'Authorization':`OAuth ${token}`,\n      'file_url':mediaUrl,\n      'User-Agent':'RickParma-SocialPublisher/0.6.6',\n    },\n  });\n  const uploaded = await uploadResponse.json().catch(() => ({}));\n  if (!uploadResponse.ok || uploaded.success === false || uploaded.error) {\n    throw new Error(uploaded.error?.message || 'Facebook Reel upload failed.');\n  }\n\n  const finishForm = new URLSearchParams();\n  finishForm.set('access_token', token);\n  finishForm.set('video_id', started.video_id);\n  finishForm.set('upload_phase', 'finish');\n  finishForm.set('video_state', 'PUBLISHED');\n  finishForm.set('description', post.caption);\n  const finished = await graphPost(`https://graph.facebook.com/${version}/me/video_reels`, finishForm);\n  return { ok:true, id:finished.id || started.video_id, videoId:started.video_id, type:'reel' };\n}\n'''
s = replace_once(s, "\nasync function publishInstagram(env, post, publishType = 'post') {", fb_reel_fn + "\nasync function publishInstagram(env, post, publishType = 'post') {", 'insert Facebook Reel publisher')
write('src/index.js', s)

# frontend HTML
h = read('public/index.html')
max_reach = '''\n          <div id="maxReachCard" class="card max-reach-card">\n            <div class="max-reach-head">\n              <div>\n                <div class="section-label">Max Reach</div>\n                <div class="field-hint left-hint">Social Publisher analyzes the media and recommends the strongest distribution mix.</div>\n              </div>\n              <span id="maxReachBadge" class="max-reach-badge">ANALYZE</span>\n            </div>\n            <div id="maxReachSummary" class="max-reach-summary">Add a photo or video to get a recommendation.</div>\n            <div id="maxReachDetails" class="max-reach-details"></div>\n            <button id="applyMaxReachBtn" class="button max-reach-button full" type="button" disabled>Apply Recommendation</button>\n          </div>\n'''
h = replace_once(h, '''          <div id="mediaActions" class="media-actions hidden">\n            <button id="changeMediaBtn" class="text-button" type="button">Change</button>\n            <button id="removeMediaBtn" class="text-button danger" type="button">Remove</button>\n          </div>\n''', '''          <div id="mediaActions" class="media-actions hidden">\n            <button id="changeMediaBtn" class="text-button" type="button">Change</button>\n            <button id="removeMediaBtn" class="text-button danger" type="button">Remove</button>\n          </div>\n''' + max_reach, 'Max Reach card')
fb_type = '''\n            <div id="facebookTypeWrap" class="fb-type-wrap">\n              <div class="section-label small-label">Facebook Type</div>\n              <div class="segmented fb-type-segmented">\n                <label class="segment active"><input type="radio" name="fbType" value="post" checked /><span>Post / Video</span></label>\n                <label class="segment"><input type="radio" name="fbType" value="reel" /><span>Reel</span></label>\n              </div>\n              <div class="field-hint">Use Reel for qualifying 9:16 short-form video.</div>\n            </div>\n'''
h = replace_once(h, '''            <div id="instagramReelAudioWrap" class="ig-audio-wrap hidden">''', fb_type + '''\n            <div id="instagramReelAudioWrap" class="ig-audio-wrap hidden">''', 'Facebook type selector')
h = replace_once(h, '<div class="segmented">\n              <label class="segment active">\n                <input type="radio" name="timing"', '<div class="segmented timing-segmented">\n              <label class="segment active">\n                <input type="radio" name="timing"', 'timing segmented class')
h = replace_once(h, 'Social Publisher v0.6.5</div>', 'Social Publisher v0.6.6</div>', 'HTML version footer')
write('public/index.html', h)

# frontend JS
j = read('public/app.js')
fb_ui = '''function currentFacebookType() { return $('input[name="fbType"]:checked')?.value || 'post'; }\nfunction updateFacebookTypeVisibility() {\n  const selected = $('.platform-chip[data-platform="facebook"] input')?.checked;\n  $('#facebookTypeWrap')?.classList.toggle('hidden', !selected);\n}\n$('.platform-chip[data-platform="facebook"] input')?.addEventListener('change', updateFacebookTypeVisibility);\n$$('input[name="fbType"]').forEach(input => input.addEventListener('change', () => {\n  $$('.fb-type-segmented .segment').forEach(s => s.classList.toggle('active', s.querySelector('input')?.checked));\n}));\nupdateFacebookTypeVisibility();\n\n'''
j = replace_once(j, 'updateInstagramTypeVisibility();\n\nfunction normalizeIgUsername', 'updateInstagramTypeVisibility();\n\n' + fb_ui + 'function normalizeIgUsername', 'Facebook type JS')
j = replace_n(j, "$$('.segmented:not(.ig-type-segmented) .segment')", "$$('.timing-segmented .segment')", 2, 'timing selector scope')
max_reach_js = '''function readVideoMetadata(file) {\n  return new Promise(resolve => {\n    const url = URL.createObjectURL(file);\n    const video = document.createElement('video');\n    video.preload = 'metadata';\n    video.muted = true;\n    const done = value => { URL.revokeObjectURL(url); resolve(value); };\n    video.onloadedmetadata = () => done({ width:video.videoWidth || 0, height:video.videoHeight || 0, duration:Number.isFinite(video.duration) ? video.duration : 0 });\n    video.onerror = () => done({});\n    video.src = url;\n  });\n}\n\nfunction getMaxReachRecommendation() {\n  const media = state.currentMedia;\n  if (!media) return { ready:false, badge:'ANALYZE', summary:'Add a photo or video to get a recommendation.', details:[] };\n  const type = String(media.type || '');\n  if (type.startsWith('image/')) {\n    return {\n      ready:true, badge:'PHOTO',\n      summary:'Best fit: Feed distribution across Instagram, Facebook and Threads.',\n      details:['Instagram Post for saves, shares and profile discovery','Facebook Post for your Page audience','Threads for an extra conversation surface','Story can be a follow-up after the feed post'],\n      platforms:['instagram_post','facebook','threads'],\n    };\n  }\n  if (type.startsWith('video/')) {\n    const width = Number(media.width || 0), height = Number(media.height || 0), duration = Number(media.duration || 0);\n    const ratio = width > 0 && height > 0 ? width / height : 0;\n    const hasMetadata = width > 0 && height > 0 && duration > 0;\n    const fbReelEligible = hasMetadata && width >= 540 && height >= 960 && duration >= 4 && duration <= 60 && Math.abs(ratio - (9/16)) <= 0.025;\n    if (fbReelEligible) {\n      return {\n        ready:true, badge:'SHORT VIDEO',\n        summary:'Best fit: short-form Reel distribution on both Meta platforms.',\n        details:[`Detected ${width}×${height} · ${Math.round(duration)} sec`,`Instagram Reel with Share to Feed already enabled`,`Facebook Reel instead of a standard Page video`,`Threads + TikTok add more distribution surfaces`],\n        platforms:['instagram_reel','facebook_reel','threads','tiktok'],\n      };\n    }\n    const mediaLine = hasMetadata ? `Detected ${width}×${height} · ${Math.round(duration)} sec` : 'Video detected; exact dimensions are unavailable for reused media';\n    return {\n      ready:true, badge:'VIDEO',\n      summary:'Strong video mix: Instagram Reel plus broad distribution; Facebook stays standard video unless the file is Reel-ready.',\n      details:[mediaLine,'Instagram Reel is recommended for discovery','Facebook Post / Video avoids forcing a non-compliant Reel','Threads + TikTok extend distribution'],\n      platforms:['instagram_reel','facebook','threads','tiktok'],\n    };\n  }\n  return { ready:false, badge:'MEDIA', summary:'This media type cannot be analyzed yet.', details:[] };\n}\n\nfunction updateMaxReachRecommendation() {\n  const rec = getMaxReachRecommendation();\n  if ($('#maxReachBadge')) $('#maxReachBadge').textContent = rec.badge;\n  if ($('#maxReachSummary')) $('#maxReachSummary').textContent = rec.summary;\n  if ($('#maxReachDetails')) $('#maxReachDetails').innerHTML = (rec.details || []).map(item => `<div><span>✓</span>${escapeHtml(item)}</div>`).join('');\n  if ($('#applyMaxReachBtn')) $('#applyMaxReachBtn').disabled = !rec.ready;\n}\n\nfunction applyMaxReachRecommendation() {\n  const rec = getMaxReachRecommendation();\n  if (!rec.ready) return toast('Add media first.');\n  setPlatformSelection(rec.platforms || []);\n  updateInstagramTypeVisibility();\n  updateFacebookTypeVisibility();\n  toast('Max Reach recommendation applied.');\n}\n$('#applyMaxReachBtn')?.addEventListener('click', applyMaxReachRecommendation);\n\n'''
j = replace_once(j, 'async function handleMedia(file) {', max_reach_js + 'async function handleMedia(file) {', 'Max Reach JS')
j = replace_once(j, '''    const dataUrl = await fileToDataUrl(currentFile);\n    state.currentMedia = { name:currentFile.name, type:currentFile.type, dataUrl, createdAt:new Date().toISOString() };''', '''    const metadata = currentFile.type.startsWith('video/') ? await readVideoMetadata(currentFile) : {};\n    const dataUrl = await fileToDataUrl(currentFile);\n    state.currentMedia = { name:currentFile.name, type:currentFile.type, dataUrl, ...metadata, createdAt:new Date().toISOString() };''', 'video metadata capture')
j = replace_once(j, '''function renderCurrentMedia() {\n  const media = state.currentMedia;''', '''function renderCurrentMedia() {\n  const media = state.currentMedia;\n  updateMaxReachRecommendation();''', 'refresh Max Reach with media')
j = replace_once(j, '''    if (i.value === 'instagram') return `instagram_${currentInstagramType()}`;\n    return i.value;''', '''    if (i.value === 'instagram') return `instagram_${currentInstagramType()}`;\n    if (i.value === 'facebook') return currentFacebookType() === 'reel' ? 'facebook_reel' : 'facebook';\n    return i.value;''', 'selected Facebook type')
j = replace_once(j, '''  if (platforms.includes('instagram_reel') && hasMedia && !mediaType.startsWith('video/')) return 'Instagram Reel requires a video.';\n  return '';''', '''  if (platforms.includes('instagram_reel') && hasMedia && !mediaType.startsWith('video/')) return 'Instagram Reel requires a video.';\n  if (platforms.includes('facebook_reel') && hasMedia && !mediaType.startsWith('video/')) return 'Facebook Reel requires a video.';\n  return '';''', 'frontend Facebook Reel validation')
old_set = '''function setPlatformSelection(platforms = []) {\n  $$('.platform-chip').forEach(card => {\n    const input = card.querySelector('input');\n    if (!input || input.disabled) return;\n    input.checked = platforms.includes(input.value);\n    card.classList.toggle('selected', input.checked);\n  });\n}'''
new_set = '''function setPlatformSelection(platforms = []) {\n  const normalized = platforms.map(p => p === 'facebook_reel' ? 'facebook' : (p === 'instagram' || p.startsWith('instagram_') ? 'instagram' : p));\n  $$('.platform-chip').forEach(card => {\n    const input = card.querySelector('input');\n    if (!input || input.disabled) return;\n    input.checked = normalized.includes(input.value);\n    card.classList.toggle('selected', input.checked);\n  });\n  const ig = platforms.find(p => p.startsWith('instagram_'));\n  const igType = ig ? ig.replace('instagram_','') : 'post';\n  const igInput = $(`input[name="igType"][value="${igType}"]`);\n  if (igInput) { igInput.checked = true; $$('.ig-type-segmented .segment').forEach(s => s.classList.toggle('active', s.querySelector('input')?.checked)); }\n  const fbType = platforms.includes('facebook_reel') ? 'reel' : 'post';\n  const fbInput = $(`input[name="fbType"][value="${fbType}"]`);\n  if (fbInput) { fbInput.checked = true; $$('.fb-type-segmented .segment').forEach(s => s.classList.toggle('active', s.querySelector('input')?.checked)); }\n}'''
j = replace_once(j, old_set, new_set, 'setPlatformSelection')
j = replace_n(j, "setPlatformSelection(plats.map(p => p.startsWith('instagram_') || p === 'instagram' ? 'instagram' : p));", "setPlatformSelection(plats);", 1, 'scheduled edit platform restore')
j = replace_n(j, "setPlatformSelection(platforms.map(p => p.startsWith('instagram_') || p === 'instagram' ? 'instagram' : p));", "setPlatformSelection(platforms);", 1, 'reuse platform restore')
j = replace_once(j, "function platformName(p) { return ({instagram:'Instagram',instagram_post:'Instagram Post',instagram_story:'Instagram Story',instagram_reel:'Instagram Reel',facebook:'Facebook',threads:'Threads',tiktok:'TikTok'}[p] || p); }", "function platformName(p) { return ({instagram:'Instagram',instagram_post:'Instagram Post',instagram_story:'Instagram Story',instagram_reel:'Instagram Reel',facebook:'Facebook',facebook_reel:'Facebook Reel',threads:'Threads',tiktok:'TikTok'}[p] || p); }", 'platform label')
write('public/app.js', j)

# styles
css = read('public/styles.css')
css += '''\n\n/* v0.6.6 Max Reach */\n.max-reach-card{border-color:#443d78;background:linear-gradient(145deg,rgba(124,92,255,.14),rgba(18,22,32,.98));box-shadow:0 14px 36px rgba(30,20,70,.15)}\n.max-reach-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.max-reach-head .field-hint{margin-top:4px;max-width:470px}\n.max-reach-badge{border:1px solid #6959ad;background:#261f40;color:#d5ccff;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;letter-spacing:.08em;white-space:nowrap}\n.max-reach-summary{font-size:13px;font-weight:800;line-height:1.4;margin-top:12px;color:#f3f0ff}\n.max-reach-details{display:grid;gap:7px;margin:10px 0 12px}.max-reach-details div{display:grid;grid-template-columns:18px 1fr;gap:6px;color:#aab2c1;font-size:11px;line-height:1.35}.max-reach-details div span{color:#9b8bff;font-weight:900}\n.max-reach-button{background:#211c37;border-color:#55468b;color:#ded8ff}.max-reach-button:disabled{opacity:.45}\n.fb-type-wrap{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}\n.fb-type-segmented{grid-template-columns:1fr 1fr}\n'''
write('public/styles.css', css)

# service worker
sw = read('public/service-worker.js')
sw = replace_once(sw, 'social-publisher-shell-v651', 'social-publisher-shell-v660', 'service worker cache')
write('public/service-worker.js', sw)

# tests
t = read('tests/smoke.test.mjs')
t = replace_once(t, "assert.equal(health.version, '0.6.5.1');", "assert.equal(health.version, '0.6.6');", 'health test version')
t = replace_once(t, "assert.equal(frontend.includes(\"$$('.segmented:not(.ig-type-segmented) .segment').forEach(segment\"), true);\n  assert.equal(frontend.includes(\"$$('.segment').forEach(segment => segment.addEventListener('click'\"), false);", "assert.equal(frontend.includes(\"$$('.timing-segmented .segment').forEach(segment\"), true);\n  assert.equal(frontend.includes(\"$$('.segment').forEach(segment => segment.addEventListener('click'\"), false);", 'selector regression test')
t += '''\n\ntest('Max Reach and Facebook Reel are wired end to end', () => {\n  const backend = read('src/index.js');\n  const frontend = read('public/app.js');\n  const html = read('public/index.html');\n\n  for (const needle of [\"facebook_reel\", 'publishFacebookReel', '/me/video_reels', \"'file_url':mediaUrl\"]) assert.equal(backend.includes(needle), true, `backend missing ${needle}`);\n  for (const needle of ['getMaxReachRecommendation', 'applyMaxReachRecommendation', 'currentFacebookType', 'readVideoMetadata', 'facebook_reel']) assert.equal(frontend.includes(needle), true, `frontend missing ${needle}`);\n  for (const needle of ['id=\"maxReachCard\"', 'id=\"applyMaxReachBtn\"', 'id=\"facebookTypeWrap\"', 'name=\"fbType\"']) assert.equal(html.includes(needle), true, `HTML missing ${needle}`);\n});\n'''
write('tests/smoke.test.mjs', t)

write('VERSION.txt', 'Rick Parma Social Publisher\nVersion 0.6.6 - Max Reach + Facebook Reels\n')
write('UPGRADE-v0.6.6.md', '''# Social Publisher v0.6.6\n\nAdds the first Max Reach engine and native Facebook Reel publishing.\n\n## Max Reach\n- Automatically analyzes uploaded media\n- Detects image vs video and reads video dimensions/duration\n- Recommends Instagram/Facebook post types and additional destinations\n- One tap applies the recommendation while respecting disconnected platforms\n- 9:16 videos from 4-60 seconds and at least 540x960 are routed to Facebook Reel\n\n## Facebook Reels\nUses Meta's Page Reels Publishing flow: create upload session, upload the hosted R2 media URL, then publish the Reel. Existing Facebook Page permissions are reused.\n\n## Upgrade\nNo D1 migration and no new secrets are required.\n\n1. npm install\n2. npm test\n3. npm run deploy\n''')
print('Social Publisher upgraded to v0.6.6')
