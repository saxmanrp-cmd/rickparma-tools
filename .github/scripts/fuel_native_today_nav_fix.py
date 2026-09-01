from pathlib import Path

swift_path = Path('fuel-tracker/ios/Fuel/ContentView.swift')
test_path = Path('fuel-tracker/tests/native-feel-debug.test.mjs')

swift = swift_path.read_text()

replacements = [
    (
        '@State private var selectedPage = "home"\n',
        '@State private var selectedPage = "home"\n    @State private var navigationRevision = 0\n'
    ),
    (
        'FuelWebView(selectedPage: selectedPage)\n',
        'FuelWebView(selectedPage: selectedPage, navigationRevision: navigationRevision)\n'
    ),
    (
        'Button {\n            selectedPage = page\n        } label: {',
        'Button {\n            selectedPage = page\n            navigationRevision &+= 1\n        } label: {'
    ),
    (
        'struct FuelWebView: UIViewRepresentable {\n    let selectedPage: String\n',
        'struct FuelWebView: UIViewRepresentable {\n    let selectedPage: String\n    let navigationRevision: Int\n'
    ),
    (
        'context.coordinator.selectPage(selectedPage, in: webView)\n',
        'context.coordinator.selectPage(selectedPage, in: webView, force: true)\n'
    ),
]

for old, new in replacements:
    if new in swift:
        continue
    if old not in swift:
        raise SystemExit(f'Expected Swift source not found: {old!r}')
    swift = swift.replace(old, new, 1)

swift_path.write_text(swift)

test = test_path.read_text()
block = '''\n\ntest('native tabs always send navigation even when Today is already selected in SwiftUI',()=>{\n  assert.match(swift,/@State private var navigationRevision = 0/);\n  assert.match(swift,/navigationRevision &\\+= 1/);\n  assert.match(swift,/FuelWebView\\(selectedPage: selectedPage, navigationRevision: navigationRevision\\)/);\n  assert.match(swift,/selectPage\\(selectedPage, in: webView, force: true\\)/);\n});\n'''
if "native tabs always send navigation even when Today" not in test:
    test += block
    test_path.write_text(test)

print('Fuel native Today navigation fix applied')
