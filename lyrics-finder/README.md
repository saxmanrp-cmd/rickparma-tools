# Lyrics Finder

A simple web-search launcher and lyrics formatter.

## What it does

- Enter a song title + artist.
- Search Google or DuckDuckGo for that exact song and the word `lyrics`.
- Copy lyrics from the result you choose.
- Return to the app and use **Paste Lyrics** (or paste normally).
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

No lyrics API account, API key, or paid service is required. The app only creates a focused web-search URL from the title and artist entered by the user.
