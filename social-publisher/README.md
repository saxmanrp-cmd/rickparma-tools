# Social Publisher

Current source version: **v0.6.4**

This directory is the canonical GitHub source for Social Publisher.

- Development branch: `social-publisher-dev`
- Stable branch: `main`
- CI: `.github/workflows/social-publisher-ci.yml`
- Cloudflare Worker deployment remains a separate release step.

## Validate locally

```bash
npm install
npm test
```

`npm test` runs the automated smoke tests plus JavaScript syntax checks for the Worker and browser app.

## Database

v0.6.4 adds the Instagram tagging/collaborator options column. Apply the included migration before deploying v0.6.4 to the live Worker:

```bash
npm run db:migrate
```

## Deploy

After tests pass and the required migration has been applied:

```bash
npm run deploy
```

Never commit `.dev.vars`, access tokens, app secrets, or other credentials.
