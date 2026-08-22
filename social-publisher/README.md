# Social Publisher

Current source version: **v0.6.4**

This directory is the canonical GitHub source for Social Publisher. Development happens on `social-publisher-dev`; stable releases are merged into `main` after CI passes.

## Validate locally

```bash
npm install
npm test
```

If you are checking out the initial GitHub seed commit before the materialization commit exists, run:

```bash
node scripts/restore-source.mjs
npm test
```

The restore step reconstructs `public/app.js` and `src/index.js` from a checksum-verified compressed source seed. GitHub Actions performs this automatically and materializes the source after the first successful development-branch run.

## Deploy

Deployment to the existing Cloudflare Worker remains separate from GitHub source control. Do not run database migrations or deploy until the release notes for the target version say to do so.
