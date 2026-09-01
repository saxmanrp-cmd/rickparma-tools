from pathlib import Path

root = Path('fuel-tracker')


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: expected source text not found')
    return text.replace(old, new, 1)

# Web app: lock the viewport, make the entire canvas dark, stop rubber-band
# overscroll, and keep every editable control at >=16px so iOS never auto-zooms.
html_path = root / 'public/index.html'
html = html_path.read_text()
html = replace_once(
    html,
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    'viewport lock',
)

hardening_css = r'''
/* Fuel native app-shell hardening: no white overscroll, no page zoom, stable bottom tabs. */
html{background:#08111f;min-height:100%;width:100%;overflow-x:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%;touch-action:pan-y}
body{min-height:100dvh;width:100%;overflow-x:hidden;overscroll-behavior:none;background:#08111f;color:var(--text);touch-action:pan-y;-webkit-text-size-adjust:100%}
.app{min-height:100dvh}
.tabs{transform:translateZ(0);-webkit-transform:translateZ(0);backface-visibility:hidden;-webkit-backface-visibility:hidden;will-change:transform;contain:layout paint}
.review,.scannerWrap{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#000d}
input,textarea,select{font-size:16px!important;touch-action:manipulation}
.macrogrid input{font-size:16px!important}
button,.btn,[role="button"]{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
'''.strip()
if 'Fuel native app-shell hardening' not in html:
    html = html.replace('</style>', hardening_css + '\n</style>', 1)

hardening_js = r'''
<script id="fuelAppShellLock">
(()=>{
  const meta=document.querySelector('meta[name="viewport"]');
  if(meta) meta.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover');
  const stopGesture=e=>e.preventDefault();
  ['gesturestart','gesturechange','gestureend'].forEach(name=>document.addEventListener(name,stopGesture,{passive:false}));
})();
</script>
'''.strip()
if 'id="fuelAppShellLock"' not in html:
    html = html.replace('</body>', hardening_js + '\n</body>', 1)
html_path.write_text(html)

# Native shell: the web view itself must never reveal UIKit's default white
# background or participate in pinch/rubber-band zooming.
swift_path = root / 'ios/Fuel/ContentView.swift'
swift = swift_path.read_text()
swift = replace_once(
    swift,
    '''struct ContentView: View {\n    var body: some View {\n        FuelWebView()\n            .ignoresSafeArea(.container, edges: .bottom)\n    }\n}''',
    '''struct ContentView: View {\n    private let fuelBackground = Color(red: 8.0 / 255.0, green: 17.0 / 255.0, blue: 31.0 / 255.0)\n\n    var body: some View {\n        ZStack {\n            fuelBackground.ignoresSafeArea()\n            FuelWebView()\n                .ignoresSafeArea(.container, edges: .bottom)\n        }\n    }\n}''',
    'SwiftUI dark canvas',
)

old_scroll = '''        let webView = WKWebView(frame: .zero, configuration: config)\n        webView.navigationDelegate = context.coordinator\n        webView.allowsBackForwardNavigationGestures = false\n        webView.scrollView.contentInsetAdjustmentBehavior = .automatic\n        context.coordinator.webView = webView'''
new_scroll = '''        let webView = WKWebView(frame: .zero, configuration: config)\n        webView.navigationDelegate = context.coordinator\n        webView.allowsBackForwardNavigationGestures = false\n        webView.allowsLinkPreview = false\n\n        let fuelBackground = UIColor(red: 8.0 / 255.0, green: 17.0 / 255.0, blue: 31.0 / 255.0, alpha: 1.0)\n        webView.isOpaque = false\n        webView.backgroundColor = fuelBackground\n        webView.scrollView.backgroundColor = fuelBackground\n        webView.scrollView.contentInsetAdjustmentBehavior = .never\n        webView.scrollView.automaticallyAdjustsScrollIndicatorInsets = false\n        webView.scrollView.contentInset = .zero\n        webView.scrollView.scrollIndicatorInsets = .zero\n        webView.scrollView.bounces = false\n        webView.scrollView.alwaysBounceVertical = false\n        webView.scrollView.alwaysBounceHorizontal = false\n        webView.scrollView.showsHorizontalScrollIndicator = false\n        webView.scrollView.keyboardDismissMode = .interactive\n        webView.scrollView.minimumZoomScale = 1.0\n        webView.scrollView.maximumZoomScale = 1.0\n        webView.scrollView.pinchGestureRecognizer?.isEnabled = false\n\n        context.coordinator.webView = webView'''
swift = replace_once(swift, old_scroll, new_scroll, 'WKWebView scroll/zoom lock')
swift_path.write_text(swift)

# Regression coverage: protect the exact behaviors that made the recording feel
# like a web page instead of a native app.
test_path = root / 'tests/app-shell.test.mjs'
test_path.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const swift=fs.readFileSync(new URL('../ios/Fuel/ContentView.swift', import.meta.url),'utf8');

test('Fuel locks browser zoom and iOS focus zoom',()=>{
  assert.match(html,/maximum-scale=1/);
  assert.match(html,/user-scalable=no/);
  assert.match(html,/input,textarea,select\{font-size:16px!important/);
  assert.match(html,/gesturestart/);
  assert.doesNotMatch(html,/\.macrogrid input\{padding:8px;font-size:14px\}/);
});

test('Fuel web canvas cannot reveal white rubber-band gaps',()=>{
  assert.match(html,/html\{background:#08111f/);
  assert.match(html,/overscroll-behavior:none/);
  assert.match(html,/\.tabs\{transform:translateZ\(0\)/);
});

test('native Fuel disables bounce and native pinch zoom',()=>{
  assert.match(swift,/fuelBackground\.ignoresSafeArea\(\)/);
  assert.match(swift,/webView\.isOpaque = false/);
  assert.match(swift,/contentInsetAdjustmentBehavior = \.never/);
  assert.match(swift,/webView\.scrollView\.bounces = false/);
  assert.match(swift,/alwaysBounceVertical = false/);
  assert.match(swift,/maximumZoomScale = 1\.0/);
  assert.match(swift,/pinchGestureRecognizer\?\.isEnabled = false/);
});
''')

print('Fuel app-shell hardening patched successfully')
