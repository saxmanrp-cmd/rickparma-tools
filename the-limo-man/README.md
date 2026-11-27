# The Limo Man

Single-screen coming-soon website with a first-party signup endpoint and a private subscriber manager.

- Public page: https://thelimoman.com/
- Subscriber tool: https://thelimoman.com/admin/subscribers
- Signups save directly to the hosted D1 database with a unique normalized email, consent, timestamps, source, and subscription status.
- The private manager supports search, subscribed/unsubscribed views, CSV export, and consented CSV imports.
- Owner access uses the existing ChatGPT sign-in. Public requests cannot read or export the list.
- Subscriber data is never committed to this repository. There is no automatic 30-day deletion.

## Development

Use Node 22.13 or newer. Install with `npm run install:ci`, generate schema migrations with `npm run db:generate`, and run `npm run dev -- --hostname 127.0.0.1 --port 4317`. The starter's maintained build and local D1 commands are documented in the Sites skill. Configure production `OWNER_EMAIL` and secret `SIGNUP_HASH_SALT` in the hosting environment. Use the `.env.example` key names; never commit actual values.

`node tests/subscribers.integration.mjs` runs against the local development server and local database. It checks validation, cross-site rejection, owner-only list/export access, duplicate prevention, unsubscribe behavior, and CSV import. Test data stays in the local preview database.

## Deployment

The existing Site project is declared in `.openai/hosting.json`. Publish with the Sites source/build workflow, which provisions D1 and applies committed schema migrations. Keep the existing project ID, public audience, and custom domains. Local source is also mirrored under `the-limo-man/` in `saxmanrp-cmd/rickparma-tools`; the root `limo-subscribers.html` tool opens the private manager.

The landing page and its only form are in `site/landing.html`, `public/styles.css`, and `public/app.js`. Server routes and owner authorization are in `app/` and `lib/`. Database schema and migrations are in `db/` and `drizzle/`.
