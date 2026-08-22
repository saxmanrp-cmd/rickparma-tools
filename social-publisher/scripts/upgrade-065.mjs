import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, content) { fs.writeFileSync(path.join(root, rel), content); }
function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Could not find patch target: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

{
  const rel = 'package.json';
  let s = read(rel);
  s = replaceOnce(s, '"version": "0.6.4"', '"version": "0.6.5"', 'package version');
  write(rel, s);
}

{
  const rel = 'src/index.js';
  let s = read(rel);
  s = replaceOnce(s,
    "return json({ ok: true, service: 'social-publisher-v3', version: '0.6.4', time: new Date().toISOString() });",
    "return json({ ok: true, service: 'social-publisher-v3', version: '0.6.5', time: new Date().toISOString() });",
    'health version');

  s = replaceOnce(s,
    "    createForm.set('media_type', 'REELS');\n    createForm.set('video_url', mediaUrl);\n    createForm.set('share_to_feed', 'true');",
    "    createForm.set('media_type', 'REELS');\n    createForm.set('video_url', mediaUrl);\n    createForm.set('share_to_feed', 'true');\n    if (igOptions.audioName) createForm.set('audio_name', igOptions.audioName);",
    'Reel audio_name');

  s = replaceOnce(s,
    "function normalizeInstagramOptions(value) {\n  const raw = value && typeof value === 'object' ? value : {};\n  const collaborators = Array.isArray(raw.collaborators)",
    "function normalizeInstagramOptions(value) {\n  const raw = value && typeof value === 'object' ? value : {};\n  const audioName = String(raw.audioName || '').trim().replace(/\\s+/g, ' ').slice(0, 100);\n  const collaborators = Array.isArray(raw.collaborators)",
    'normalize audioName');

  s = replaceOnce(s,
    "  return { userTags, collaborators };\n}\n\nfunction validateInstagramOptions",
    "  return { userTags, collaborators, audioName };\n}\n\nfunction validateInstagramOptions",
    'return audioName');

  s = replaceOnce(s,
    "  const rawTags = Array.isArray(value.userTags) ? value.userTags : [];\n  const rawCollabs = Array.isArray(value.collaborators) ? value.collaborators : [];",
    "  const rawTags = Array.isArray(value.userTags) ? value.userTags : [];\n  const rawCollabs = Array.isArray(value.collaborators) ? value.collaborators : [];\n  const rawAudioName = String(value.audioName || '').trim();\n  if (rawAudioName.length > 100) return { error:'Instagram Reel audio name must be 100 characters or fewer.' };",
    'validate audioName length');

  s = replaceOnce(s,
    "  if (platforms.includes('instagram_story')) return { value:null };\n  return { value:options.userTags.length || options.collaborators.length ? options : null };",
    "  if (platforms.includes('instagram_story')) return { value:null };\n  if (!platforms.includes('instagram_reel')) options.audioName = '';\n  return { value:options.userTags.length || options.collaborators.length || options.audioName ? options : null };",
    'preserve Reel audioName');

  write(rel, s);
}

{
  const rel = 'public/app.js';
  let s = read(rel);
  s = replaceOnce(s,
    "let instagramOptions = { userTags: [], collaborators: [] };",
    "let instagramOptions = { userTags: [], collaborators: [], audioName: '' };",
    'initial Instagram options');

  s = replaceOnce(s,
    "  $('#instagramTypeWrap')?.classList.toggle('hidden', !selected);\n  updateInstagramPeopleVisibility();",
    "  $('#instagramTypeWrap')?.classList.toggle('hidden', !selected);\n  updateInstagramPeopleVisibility();\n  updateInstagramReelAudioVisibility();",
    'type visibility audio');

  s = replaceOnce(s,
    "  $('#igTagPositionHelp')?.classList.toggle('hidden', type !== 'post');\n  renderInstagramPeople();\n}\n$('.platform-chip[data-platform=\"instagram\"] input')?.addEventListener('change', updateInstagramTypeVisibility);",
    "  $('#igTagPositionHelp')?.classList.toggle('hidden', type !== 'post');\n  renderInstagramPeople();\n}\nfunction updateInstagramReelAudioVisibility() {\n  const selected = $('.platform-chip[data-platform=\"instagram\"] input')?.checked;\n  const show = selected && currentInstagramType() === 'reel';\n  $('#instagramReelAudioWrap')?.classList.toggle('hidden', !show);\n  renderInstagramAudio();\n}\nfunction renderInstagramAudio() {\n  const input = $('#igAudioName');\n  if (input && input.value !== (instagramOptions.audioName || '')) input.value = instagramOptions.audioName || '';\n  if ($('#igAudioCount')) $('#igAudioCount').textContent = String((instagramOptions.audioName || '').length);\n}\n$('#igAudioName')?.addEventListener('input', event => {\n  instagramOptions.audioName = String(event.target.value || '').slice(0, 100);\n  if ($('#igAudioCount')) $('#igAudioCount').textContent = String(instagramOptions.audioName.length);\n});\n$('.platform-chip[data-platform=\"instagram\"] input')?.addEventListener('change', updateInstagramTypeVisibility);",
    'audio UI functions');

  s = replaceOnce(s,
    "  updateInstagramPeopleVisibility();\n}));",
    "  updateInstagramPeopleVisibility();\n  updateInstagramReelAudioVisibility();\n}));",
    'radio audio visibility');

  s = replaceOnce(s,
    "      collaborators:[...instagramOptions.collaborators],\n    };",
    "      collaborators:[...instagramOptions.collaborators],\n      audioName:currentInstagramType() === 'reel' ? String(instagramOptions.audioName || '').trim() : '',\n    };",
    'collect audioName');

  s = replaceOnce(s,
    "  instagramOptions = { userTags: [], collaborators: [] }; renderInstagramPeople();",
    "  instagramOptions = { userTags: [], collaborators: [], audioName: '' }; renderInstagramPeople(); renderInstagramAudio();",
    'clear audioName');

  s = s.replace(
    /instagramOptions = normalizeStoredInstagramOptions\(post\.instagramOptions\);\n  renderInstagramPeople\(\);/g,
    "instagramOptions = normalizeStoredInstagramOptions(post.instagramOptions);\n  renderInstagramPeople();\n  renderInstagramAudio();"
  );

  s = replaceOnce(s,
    "  const collaborators = Array.isArray(raw.collaborators) ? raw.collaborators.map(normalizeIgUsername).filter(Boolean).slice(0,3) : [];\n  return { userTags, collaborators };",
    "  const collaborators = Array.isArray(raw.collaborators) ? raw.collaborators.map(normalizeIgUsername).filter(Boolean).slice(0,3) : [];\n  const audioName = String(raw.audioName || '').trim().replace(/\\s+/g, ' ').slice(0,100);\n  return { userTags, collaborators, audioName };",
    'stored audioName');

  s = replaceOnce(s,
    "  if (opts.collaborators.length) bits.push(`Collab ${opts.collaborators.map(u=>'@'+escapeHtml(u)).join(', ')}`);\n  return bits.length ? `<div class=\"people-summary\">${bits.join(' · ')}</div>` : '';",
    "  if (opts.collaborators.length) bits.push(`Collab ${opts.collaborators.map(u=>'@'+escapeHtml(u)).join(', ')}`);\n  if (opts.audioName) bits.push(`Audio “${escapeHtml(opts.audioName)}”`);\n  return bits.length ? `<div class=\"people-summary\">${bits.join(' · ')}</div>` : '';",
    'history audio summary');

  write(rel, s);
}

{
  const rel = 'public/index.html';
  let s = read(rel);
  const anchor = `            <div id="instagramPeopleWrap" class="ig-people-wrap">`;
  const audio = `            <div id="instagramReelAudioWrap" class="ig-audio-wrap hidden">\n              <div class="ig-people-head">\n                <div>\n                  <div class="section-label small-label">Reel Audio</div>\n                  <div class="field-hint left-hint">Name the original audio already embedded in your video.</div>\n                </div>\n                <span class="advanced-badge">REEL</span>\n              </div>\n              <div class="ig-tool-block">\n                <div class="ig-tool-title"><strong>Original Audio Name</strong><span>Optional</span></div>\n                <input id="igAudioName" class="compact-input full-input" type="text" maxlength="100" autocomplete="off" placeholder="e.g. Live at Easy's — Rick Parma" />\n                <div class="audio-meta-row"><span>This renames your Reel's original audio. It does not add music from Instagram's licensed library.</span><b><span id="igAudioCount">0</span>/100</b></div>\n              </div>\n            </div>\n\n`;
  s = replaceOnce(s, anchor, audio + anchor, 'Reel audio markup');
  s = replaceOnce(s, 'Social Publisher v0.6.4', 'Social Publisher v0.6.5', 'HTML version');
  write(rel, s);
}

{
  const rel = 'public/styles.css';
  let s = read(rel);
  s += `\n\n/* v0.6.5 Reel original-audio naming */\n.ig-audio-wrap{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}\n.full-input{width:100%;min-height:44px;background:#0d1118;border:1px solid #2c3543;border-radius:12px;color:#fff;padding:10px 12px;outline:none}\n.audio-meta-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-top:7px;color:var(--muted);font-size:10px;line-height:1.4}\n.audio-meta-row span{flex:1}.audio-meta-row b{white-space:nowrap;color:#aeb6c5;font-weight:800}\n`;
  write(rel, s);
}

{
  const rel = 'public/service-worker.js';
  let s = read(rel);
  s = replaceOnce(s, "social-publisher-shell-v640", "social-publisher-shell-v650", 'service worker cache');
  write(rel, s);
}

{
  const rel = 'tests/smoke.test.mjs';
  let s = read(rel);
  s = replaceOnce(s, "assert.equal(health.version, '0.6.4');", "assert.equal(health.version, '0.6.5');", 'health test version');
  s += `\n\ntest('Instagram Reel original audio name is wired end to end', () => {\n  const backend = read('src/index.js');\n  const frontend = read('public/app.js');\n  const html = read('public/index.html');\n\n  assert.equal(backend.includes(\"createForm.set('audio_name', igOptions.audioName)\"), true);\n  assert.equal(backend.includes('audioName'), true);\n  assert.equal(frontend.includes('igAudioName'), true);\n  assert.equal(frontend.includes('audioName'), true);\n  assert.equal(html.includes('id=\"instagramReelAudioWrap\"'), true);\n  assert.equal(html.includes('id=\"igAudioName\"'), true);\n});\n`;
  write(rel, s);
}

write('VERSION.txt', 'Rick Parma Social Publisher\nVersion 0.6.5 - Instagram Reel original-audio naming\n');
write('UPGRADE-v0.6.5.md', [
  '# Social Publisher v0.6.5',
  '',
  'Adds Instagram Reel original-audio naming with Meta audio_name publishing support.',
  '',
  '## What changed',
  '',
  '- Reel-only Original Audio Name field in Create',
  '- Audio name is preserved when scheduling, editing, and using **Use Again**',
  '- Reel publishing sends audio_name to Instagram',
  '- History shows the saved audio name',
  '- PWA shell cache bumped so installed copies refresh',
  '',
  '## Important limitation',
  '',
  "This names the original audio already embedded in the uploaded Reel video. It does **not** browse or attach tracks from Instagram's licensed/trending music library.",
  '',
  '## Upgrade',
  '',
  'No D1 migration is required. The value is stored inside the existing instagram_options JSON column.',
  '',
  '1. npm install',
  '2. npm test',
  '3. npm run deploy',
  '',
].join('\n'));

console.log('Social Publisher upgraded to v0.6.5.');
