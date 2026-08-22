# Social Publisher v0.6.5

Adds Instagram Reel original-audio naming with Meta audio_name publishing support.

## What changed

- Reel-only Original Audio Name field in Create
- Audio name is preserved when scheduling, editing, and using **Use Again**
- Reel publishing sends audio_name to Instagram
- History shows the saved audio name
- PWA shell cache bumped so installed copies refresh

## Important limitation

This names the original audio already embedded in the uploaded Reel video. It does **not** browse or attach tracks from Instagram's licensed/trending music library.

## Upgrade

No D1 migration is required. The value is stored inside the existing instagram_options JSON column.

1. npm install
2. npm test
3. npm run deploy
