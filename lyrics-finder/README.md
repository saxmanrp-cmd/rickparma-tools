# Lyrics Finder

A simple DuckDuckGo Lyrics-card viewer and formatter with no paid lyrics API.

## What it does

- Enter a song title + artist.
- **Load Lyrics Card** builds DuckDuckGo's dedicated Lyrics-view URL:
  - `q=lyrics to TITLE by ARTIST`
  - `t=iphone`
  - `ia=web`
  - `iax=lyrics`
- The app attempts to display DuckDuckGo's own Musixmatch-powered Lyrics view inside an embedded iframe.
- If DuckDuckGo blocks framing, **Open in Safari** opens that same Lyrics URL directly.
- Copy lyrics manually from DuckDuckGo's card.
- Tap **Paste Lyrics**, then **Copy All**.
- Copy everything in this exact format:

```text
TITLE
ARTIST

Lyrics body
```

## Local development

```bash
npm install
npm run dev
```

## Production

The Worker name is `rick-lyrics-finder`.

No lyrics API account, API key, or paid service is required. The embedded page remains DuckDuckGo's original content; Lyrics Finder does not extract or store the lyrics.
