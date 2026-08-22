# Social Publisher v0.6.6

Adds the first Max Reach engine and native Facebook Reel publishing.

## Max Reach
- Automatically analyzes uploaded media
- Detects image vs video and reads video dimensions/duration
- Recommends Instagram/Facebook post types and additional destinations
- One tap applies the recommendation while respecting disconnected platforms
- 9:16 videos from 4-60 seconds and at least 540x960 are routed to Facebook Reel

## Facebook Reels
Uses Meta's Page Reels Publishing flow: create upload session, upload the hosted R2 media URL, then publish the Reel. Existing Facebook Page permissions are reused.

## Upgrade
No D1 migration and no new secrets are required.

1. npm install
2. npm test
3. npm run deploy
