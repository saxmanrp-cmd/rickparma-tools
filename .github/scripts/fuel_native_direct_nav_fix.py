from pathlib import Path

app_path = Path('fuel-tracker/public/app.js')
swift_path = Path('fuel-tracker/ios/Fuel/ContentView.swift')
test_path = Path('fuel-tracker/tests/native-feel-debug.test.mjs')

app = app_path.read_text()
if 'window.FuelShowPage=showPage;' not in app:
    marker = 'function render(){'
    if marker not in app:
        raise SystemExit('Could not find render marker in app.js')
    app = app.replace(marker, 'window.FuelShowPage=showPage;\n' + marker, 1)
    app_path.write_text(app)

swift = swift_path.read_text()
replacement = "            let js = \"if (typeof window.FuelShowPage === 'function') { window.FuelShowPage('\\(page)'); } else { document.querySelector('.tab[data-page=\\\"\\(page)\\\"]')?.click(); } window.scrollTo(0,0);\""
if "typeof window.FuelShowPage === 'function'" not in swift:
    lines = swift.splitlines()
    changed = False
    for i, line in enumerate(lines):
        if 'let js =' in line and 'document.querySelector' in line and 'data-page' in line:
            lines[i] = replacement
            changed = True
            break
    if not changed:
        raise SystemExit('Could not find native selectPage JavaScript line')
    swift = '\n'.join(lines) + ('\n' if swift.endswith('\n') else '')
    swift_path.write_text(swift)

test = test_path.read_text()
block = '''\n\ntest('native Fuel calls the web page router directly',()=>{\n  assert.match(app,/window\\.FuelShowPage=showPage/);\n  assert.match(swift,/typeof window\\.FuelShowPage === 'function'/);\n  assert.match(swift,/window\\.FuelShowPage/);\n});\n'''
if 'native Fuel calls the web page router directly' not in test:
    test += block
    test_path.write_text(test)

print('Fuel direct native navigation bridge applied')
