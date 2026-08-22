Social Publisher v0.6.4 source seed.

The three `.seed/source.tgz.b64.*` files contain a checksum-verified compressed copy of `public/app.js` and `src/index.js`. GitHub Actions restores them, runs the full test suite, then materializes the normal source files on `social-publisher-dev` after the first successful run.
