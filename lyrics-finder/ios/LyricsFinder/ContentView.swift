import SwiftUI
import WebKit

struct ContentView: View {
    @State private var title = ""
    @State private var artist = ""
    @State private var lyricsURL: URL?
    @State private var showBrowser = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemBackground).ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Lyrics Finder")
                                .font(.system(size: 42, weight: .black, design: .rounded))
                            Text("Search by title and artist, then view DuckDuckGo’s Musixmatch-powered Lyrics card inside the app.")
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }

                        VStack(spacing: 14) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Song title")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                TextField("September", text: $title)
                                    .textInputAutocapitalization(.words)
                                    .autocorrectionDisabled()
                                    .textFieldStyle(.roundedBorder)
                                    .submitLabel(.next)
                            }

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Artist")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                TextField("Earth, Wind & Fire", text: $artist)
                                    .textInputAutocapitalization(.words)
                                    .autocorrectionDisabled()
                                    .textFieldStyle(.roundedBorder)
                                    .submitLabel(.search)
                                    .onSubmit(openLyrics)
                            }

                            Button(action: openLyrics) {
                                Label("Find Lyrics", systemImage: "music.note.list")
                                    .frame(maxWidth: .infinity)
                                    .font(.headline)
                                    .padding(.vertical, 6)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || artist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                        .padding(18)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))

                        VStack(alignment: .leading, spacing: 8) {
                            Label("Native test", systemImage: "iphone")
                                .font(.headline)
                            Text("This version uses WKWebView as the actual browser surface. It is not an iframe, so DuckDuckGo is loaded as top-level web content inside Lyrics Finder.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(16)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .padding(20)
                }
            }
            .navigationBarHidden(true)
        }
        .fullScreenCover(isPresented: $showBrowser) {
            if let lyricsURL {
                LyricsBrowserScreen(url: lyricsURL, songTitle: title, artist: artist)
            }
        }
    }

    private func openLyrics() {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanArtist = artist.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty, !cleanArtist.isEmpty else { return }

        var components = URLComponents()
        components.scheme = "https"
        components.host = "duckduckgo.com"
        components.path = "/"
        components.queryItems = [
            URLQueryItem(name: "q", value: "lyrics to \(cleanTitle) by \(cleanArtist)"),
            URLQueryItem(name: "t", value: "iphone"),
            URLQueryItem(name: "ia", value: "web"),
            URLQueryItem(name: "iax", value: "lyrics")
        ]

        guard let url = components.url else { return }
        lyricsURL = url
        showBrowser = true
    }
}

struct LyricsBrowserScreen: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var browser = BrowserModel()

    let url: URL
    let songTitle: String
    let artist: String

    var body: some View {
        NavigationStack {
            WebView(browser: browser)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(songTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Done") { dismiss() }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        if browser.isLoading {
                            ProgressView()
                        } else {
                            Button {
                                browser.reload()
                            } label: {
                                Image(systemName: "arrow.clockwise")
                            }
                            .accessibilityLabel("Reload")
                        }
                    }
                    ToolbarItemGroup(placement: .bottomBar) {
                        Button {
                            browser.goBack()
                        } label: {
                            Image(systemName: "chevron.left")
                        }
                        .disabled(!browser.canGoBack)
                        .accessibilityLabel("Back")

                        Button {
                            browser.goForward()
                        } label: {
                            Image(systemName: "chevron.right")
                        }
                        .disabled(!browser.canGoForward)
                        .accessibilityLabel("Forward")

                        Spacer()

                        Text(artist)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)

                        Spacer()

                        Button {
                            browser.openCurrentPageInSafari()
                        } label: {
                            Image(systemName: "safari")
                        }
                        .accessibilityLabel("Open in Safari")
                    }
                }
        }
        .onAppear {
            browser.load(url)
        }
    }
}

@MainActor
final class BrowserModel: NSObject, ObservableObject, WKNavigationDelegate {
    let webView: WKWebView

    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = false

    private var loadedInitialURL = false

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = true
        webView.scrollView.keyboardDismissMode = .interactive
    }

    func load(_ url: URL) {
        guard !loadedInitialURL else { return }
        loadedInitialURL = true
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
        updateNavigationState()
    }

    func goBack() {
        guard webView.canGoBack else { return }
        webView.goBack()
    }

    func goForward() {
        guard webView.canGoForward else { return }
        webView.goForward()
    }

    func reload() {
        webView.reload()
    }

    func openCurrentPageInSafari() {
        guard let url = webView.url else { return }
        UIApplication.shared.open(url)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        updateNavigationState()
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        updateNavigationState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        updateNavigationState()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        updateNavigationState()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        updateNavigationState()
    }

    private func updateNavigationState() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
    }
}

struct WebView: UIViewRepresentable {
    @ObservedObject var browser: BrowserModel

    func makeUIView(context: Context) -> WKWebView {
        browser.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
