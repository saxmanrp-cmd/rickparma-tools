import SwiftUI
import WebKit
import UIKit
import AVFoundation
import Speech

struct ContentView: View {
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

struct FuelWebView: UIViewRepresentable {
    let selectedPage: String
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        context.coordinator.currentPage = selectedPage
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "healthKit")
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "fuelSpeech")
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "fuelRecognition")
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "fuelAudio")
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "fuelNotifications")
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "fuelBarcode")

        let nativeShellSource = """
        document.documentElement.classList.add('fuel-native-shell');
        const fuelNativeStyle = document.createElement('style');
        fuelNativeStyle.id = 'fuel-native-shell-style';
        fuelNativeStyle.textContent = '.tabs{display:none!important}.app{padding-bottom:18px!important}html,body{background:#08111f!important}';
        document.head.appendChild(fuelNativeStyle);
        """
        config.userContentController.addUserScript(WKUserScript(source: nativeShellSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false

        let fuelBackground = UIColor(red: 8.0 / 255.0, green: 17.0 / 255.0, blue: 31.0 / 255.0, alpha: 1.0)
        webView.isOpaque = false
        webView.backgroundColor = fuelBackground
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = fuelBackground
        }
        webView.scrollView.backgroundColor = fuelBackground
        webView.scrollView.clipsToBounds = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.automaticallyAdjustsScrollIndicatorInsets = false
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
        webView.scrollView.zoomScale = 1.0
        webView.pageZoom = 1.0
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        context.coordinator.disableWebZoomGestures(in: webView)

        context.coordinator.webView = webView
        context.coordinator.startAppActiveObserver()

        if let url = URL(string: "https://rick-fuel-tracker.saxmanrp.workers.dev/?native=1") {
            webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.currentPage = selectedPage
        context.coordinator.selectPage(selectedPage, in: webView)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandlerWithReply, AVAudioPlayerDelegate {
        weak var webView: WKWebView?
        var currentPage = "home"
        private var lastSelectedPage: String?
        private let health = HealthKitManager()
        private let notifications = FuelNotificationManager()
        private let speech = AVSpeechSynthesizer()
        private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        private let audioEngine = AVAudioEngine()
        private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
        private var recognitionTask: SFSpeechRecognitionTask?
        private var coachAudioPlayer: AVAudioPlayer?
        private var appActiveObserver: NSObjectProtocol?
        private weak var barcodeOverlay: FuelBarcodeScannerOverlay?

        deinit {
            if let appActiveObserver {
                NotificationCenter.default.removeObserver(appActiveObserver)
            }
        }

        func startAppActiveObserver() {
            guard appActiveObserver == nil else { return }
            appActiveObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('fuel-app-active'))")
            }
        }

        func disableWebZoomGestures(in view: UIView) {
            for recognizer in view.gestureRecognizers ?? [] {
                if recognizer is UIPinchGestureRecognizer {
                    recognizer.isEnabled = false
                } else if let tap = recognizer as? UITapGestureRecognizer, tap.numberOfTapsRequired > 1 {
                    recognizer.isEnabled = false
                }
            }
            for child in view.subviews {
                disableWebZoomGestures(in: child)
            }
        }

        func selectPage(_ page: String, in webView: WKWebView, force: Bool = false) {
            let allowed = ["home", "log", "progress", "settings"]
            guard allowed.contains(page) else { return }
            guard force || lastSelectedPage != page else { return }
            lastSelectedPage = page
            let js = "document.querySelector('.tab[data-page=\"\(page)\"]')?.click(); window.scrollTo({top:0,left:0,behavior:'instant'});"
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

            if message.name == "fuelBarcode" {
                Task { @MainActor in
                    switch action {
                    case "scan":
                        do {
                            let code = try await scanBarcode()
                            replyHandler(["ok": true, "code": code, "provider": "ios-native-avfoundation"], nil)
                        } catch FuelBarcodeScannerError.cancelled {
                            replyHandler(["ok": false, "cancelled": true], nil)
                        } catch {
                            replyHandler(["ok": false, "error": error.localizedDescription], nil)
                        }
                    case "cancel":
                        barcodeOverlay?.cancel()
                        replyHandler(["ok": true], nil)
                    default:
                        replyHandler(["ok": false, "error": "Unknown barcode action."], nil)
                    }
                }
                return
            }

            if message.name == "fuelNotifications" {
                Task {
                    switch action {
                    case "authorize":
                        let ok = await notifications.authorize()
                        replyHandler(["ok": ok, "status": await notifications.status()], nil)
                    case "replace":
                        let items = body["notifications"] as? [[String: Any]] ?? []
                        do {
                            let count = try await notifications.replace(items)
                            replyHandler(["ok": true, "scheduled": count, "status": await notifications.status()], nil)
                        } catch {
                            replyHandler(["ok": false, "error": error.localizedDescription, "status": await notifications.status()], nil)
                        }
                    case "cancelAll":
                        await notifications.cancelAll()
                        replyHandler(["ok": true], nil)
                    case "status":
                        replyHandler(["ok": true, "status": await notifications.status()], nil)
                    default:
                        replyHandler(["ok": false, "error": "Unknown notification action."], nil)
                    }
                }
                return
            }

            if message.name == "fuelAudio" {
                Task { @MainActor in
                    switch action {
                    case "play":
                        let base64 = body["base64"] as? String ?? ""
                        guard let data = Data(base64Encoded: base64), !data.isEmpty else {
                            replyHandler(["ok": false, "error": "Invalid audio data."], nil)
                            return
                        }
                        do {
                            try playCoachAudio(data)
                            replyHandler(["ok": true, "provider": "ios-native-audio"], nil)
                        } catch {
                            replyHandler(["ok": false, "error": error.localizedDescription], nil)
                        }
                    case "stop":
                        stopCoachAudio()
                        replyHandler(["ok": true], nil)
                    default:
                        replyHandler(["ok": false, "error": "Unknown audio action."], nil)
                    }
                }
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

            if message.name == "fuelRecognition" {
                Task { @MainActor in
                    switch action {
                    case "transcribe":
                        do {
                            let text = try await transcribeOnce()
                            replyHandler(["ok": true, "text": text], nil)
                        } catch {
                            replyHandler(["ok": false, "error": error.localizedDescription], nil)
                        }
                    case "stop":
                        stopRecognition()
                        replyHandler(["ok": true], nil)
                    default:
                        replyHandler(["ok": false, "error": "Unknown recognition action."], nil)
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
        private func scanBarcode() async throws -> String {
            guard let webView else {
                throw FuelBarcodeScannerError.cameraUnavailable
            }

            let permission = await cameraPermissionGranted()
            guard permission else {
                throw FuelBarcodeScannerError.permissionDenied
            }

            barcodeOverlay?.cancel()

            return try await withCheckedThrowingContinuation { continuation in
                let overlay = FuelBarcodeScannerOverlay(frame: webView.bounds) { [weak self] result in
                    self?.barcodeOverlay = nil
                    continuation.resume(with: result)
                }
                overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                barcodeOverlay = overlay
                webView.addSubview(overlay)
                overlay.start()
            }
        }

        @MainActor
        private func cameraPermissionGranted() async -> Bool {
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                return true
            case .notDetermined:
                return await withCheckedContinuation { continuation in
                    AVCaptureDevice.requestAccess(for: .video) { granted in
                        continuation.resume(returning: granted)
                    }
                }
            default:
                return false
            }
        }

        @MainActor
        private func playCoachAudio(_ data: Data) throws {
            speech.stopSpeaking(at: .immediate)
            stopCoachAudio()
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true, options: [])
            let player = try AVAudioPlayer(data: data)
            player.delegate = self
            player.prepareToPlay()
            guard player.play() else {
                throw NSError(domain: "FuelAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not start Fuel Coach audio."])
            }
            coachAudioPlayer = player
        }

        @MainActor
        private func stopCoachAudio() {
            coachAudioPlayer?.stop()
            coachAudioPlayer = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }

        func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
            Task { @MainActor in
                if self.coachAudioPlayer === player {
                    self.coachAudioPlayer = nil
                    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                }
            }
        }

        @MainActor
        private func transcribeOnce() async throws -> String {
            stopRecognition()

            let speechStatus = await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status)
                }
            }
            guard speechStatus == .authorized else {
                throw NSError(domain: "FuelSpeechRecognition", code: 1, userInfo: [NSLocalizedDescriptionKey: "Speech recognition permission is required."])
            }

            let micGranted = await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
            guard micGranted else {
                throw NSError(domain: "FuelSpeechRecognition", code: 2, userInfo: [NSLocalizedDescriptionKey: "Microphone permission is required."])
            }
            guard let speechRecognizer, speechRecognizer.isAvailable else {
                throw NSError(domain: "FuelSpeechRecognition", code: 3, userInfo: [NSLocalizedDescriptionKey: "Speech recognition is not available right now."])
            }

            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            recognitionRequest = request

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            audioEngine.prepare()
            try audioEngine.start()

            return try await withCheckedThrowingContinuation { continuation in
                var resumed = false
                var latestText = ""
                var revision = 0

                @MainActor
                func finish(_ text: String?, error: Error? = nil) {
                    guard !resumed else { return }
                    resumed = true
                    self.stopRecognition()
                    if let error {
                        continuation.resume(throwing: error)
                    } else if let text, !text.isEmpty {
                        continuation.resume(returning: text)
                    } else {
                        continuation.resume(throwing: NSError(domain: "FuelSpeechRecognition", code: 4, userInfo: [NSLocalizedDescriptionKey: "I couldn't hear that clearly. Try again and speak after tapping the microphone."]))
                    }
                }

                recognitionTask = speechRecognizer.recognitionTask(with: request) { result, error in
                    DispatchQueue.main.async {
                        if let error {
                            finish(nil, error: error)
                            return
                        }
                        guard let result else { return }
                        let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !text.isEmpty {
                            latestText = text
                            revision += 1
                            let capturedRevision = revision
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2.25) {
                                if !resumed && capturedRevision == revision {
                                    finish(latestText)
                                }
                            }
                        }
                        if result.isFinal {
                            finish(text)
                        }
                    }
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
                    if !resumed {
                        finish(latestText)
                    }
                }
            }
        }

        @MainActor
        private func stopRecognition() {
            if audioEngine.isRunning {
                audioEngine.stop()
            }
            audioEngine.inputNode.removeTap(onBus: 0)
            recognitionRequest?.endAudio()
            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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

private enum FuelBarcodeScannerError: LocalizedError {
    case cancelled
    case permissionDenied
    case cameraUnavailable
    case setupFailed

    var errorDescription: String? {
        switch self {
        case .cancelled:
            return "Barcode scan cancelled."
        case .permissionDenied:
            return "Camera permission is required to scan barcodes."
        case .cameraUnavailable:
            return "The rear camera is not available."
        case .setupFailed:
            return "Fuel could not start the barcode camera."
        }
    }
}

private final class FuelBarcodePreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

    var previewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }
}

private final class FuelBarcodeScannerOverlay: UIView, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.rickparma.fuel.barcode.session")
    private let card = UIView()
    private let previewHost = FuelBarcodePreviewView()
    private let guide = UIView()
    private let titleLabel = UILabel()
    private let helpLabel = UILabel()
    private let cancelButton = UIButton(type: .system)
    private var completion: ((Result<String, Error>) -> Void)?
    private var completed = false

    init(frame: CGRect, completion: @escaping (Result<String, Error>) -> Void) {
        self.completion = completion
        super.init(frame: frame)
        buildUI()
    }

    required init?(coder: NSCoder) {
        nil
    }

    func start() {
        do {
            try configureSession()
        } catch {
            finish(.failure(error))
            return
        }

        sessionQueue.async { [weak self] in
            guard let self, !self.session.isRunning else { return }
            self.session.startRunning()
        }
    }

    func cancel() {
        finish(.failure(FuelBarcodeScannerError.cancelled))
    }

    private func buildUI() {
        backgroundColor = UIColor.black.withAlphaComponent(0.72)

        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = UIColor(red: 0.071, green: 0.110, blue: 0.192, alpha: 1)
        card.layer.cornerRadius = 22
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor(red: 0.165, green: 0.231, blue: 0.365, alpha: 1).cgColor
        addSubview(card)

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = "Scan barcode"
        titleLabel.textColor = .white
        titleLabel.font = .systemFont(ofSize: 20, weight: .bold)

        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Close", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
        cancelButton.backgroundColor = UIColor(red: 0.125, green: 0.180, blue: 0.286, alpha: 1)
        cancelButton.layer.cornerRadius = 12
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        previewHost.translatesAutoresizingMaskIntoConstraints = false
        previewHost.backgroundColor = .black
        previewHost.layer.cornerRadius = 16
        previewHost.clipsToBounds = true

        guide.translatesAutoresizingMaskIntoConstraints = false
        guide.backgroundColor = .clear
        guide.layer.cornerRadius = 10
        guide.layer.borderWidth = 2
        guide.layer.borderColor = UIColor.systemGreen.cgColor
        previewHost.addSubview(guide)

        helpLabel.translatesAutoresizingMaskIntoConstraints = false
        helpLabel.text = "Hold the whole UPC/EAN barcode inside the green box. Fuel will grab it automatically."
        helpLabel.textColor = UIColor(red: 0.70, green: 0.77, blue: 0.88, alpha: 1)
        helpLabel.font = .systemFont(ofSize: 14, weight: .semibold)
        helpLabel.numberOfLines = 0
        helpLabel.textAlignment = .center

        card.addSubview(titleLabel)
        card.addSubview(cancelButton)
        card.addSubview(previewHost)
        card.addSubview(helpLabel)

        NSLayoutConstraint.activate([
            card.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 16),
            card.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -16),
            card.centerXAnchor.constraint(equalTo: centerXAnchor),
            card.centerYAnchor.constraint(equalTo: centerYAnchor),
            card.widthAnchor.constraint(lessThanOrEqualToConstant: 430),
            card.widthAnchor.constraint(equalTo: widthAnchor, constant: -32),

            titleLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            titleLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),

            cancelButton.centerYAnchor.constraint(equalTo: titleLabel.centerYAnchor),
            cancelButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            cancelButton.widthAnchor.constraint(equalToConstant: 84),
            cancelButton.heightAnchor.constraint(equalToConstant: 44),

            previewHost.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 18),
            previewHost.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            previewHost.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            previewHost.heightAnchor.constraint(equalToConstant: 250),

            guide.leadingAnchor.constraint(equalTo: previewHost.leadingAnchor, constant: 24),
            guide.trailingAnchor.constraint(equalTo: previewHost.trailingAnchor, constant: -24),
            guide.centerYAnchor.constraint(equalTo: previewHost.centerYAnchor),
            guide.heightAnchor.constraint(equalToConstant: 100),

            helpLabel.topAnchor.constraint(equalTo: previewHost.bottomAnchor, constant: 12),
            helpLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            helpLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            helpLabel.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16)
        ])
    }

    private func configureSession() throws {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(for: .video) else {
            throw FuelBarcodeScannerError.cameraUnavailable
        }

        do {
            try device.lockForConfiguration()
            if device.isFocusModeSupported(.continuousAutoFocus) {
                device.focusMode = .continuousAutoFocus
            }
            if device.isExposureModeSupported(.continuousAutoExposure) {
                device.exposureMode = .continuousAutoExposure
            }
            if device.isFocusPointOfInterestSupported {
                device.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5)
            }
            device.unlockForConfiguration()
        } catch {
            // The scanner can still work with the camera's default focus settings.
        }

        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .high

        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else {
            throw FuelBarcodeScannerError.setupFailed
        }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            throw FuelBarcodeScannerError.setupFailed
        }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)

        let wanted: [AVMetadataObject.ObjectType] = [
            .ean13, .ean8, .upce, .code128, .code39, .code93, .itf14
        ]
        output.metadataObjectTypes = wanted.filter { output.availableMetadataObjectTypes.contains($0) }

        let layer = previewHost.previewLayer
        layer.session = session
        layer.videoGravity = .resizeAspectFill
        previewHost.setNeedsLayout()
        previewHost.layoutIfNeeded()
    }

    @objc private func cancelTapped() {
        cancel()
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !completed else { return }
        guard let codeObject = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject })
            .first(where: { !($0.stringValue ?? "").isEmpty }),
              let code = codeObject.stringValue else { return }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        finish(.success(code))
    }

    private func finish(_ result: Result<String, Error>) {
        guard !completed else { return }
        completed = true

        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }

        let callback = completion
        completion = nil
        removeFromSuperview()
        callback?(result)
    }
}
