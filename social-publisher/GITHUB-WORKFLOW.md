# Social Publisher GitHub workflow

- `social-publisher-dev`: active development branch.
- `main`: stable branch after CI passes.
- `.github/workflows/social-publisher-ci.yml`: restores/validates source and runs tests on Node 22.
- Live Cloudflare deployment is intentionally separate from GitHub commits until explicitly deployed.
