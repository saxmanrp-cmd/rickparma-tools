from pathlib import Path
import re

index_path = Path('fuel-tracker/public/index.html')
test_path = Path('fuel-tracker/tests/today-interaction.test.mjs')

html = index_path.read_text()

# Native WKWebView already owns zoom prevention. Do not let web-level gesture
# interception suppress synthesized clicks on the long Today page.
html = html.replace('touch-action:pan-y', 'touch-action:auto')

# Remove the old global gesture blocker. The viewport is already locked by the
# meta tag and native WKWebView zoom settings.
html = re.sub(
    r'\n?<script id="fuelAppShellLock">.*?</script>\s*',
    '\n',
    html,
    flags=re.S,
)

# Keep the visualViewport keyboard helper, but remove the touchend/touchmove
# preventDefault handlers that can swallow normal taps.
pattern = re.compile(
    r"\s*// WKWebView can still smart-zoom on a rapid double tap.*?"
    r"document\.addEventListener\('touchmove',e=>\{.*?\},\{passive:false\}\);\s*",
    re.S,
)
html, count = pattern.subn(
    "\n  // Zoom is locked natively by WKWebView. Never intercept normal page taps here.\n\n",
    html,
    count=1,
)
if count == 0 and 'lastTapAt=0' in html:
    raise SystemExit('Could not remove the legacy native-feel touch interceptor')

# Defensive hit-testing rules: the visible Today page is interactive, while
# closed full-screen overlays can never steal touches.
style_marker = 'body.fuel-keyboard-open .tabs{visibility:hidden!important;pointer-events:none!important}\n'
style_add = (
    '.fuel-native-shell #home.page.active{pointer-events:auto!important}\n'
    '.fuel-native-shell #home.page.active *{pointer-events:auto}\n'
    '.review:not(.open),.scannerWrap:not(.open),.fcModal:not(.open){pointer-events:none!important}\n'
    '.review.open,.scannerWrap.open,.fcModal.open{pointer-events:auto!important}\n'
)
if style_add not in html:
    if style_marker not in html:
        raise SystemExit('Could not find native-feel style marker')
    html = html.replace(style_marker, style_marker + style_add, 1)

index_path.write_text(html)

test_path.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const swift=fs.readFileSync(new URL('../ios/Fuel/ContentView.swift', import.meta.url),'utf8');

test('native Fuel leaves normal web taps alone',()=>{
  assert.doesNotMatch(html,/lastTapAt=0/);
  assert.doesNotMatch(html,/addEventListener\\('gesturestart'/);
  assert.doesNotMatch(html,/touch-action:pan-y/);
  assert.match(html,/#home\\.page\\.active\\{pointer-events:auto!important\\}/);
  assert.match(html,/\\.fcModal:not\\(\\.open\\)\\{pointer-events:none!important\\}/);
  assert.match(swift,/pinchGestureRecognizer\\?\\.isEnabled = false/);
  assert.match(swift,/numberOfTapsRequired > 1/);
});
""")

print('Fuel Today tap recovery applied')
