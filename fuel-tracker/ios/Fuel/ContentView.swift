import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        FuelWebView()
            .ignoresSafeArea(.container, edges: .bottom)
    }
}

struct FuelWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "healthKit")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        context.coordinator.webView = webView

        if let url = URL(string: "https://rick-fuel-tracker.saxmanrp.workers.dev/?native=1") {
            webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
        weak var webView: WKWebView?
        private let health = HealthKitManager()

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.host == "rick-fuel-tracker.saxmanrp.workers.dev" || url.scheme == "about" {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard let body = message.body as? [String: Any], let action = body["action"] as? String else {
                replyHandler(["ok": false, "error": "Invalid HealthKit request."], nil)
                return
            }

            Task {
                do {
                    switch action {
                    case "authorize":
                        let ok = try await health.requestAuthorization()
                        replyHandler(["ok": ok], nil)
                    case "today":
                        let snapshot = try await health.todaySnapshot()
                        replyHandler(["ok": true, "data": snapshot.dictionary], nil)
                    default:
                        replyHandler(["ok": false, "error": "Unknown HealthKit action."], nil)
                    }
                } catch {
                    replyHandler(["ok": false, "error": error.localizedDescription], nil)
                }
            }
        }
    }
}
