# Lyrics Finder

A small Musixmatch-only song finder and lyrics formatter.

## What it does

- Search by song title + artist.
- Match the song through the official Musixmatch API.
- Open the official Musixmatch lyrics page.
- Paste lyrics you own or are authorized to use.
- Copy everything in this exact format:

```text
TITLE
ARTIST

Lyrics body
```

## Local development

```bash
npm install
npx wrangler secret put MUSIXMATCH_API_KEY
npm run dev
```

## Production

The Worker name is `rick-lyrics-finder`.

The Musixmatch API key must be stored as the Cloudflare Worker secret `MUSIXMATCH_API_KEY`. The GitHub deploy workflow will also sync it automatically when a repository secret with the same name exists.

The API key is never sent to the browser.
