# Lyrics Finder

A simple Google lyrics-search launcher and formatter with no paid lyrics API.

## What it does

- Enter a song title + artist.
- **Find Lyrics on Google** opens a normal Google search for `title + artist + lyrics` in the same browser context.
- Google may render its own Musixmatch-powered lyrics card directly in the search results.
- Copy lyrics manually from Google's card or another result.
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

No lyrics API account, API key, or paid service is required. The app opens Google search but does not scrape, extract, or store lyrics from Google or any lyrics provider.
