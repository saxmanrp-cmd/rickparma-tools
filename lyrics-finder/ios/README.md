# Lyrics Finder iPhone app

This is a native iOS experiment for Lyrics Finder. It exists to test the one thing the web/PWA version cannot do reliably: load DuckDuckGo's Lyrics experience as top-level web content inside the app instead of inside an iframe.

## Flow

1. Enter song title + artist.
2. Tap **Find Lyrics**.
3. The app builds the same DuckDuckGo Lyrics URL used by the working Safari example:
   - `q=lyrics to TITLE by ARTIST`
   - `t=iphone`
   - `ia=web`
   - `iax=lyrics`
4. A native `WKWebView` opens full screen inside Lyrics Finder.
5. If DuckDuckGo renders its Musixmatch-powered lyrics card, the user can select and copy directly in that native web view.

No lyrics are scraped, extracted, proxied, or stored by the app.

## Generate the Xcode project

This repo already uses XcodeGen for Fuel, and this project follows the same pattern.

```bash
cd lyrics-finder/ios
brew install xcodegen   # only if XcodeGen is not already installed
xcodegen generate
open LyricsFinder.xcodeproj
```

Then select an Apple Development Team in **Signing & Capabilities**, choose your physical iPhone, and press Run.

The app targets iOS 17+ and uses the bundle identifier `com.rickparma.lyricsfinder`.
