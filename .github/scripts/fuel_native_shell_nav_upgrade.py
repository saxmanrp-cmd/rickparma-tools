from pathlib import Path

root = Path(__file__).resolve().parents[2]
swift_path = root / 'fuel-tracker/ios/Fuel/ContentView.swift'
test_path = root / 'fuel-tracker/tests/native-feel-debug.test.mjs'

swift = swift_path.read_text()

old_content = '''struct ContentView: View {
    private let fuelBackground = Color(red: 8.0 / 255.0, green: 17.0 / 255.0, blue: 31.0 / 255.0)

    var body: some View {
        ZStack {
            fuelBackground.ignoresSafeArea()
            FuelWebView()
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }
}
'''
new_content = '''struct ContentView: View {
    @State private var selectedPage = "home"
    private let fuelBackground = Color(red: 8.0 / 255.0, green: 17.0 / 255.0, blue: 31.0 / 255.0)
    private let activeTab = Color(red: 25.0 / 255.0, green: 40.0 / 255.0, blue: 68.0 / 255.0)
    private let inactiveText = Color(red: 149.0 / 255.0, green: 165.0 / 255.0, blue: 189.0 / 255.0)

    var body: some View {
        VStack(spacing: 0) {
            FuelWebView(selectedPage: selectedPage)
                .background(fuelBackground)

            Rectangle()
                .fill(Color(red: 42.0 / 255.0, green: 59.0 / 255.0, blue: 93.0 / 255.0))
                .frame(height: 1)

            HStack(spacing: 5) {
                fuelTab(page: "home", icon: "🏠", label: "Today")
                fuelTab(page: "log", icon: "＋", label: "Log")
                fuelTab(page: "progress", icon: "📈", label: "Progress")
                fuelTab(page: "settings", icon: "⚙️", label: "Settings")
            }
            .padding(.horizontal, 8)
            .padding(.top, 7)
            .padding(.bottom, 4)
            .background(fuelBackground)
        }
        .background(fuelBackground.ignoresSafeArea())
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    @ViewBuilder
    private func fuelTab(page: String, icon: String, label: String) -> some View {
        Button {
            selectedPage = page
        } label: {
            VStack(spacing: 2) {
                Text(icon)
                    .font(.system(size: 19))
                Text(label)
                    .font(.system(size: 12, weight: .bold))
            }
            .foregroundStyle(selectedPage == page ? Color.white : inactiveText)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(selectedPage == page ? activeTab : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
'''
if old_content not in swift and 'FuelWebView(selectedPage: selectedPage)' not in swift:
    raise SystemExit('ContentView shell marker not found')
if old_content in swift:
    swift = swift.replace(old_content, new_content, 1)

if 'struct FuelWebView: UIViewRepresentable {\n    let selectedPage: String' not in swift:
    swift = swift.replace('struct FuelWebView: UIViewRepresentable {\n', 'struct FuelWebView: UIViewRepresentable {\n    let selectedPage: String\n', 1)

make_marker = '    func makeUIView(context: Context) -> WKWebView {\n        let config = WKWebViewConfiguration()'
make_repl = '    func makeUIView(context: Context) -> WKWebView {\n        context.coordinator.currentPage = selectedPage\n        let config = WKWebViewConfiguration()'
if make_marker in swift:
    swift = swift.replace(make_marker, make_repl, 1)

script_marker = '        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "fuelBarcode")\n'
script_add = '''        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "fuelBarcode")

        let nativeShellSource = """
        document.documentElement.classList.add('fuel-native-shell');
        const fuelNativeStyle = document.createElement('style');
        fuelNativeStyle.id = 'fuel-native-shell-style';
        fuelNativeStyle.textContent = '.tabs{display:none!important}.app{padding-bottom:18px!important}html,body{background:#08111f!important}';
        document.head.appendChild(fuelNativeStyle);
        """
        config.userContentController.addUserScript(WKUserScript(source: nativeShellSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
'''
if 'fuel-native-shell-style' not in swift:
    if script_marker not in swift:
        raise SystemExit('native shell script marker not found')
    swift = swift.replace(script_marker, script_add, 1)

old_update = '    func updateUIView(_ webView: WKWebView, context: Context) {}\n'
new_update = '''    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.currentPage = selectedPage
        context.coordinator.selectPage(selectedPage, in: webView)
    }
'''
if old_update in swift:
    swift = swift.replace(old_update, new_update, 1)

coord_marker = '        weak var webView: WKWebView?\n'
coord_add = '''        weak var webView: WKWebView?
        var currentPage = "home"
        private var lastSelectedPage: String?
'''
if 'private var lastSelectedPage' not in swift:
    if coord_marker not in swift:
        raise SystemExit('Coordinator marker not found')
    swift = swift.replace(coord_marker, coord_add, 1)

finish_old = '''        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.pageZoom = 1.0
            webView.scrollView.minimumZoomScale = 1.0
            webView.scrollView.maximumZoomScale = 1.0
            webView.scrollView.setZoomScale(1.0, animated: false)
            disableWebZoomGestures(in: webView)
        }
'''
finish_new = '''        func selectPage(_ page: String, in webView: WKWebView, force: Bool = false) {
            let allowed = ["home", "log", "progress", "settings"]
            guard allowed.contains(page) else { return }
            guard force || lastSelectedPage != page else { return }
            lastSelectedPage = page
            let js = "document.querySelector('.tab[data-page=\\\"\\(page)\\\"]')?.click(); window.scrollTo({top:0,left:0,behavior:'instant'});"
            webView.evaluateJavaScript(js)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.pageZoom = 1.0
            webView.scrollView.minimumZoomScale = 1.0
            webView.scrollView.maximumZoomScale = 1.0
            webView.scrollView.setZoomScale(1.0, animated: false)
            disableWebZoomGestures(in: webView)
            lastSelectedPage = nil
            selectPage(currentPage, in: webView, force: true)
        }
'''
if 'func selectPage(_ page: String' not in swift:
    if finish_old not in swift:
        raise SystemExit('didFinish marker not found')
    swift = swift.replace(finish_old, finish_new, 1)

swift_path.write_text(swift)

# Extend regression checks for the native-shell architecture.
test = test_path.read_text()
extra = '''

test('native iPhone shell owns bottom navigation instead of WKWebView',()=>{
  assert.match(swift,/FuelWebView\(selectedPage: selectedPage\)/);
  assert.match(swift,/fuelTab\(page: "home"/);
  assert.match(swift,/fuelTab\(page: "settings"/);
  assert.match(swift,/ignoresSafeArea\(\.keyboard, edges: \.bottom\)/);
  assert.match(swift,/fuel-native-shell-style/);
  assert.match(swift,/\.tabs\{display:none!important\}/);
  assert.match(swift,/func selectPage\(_ page: String/);
});
'''
if "native iPhone shell owns bottom navigation" not in test:
    test_path.write_text(test + extra)
