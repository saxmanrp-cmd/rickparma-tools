# Lyrics Finder

A simple DuckDuckGo Lyrics launcher and formatter with no paid lyrics API.

## What it does

- Enter a song title + artist.
- **Open Lyrics Card** builds DuckDuckGo's dedicated Lyrics-view URL:
  - `q=lyrics to TITLE by ARTIST`
  - `t=iphone`
  - `ia=web`
  - `iax=lyrics`
- DuckDuckGo opens as the top-level page instead of an iframe, avoiding the blank embedded frame caused by browser security restrictions.
- Copy lyrics manually from DuckDuckGo's Musixmatch-powered card.
- Use Back to return to Lyrics Finder; title, artist, and any typed lyrics are preserved.
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

No lyrics API account, API key, or paid service is required. Lyrics Finder only launches DuckDuckGo's Lyrics view and does not extract or store lyrics from the provider.
