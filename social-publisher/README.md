# Social Publisher

Current source version: **v0.6.9**

This directory is the canonical GitHub source for Social Publisher.

- Stable branch: `main`
- CI: `.github/workflows/social-publisher-ci.yml`
- Production deploy: `.github/workflows/social-publisher-deploy.yml`
- Cloudflare Worker entrypoint: `src/entry.js`

## Validate locally

```bash
npm install
npm test
```

`npm test` runs the automated smoke tests plus JavaScript syntax checks for the Worker and browser app.

## Database

D1 migrations are stored in `migrations/` and are applied automatically by the production deployment workflow before the Worker is deployed.

## Current capabilities

- Facebook + Instagram publishing and scheduling
- Instagram Feed, Story and Reel routing
- Facebook Reel routing
- Instagram profile tags, collaborator invites and Reel original-audio naming
- Threads publishing and scheduling
- TikTok draft handoff
- Max Reach + Reach Intelligence
- Performance Learning from Instagram and Facebook results
- Threads performance learning after the account grants `threads_manage_insights`
- iPhone Face ID / passkey login with password fallback

## Threads Performance Learning

The collector already supports Threads post insights (`views`, `likes`, `replies`, `reposts`, `quotes`, and `shares`). Reconnect Threads once after this update so the account grants `threads_manage_insights`; after that, Threads results automatically join Performance Learning.

## Deploy

Merges to `main` that touch `social-publisher/**` automatically run tests, apply pending D1 migrations, and deploy the Worker.

Never commit `.dev.vars`, access tokens, app secrets, or other credentials.
