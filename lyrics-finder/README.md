# Lyrics Finder

A simple DuckDuckGo Lyrics-view launcher and formatter with no paid lyrics API.

## What it does

- Enter a song title + artist.
- **Find Lyrics in DuckDuckGo** opens DuckDuckGo using the dedicated Lyrics-view URL pattern:
  - `q=lyrics to TITLE by ARTIST`
  - `t=iphone`
  - `ia=web`
  - `iax=lyrics`
- On iPhone/Safari, DuckDuckGo can render its Musixmatch-powered lyrics card directly in that Lyrics view when one is available.
- Copy lyrics manually from that card.
- Use the browser Back button to return to Lyrics Finder; the app preserves the title and artist.
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

No lyrics API account, API key, or paid service is required. Lyrics Finder only builds the DuckDuckGo Lyrics-view URL; it does not fetch, extract, or store the lyrics itself.
