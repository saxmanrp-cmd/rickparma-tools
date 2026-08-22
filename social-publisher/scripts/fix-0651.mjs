import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content);
function replaceOnce(text, from, to, label) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`Could not find patch target: ${label}`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

{
  let s = read('public/app.js');
  s = replaceOnce(
    s,
    "$$('.segment').forEach(segment => segment.addEventListener('click', () => {",
    "$$('.segmented:not(.ig-type-segmented) .segment').forEach(segment => segment.addEventListener('click', () => {",
    'scope timing segment click handler'
  );
  s = replaceOnce(
    s,
    "  $$('.segment').forEach(s => s.classList.remove('active'));",
    "  $$('.segmented:not(.ig-type-segmented) .segment').forEach(s => s.classList.remove('active'));",
    'scope timing active state'
  );
  write('public/app.js', s);
}

{
  let s = read('package.json');
  s = replaceOnce(s, '"version": "0.6.5"', '"version": "0.6.5.1"', 'package version');
  write('package.json', s);
}

{
  let s = read('src/index.js');
  s = replaceOnce(s, "version: '0.6.5'", "version: '0.6.5.1'", 'health version');
  write('src/index.js', s);
}

{
  let s = read('public/service-worker.js');
  s = replaceOnce(s, 'social-publisher-shell-v650', 'social-publisher-shell-v651', 'PWA cache');
  write('public/service-worker.js', s);
}

{
  let s = read('tests/smoke.test.mjs');
  s = replaceOnce(s, "assert.equal(health.version, '0.6.5');", "assert.equal(health.version, '0.6.5.1');", 'health test');
  s += `\n\ntest('Instagram type selector is isolated from timing selector', () => {\n  const frontend = read('public/app.js');\n  assert.equal(frontend.includes(\"$$('.segmented:not(.ig-type-segmented) .segment').forEach(segment\"), true);\n  assert.equal(frontend.includes(\"$$('.segment').forEach(segment => segment.addEventListener('click'\"), false);\n  assert.equal(frontend.includes('updateInstagramReelAudioVisibility();'), true);\n});\n`;
  write('tests/smoke.test.mjs', s);
}

write('VERSION.txt', 'Rick Parma Social Publisher\nVersion 0.6.5.1 - iPhone Instagram type selector fix\n');
write('UPGRADE-v0.6.5.1.md', `# Social Publisher v0.6.5.1\n\nFixes the iPhone composer regression where the shared segmented-control click handler intercepted Instagram Post / Story / Reel changes.\n\n## Fixed\n\n- Reel selection now immediately reveals Reel Audio\n- Instagram People hint changes correctly for Reel\n- Post / Story / Reel active state no longer interferes with Now / Schedule\n- Now / Schedule no longer clears the Instagram type active state\n- PWA cache bumped for installed iPhone copies\n\nNo database migration or new secrets are required.\n`);
console.log('Applied Social Publisher v0.6.5.1 selector fix.');
