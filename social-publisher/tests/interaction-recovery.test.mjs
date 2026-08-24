import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('mobile interaction recovery removes stale auth blockers and restores tap targets', () => {
  const recovery = read('public/interaction-recovery.js');
  const entry = read('src/entry.js');
  const pkg = read('package.json');

  for (const needle of [
    "document.documentElement.classList.remove('auth-open')",
    "document.body?.classList.remove('auth-open')",
    ".sheet.hidden,.login-overlay.hidden",
    "shell.style.pointerEvents = 'auto'",
    "document.addEventListener('touchend'",
    "activateView(item.dataset.view, item)",
    "control?.type === 'file'",
    "if (moved > 14) return",
  ]) assert.equal(recovery.includes(needle), true, `interaction recovery missing ${needle}`);

  assert.equal(entry.includes('injectInteractionRecovery'), true);
  assert.equal(entry.includes('/interaction-recovery.js?v=${APP_BOOT}'), true);
  assert.equal(pkg.includes('node --check public/interaction-recovery.js'), true);
});
