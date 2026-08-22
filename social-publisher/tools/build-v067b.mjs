import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('social-publisher');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);

let index = read('public/index.html');
const button = '            <button id="applyMaxReachBtn" class="button max-reach-button full" type="button" disabled>Apply Recommendation</button>';
const intelMarkup = [
'            <div id="reachIntelligence" class="reach-intelligence hidden">',
'              <div class="reach-intel-divider"></div>',
'              <div class="reach-intel-head">',
'                <div>',
'                  <strong>Reach Intelligence</strong>',
'                  <span>Format + caption + local timing</span>',
'                </div>',
'                <b id="reachFitScore" class="reach-fit-score">FORMAT FIT</b>',
'              </div>',
'              <div class="reach-intel-grid">',
'                <div class="reach-intel-tip"><small>CONTENT</small><strong id="reachContentTitle"></strong><p id="reachContentBody"></p></div>',
'                <div class="reach-intel-tip"><small>WHEN</small><strong id="reachTimeTitle"></strong><p id="reachTimeBody"></p></div>',
'                <div class="reach-intel-tip"><small>CAPTION</small><strong>Caption structure</strong><p id="reachCaptionBody"></p></div>',
'                <div class="reach-intel-tip"><small>FOLLOW-UP</small><strong>Second touch</strong><p id="reachFollowupBody"></p></div>',
'              </div>',
'              <div class="reach-intel-actions">',
'                <button id="useReachTimeBtn" class="button secondary" type="button">Use Suggested Time</button>',
'                <button id="useReachCaptionBtn" class="button secondary" type="button">Use Caption Starter</button>',
'              </div>',
'              <div class="reach-intel-note">Learning mode: timing windows are starting points until Social Publisher has enough of your own post-performance data to personalize them.</div>',
'            </div>'
].join('\n');
if (!index.includes('id="reachIntelligence"')) {
  if (!index.includes(button)) throw new Error('Max Reach apply button not found');
  index = index.replace(button, intelMarkup + '\n' + button);
}
if (!index.includes('/reach-intelligence.js')) {
  index = index.replace('  <script src="/app.js"></script>', '  <script src="/app.js"></script>\n  <script src="/reach-intelligence.js"></script>');
}
index = index.replace('Social Publisher v0.6.6</div>', 'Social Publisher v0.6.7</div>');
write('public/index.html', index);

let css = read('public/styles.css');
const cssBlock = [
'',
'/* v0.6.7 Reach Intelligence */',
'.reach-intelligence{margin-top:12px}.reach-intel-divider{height:1px;background:rgba(155,122,255,.28);margin:2px 0 12px}.reach-intel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.reach-intel-head strong,.reach-intel-head span{display:block}.reach-intel-head strong{font-size:13px}.reach-intel-head span{font-size:10px;color:var(--muted);margin-top:3px}.reach-fit-score{flex:0 0 auto;border:1px solid #6656c7;background:#28203e;color:#cfc4ff;border-radius:999px;padding:5px 8px;font-size:8px;letter-spacing:.08em}.reach-intel-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.reach-intel-tip{background:#0e121a;border:1px solid #2b3341;border-radius:12px;padding:10px;min-width:0}.reach-intel-tip small{display:block;color:#a996ff;font-size:8px;font-weight:900;letter-spacing:.11em;margin-bottom:5px}.reach-intel-tip strong{display:block;font-size:11px;line-height:1.25}.reach-intel-tip p{margin:5px 0 0;color:var(--muted);font-size:10px;line-height:1.4}.reach-intel-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.reach-intel-actions .button{min-height:42px;font-size:11px;padding:8px}.reach-intel-note{font-size:9px;line-height:1.4;color:#747e8e;margin-top:8px}.max-reach-card{overflow:hidden}',
'@media(max-width:430px){.reach-intel-grid{grid-template-columns:1fr}.reach-intel-actions{grid-template-columns:1fr 1fr}}',
''
].join('\n');
if (!css.includes('v0.6.7 Reach Intelligence')) css += cssBlock;
write('public/styles.css', css);

let sw = read('public/service-worker.js');
sw = sw.replace("const CACHE = 'social-publisher-shell-v661';", "const CACHE = 'social-publisher-shell-v670';");
if (!sw.includes('/reach-intelligence.js')) sw = sw.replace("'/app.js', '/manifest.webmanifest'", "'/app.js', '/reach-intelligence.js', '/manifest.webmanifest'");
write('public/service-worker.js', sw);

let backend = read('src/index.js');
backend = backend.replace("version: '0.6.6.1'", "version: '0.6.7'");
backend = backend.replace('RickParma-SocialPublisher/0.6.6.1', 'RickParma-SocialPublisher/0.6.7');
write('src/index.js', backend);

write('package.json', read('package.json').replace('"version": "0.6.6.1"', '"version": "0.6.7"'));
write('package-lock.json', read('package-lock.json').replaceAll('"version": "0.6.6.1"', '"version": "0.6.7"'));
write('VERSION.txt', 'Rick Parma Social Publisher\nVersion 0.6.7 - Reach Intelligence\n');
write('UPGRADE-v0.6.7.md', [
'# Social Publisher v0.6.7',
'',
'Reach Intelligence adds a first strategy layer on top of Max Reach.',
'',
'- Classifies post intent from media + caption.',
'- Gives a transparent Format Fit score.',
'- Recommends content framing, caption structure and follow-up strategy.',
'- Suggests a local posting test window and can put it directly into Schedule.',
'- Time-sensitive captions such as “tonight” switch the advice to Post Now.',
'- Offers a caption starter when the caption field is empty.',
'- Keeps existing Max Reach routing, Facebook Reels, Threads reliability and failed-only Retry unchanged.',
'- General timing windows are explicitly marked Learning Mode until first-party performance analytics are added.',
'- No D1 migration, new secrets or account reconnects are required.',
''
].join('\n'));

let tests = read('tests/smoke.test.mjs');
tests = tests.replace("assert.equal(health.version, '0.6.6.1');", "assert.equal(health.version, '0.6.7');");
if (!tests.includes("test('Reach Intelligence is wired into Max Reach'")) {
  tests += [
    '',
    "test('Reach Intelligence is wired into Max Reach', () => {",
    "  const html = read('public/index.html');",
    "  const reach = read('public/reach-intelligence.js');",
    "  const css = read('public/styles.css');",
    "  const sw = read('public/service-worker.js');",
    "  for (const needle of ['id=\"reachIntelligence\"','id=\"reachFitScore\"','id=\"useReachTimeBtn\"','id=\"useReachCaptionBtn\"','/reach-intelligence.js','Learning mode:']) assert.equal(html.includes(needle), true, 'HTML missing ' + needle);",
    "  for (const needle of ['buildReachIntelligence','classifyIntent','nextSuggestedSlot','timingMode','Caption starter added']) assert.equal(reach.includes(needle), true, 'Reach Intelligence missing ' + needle);",
    "  assert.equal(css.includes('v0.6.7 Reach Intelligence'), true);",
    "  assert.equal(sw.includes('/reach-intelligence.js'), true);",
    "  assert.equal(sw.includes('social-publisher-shell-v670'), true);",
    '});',
    ''
  ].join('\n');
}
write('tests/smoke.test.mjs', tests);

console.log('Built Social Publisher v0.6.7 Reach Intelligence');
