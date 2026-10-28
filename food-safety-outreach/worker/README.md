# Food Safety with Gazelle: private outreach engine

This is the hosted engine behind Richard's tools-repo shortcut, `gazelle.html`. It runs as a dedicated Cloudflare Worker with its own D1 database. No database records, mailbox tokens, access codes, or secrets belong in this public repository.

The private panel has five pages: Home, Places, Letters, Replies, and Settings. It starts in **Test mode** and **Paused**. Live sending requires complete business details, a verified Microsoft mailbox connection, human-approved drafts, and a deliberate switch to Live mode. The current official inspection record is downloaded again before an approved live send.

`src/snhd.js` reads the official Southern Nevada Health District ZIP and only qualifies an active permit when its current B or C grade agrees with the latest inspection grade and date. `src/workflow.js` prepares short commercial letters, enforces daily limits and weekday hours, and stops follow-ups after a reply. `src/graph.js` reads Gazelle's Microsoft mailbox and classifies replies for human review. `src/store.js` keeps source, contact, audit, and permanent do-not-contact records. `src/auth.js` protects the panel. Other Nevada areas require a separate verified official source adapter.

The hourly schedule in `wrangler.jsonc` updates the list and checks the mailbox. A failed source check prevents sending. Operators can also refresh the list or check replies from the panel. The database schema and safe defaults are in `schema.sql`; sample checks are in `test/`.

The business card provided the name, services, phone, and Instagram handle. A valid business postal address, actual offer, approved letter style, and final sending limits still need Gazelle's input before live outreach.
