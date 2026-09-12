# Lyrics Finder

A simple lyrics-source viewer and formatter with no paid lyrics API.

## What it does

- Enter a song title + artist.
- **Find Lyrics** uses DuckDuckGo's documented `\` operator to jump directly to the first result for an exact `title + artist + lyrics` search.
- The selected source is loaded in an in-app iframe when that website allows embedding.
- If the source blocks iframe embedding, **Open Source** opens the same top result directly in the browser.
- **Google Results** remains available as an alternate search.
- Copy lyrics manually from the source, return to the app, and use **Paste Lyrics**.
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

No lyrics API account, API key, or paid service is required. The lyrics remain on the original source website; the app does not extract or store full lyrics.
