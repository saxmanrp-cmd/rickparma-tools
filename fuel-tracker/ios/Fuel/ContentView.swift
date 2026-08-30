import SwiftUI
import WebKit
import UIKit
import AVFoundation

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
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "fuelSpeech")

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
        private let speech = AVSpeechSynthesizer()

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
                replyHandler(["ok": false, "error": "Invalid native request."], nil)
                return
            }

            if message.name == "fuelSpeech" {
                Task { @MainActor in
                    switch action {
                    case "speak":
                        let text = (body["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !text.isEmpty else {
                            replyHandler(["ok": false, "error": "Nothing to speak."], nil)
                            return
                        }
                        speak(text)
                        replyHandler(["ok": true, "provider": "ios-native"], nil)
                    case "stop":
                        speech.stopSpeaking(at: .immediate)
                        replyHandler(["ok": true], nil)
                    default:
                        replyHandler(["ok": false, "error": "Unknown speech action."], nil)
                    }
                }
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

        @MainActor
        private func speak(_ text: String) {
            speech.stopSpeaking(at: .immediate)
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = bestEnglishVoice()
            utterance.rate = 0.48
            utterance.pitchMultiplier = 1.0
            utterance.volume = 1.0
            utterance.preUtteranceDelay = 0.04
            utterance.postUtteranceDelay = 0.02

            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try session.setActive(true, options: [])
            } catch {
                // Speech can still proceed with the current audio-session configuration.
            }
            speech.speak(utterance)
        }

        private func bestEnglishVoice() -> AVSpeechSynthesisVoice? {
            let englishUS = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == "en-US" }
            if let premium = englishUS.first(where: { $0.quality == .premium }) { return premium }
            if let enhanced = englishUS.first(where: { $0.quality == .enhanced }) { return enhanced }
            return AVSpeechSynthesisVoice(language: "en-US")
        }
    }
}
