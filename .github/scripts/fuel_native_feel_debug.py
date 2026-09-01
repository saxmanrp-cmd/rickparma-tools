from pathlib import Path

root = Path('fuel-tracker')


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: expected source text not found')
    return text.replace(old, new, 1)

# WEB SHELL ---------------------------------------------------------------
html_path = root / 'public/index.html'
html = html_path.read_text()

# Opening a tool should not automatically focus the first field. On iOS that
# changes the visual viewport and feels like a random page zoom.
old_open = "function openLogTool(id){closeLogTools();const el=document.getElementById(id);if(!el)return;el.classList.add('open');setTimeout(()=>{el.scrollIntoView({behavior:'smooth',block:'start'});const input=el.querySelector('textarea,input:not([type=file])');if(input)input.focus({preventScroll:true})},50)}"
new_open = "function openLogTool(id){closeLogTools();const el=document.getElementById(id);if(!el)return;el.classList.add('open');requestAnimationFrame(()=>{const top=Math.max(0,el.getBoundingClientRect().top+window.scrollY-12);window.scrollTo({top,behavior:'smooth'})})}"
html = replace_once(html, old_open, new_open, 'remove forced tool autofocus')

native_css = r'''
/* Fuel native-feel debug pass: keep tabs stable and never expose a light canvas. */
html,body{background-color:#08111f!important}
.app{padding-bottom:calc(98px + env(safe-area-inset-bottom))!important}
.tabs{background:#08111f!important;transform:none!important;-webkit-transform:none!important;will-change:auto!important;contain:none!important;isolation:isolate}
body.fuel-keyboard-open .tabs{visibility:hidden!important;pointer-events:none!important}
'''.strip()
if 'Fuel native-feel debug pass' not in html:
    html = html.replace('</style>', native_css + '\n</style>', 1)

native_js = r'''
<script id="fuelNativeFeelLock">
(()=>{
  // WKWebView can still smart-zoom on a rapid double tap even when pinch zoom
  // is disabled. Suppress only a second tap on the exact same target.
  let lastTapAt=0;
  let lastTapTarget=null;
  document.addEventListener('touchend',e=>{
    const now=Date.now();
    if(e.changedTouches&&e.changedTouches.length===1&&lastTapTarget===e.target&&now-lastTapAt<300){
      e.preventDefault();
      lastTapAt=0;
      lastTapTarget=null;
      return;
    }
    lastTapAt=now;
    lastTapTarget=e.target;
  },{passive:false});
  document.addEventListener('touchmove',e=>{
    if(e.touches&&e.touches.length>1)e.preventDefault();
  },{passive:false});

  // A fixed web tab bar rides upward with iOS's visual viewport when the
  // keyboard appears. A native tab bar would sit behind the keyboard, so hide
  // the web tabs for that short interval instead of letting them jump upward.
  const vv=window.visualViewport;
  let baseHeight=vv?vv.height:window.innerHeight;
  const syncKeyboard=()=>{
    const h=vv?vv.height:window.innerHeight;
    if(h>baseHeight)baseHeight=h;
    const keyboardOpen=baseHeight-h>120;
    document.body.classList.toggle('fuel-keyboard-open',keyboardOpen);
  };
  if(vv){vv.addEventListener('resize',syncKeyboard);vv.addEventListener('scroll',syncKeyboard)}
  window.addEventListener('orientationchange',()=>setTimeout(()=>{baseHeight=vv?vv.height:window.innerHeight;syncKeyboard()},300));
})();
</script>
'''.strip()
if 'id="fuelNativeFeelLock"' not in html:
    html = html.replace('</body>', native_js + '\n</body>', 1)

html_path.write_text(html)

# NATIVE WKWEBVIEW --------------------------------------------------------
swift_path = root / 'ios/Fuel/ContentView.swift'
swift = swift_path.read_text()

old_bg = '''        webView.isOpaque = false\n        webView.backgroundColor = fuelBackground\n        webView.scrollView.backgroundColor = fuelBackground'''
new_bg = '''        webView.isOpaque = false\n        webView.backgroundColor = fuelBackground\n        if #available(iOS 15.0, *) {\n            webView.underPageBackgroundColor = fuelBackground\n        }\n        webView.scrollView.backgroundColor = fuelBackground\n        webView.scrollView.clipsToBounds = true'''
swift = replace_once(swift, old_bg, new_bg, 'native under-page background')

old_zoom = '''        webView.scrollView.minimumZoomScale = 1.0\n        webView.scrollView.maximumZoomScale = 1.0\n        webView.scrollView.pinchGestureRecognizer?.isEnabled = false'''
new_zoom = '''        webView.scrollView.minimumZoomScale = 1.0\n        webView.scrollView.maximumZoomScale = 1.0\n        webView.scrollView.zoomScale = 1.0\n        webView.pageZoom = 1.0\n        webView.scrollView.pinchGestureRecognizer?.isEnabled = false\n        context.coordinator.disableWebZoomGestures(in: webView)'''
swift = replace_once(swift, old_zoom, new_zoom, 'native page/double-tap zoom lock')

anchor = '''        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {'''
insert = '''        func disableWebZoomGestures(in view: UIView) {\n            for recognizer in view.gestureRecognizers ?? [] {\n                if recognizer is UIPinchGestureRecognizer {\n                    recognizer.isEnabled = false\n                } else if let tap = recognizer as? UITapGestureRecognizer, tap.numberOfTapsRequired > 1 {\n                    recognizer.isEnabled = false\n                }\n            }\n            for child in view.subviews {\n                disableWebZoomGestures(in: child)\n            }\n        }\n\n        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {\n            webView.pageZoom = 1.0\n            webView.scrollView.minimumZoomScale = 1.0\n            webView.scrollView.maximumZoomScale = 1.0\n            webView.scrollView.setZoomScale(1.0, animated: false)\n            disableWebZoomGestures(in: webView)\n        }\n\n'''
if 'func disableWebZoomGestures(in view: UIView)' not in swift:
    if anchor not in swift:
        raise SystemExit('coordinator navigation anchor not found')
    swift = swift.replace(anchor, insert + anchor, 1)

swift_path.write_text(swift)

# REGRESSION TESTS --------------------------------------------------------
test_path = root / 'tests/native-feel-debug.test.mjs'
test_path.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const swift=fs.readFileSync(new URL('../ios/Fuel/ContentView.swift', import.meta.url),'utf8');

test('logging tools never auto-focus and trigger iOS visual zoom',()=>{
  assert.doesNotMatch(html,/input\)input\.focus\(/);
  assert.match(html,/window\.scrollTo\(\{top,behavior:'smooth'\}\)/);
});

test('bottom tabs stay native-feeling around the iOS keyboard',()=>{
  assert.match(html,/fuel-keyboard-open/);
  assert.match(html,/visualViewport/);
  assert.match(html,/body\.fuel-keyboard-open \.tabs\{visibility:hidden/);
  assert.match(html,/\.tabs\{background:#08111f!important/);
});

test('native WKWebView cannot reveal white under-page areas or smart zoom',()=>{
  assert.match(swift,/underPageBackgroundColor = fuelBackground/);
  assert.match(swift,/scrollView\.clipsToBounds = true/);
  assert.match(swift,/webView\.pageZoom = 1\.0/);
  assert.match(swift,/numberOfTapsRequired > 1/);
  assert.match(swift,/setZoomScale\(1\.0, animated: false\)/);
});
''')

print('Fuel native-feel debug pass patched successfully')
