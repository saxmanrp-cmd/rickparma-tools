# Social Publisher GitHub workflow

1. Build changes on `social-publisher-dev`.
2. GitHub Actions runs `npm install` and `npm test` for every Social Publisher change.
3. Merge to `main` only after CI is green.
4. Treat `main` as the stable source and rollback point.
5. Apply any required D1 migration before deploying a release to Cloudflare.
6. Keep Cloudflare credentials and platform secrets out of GitHub.

The live Worker is not automatically deployed by CI yet. That is intentional while the GitHub workflow is being established.
