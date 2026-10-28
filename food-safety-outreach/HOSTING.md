# Gazelle's private tools page

Gazelle's familiar tools link is `https://saxmanrp-cmd.github.io/rickparma-tools/gazelle.html`. It forwards to the password-protected Gazelle panel at `https://gazelle-food-safety-outreach.saxmanrp.workers.dev/`. The forwarding page contains no private data. Do not give Gazelle the link until the hosted panel and login have been tested.

## Where it runs

- Source: `rickparma-tools/food-safety-outreach/worker/`
- Host: a dedicated Cloudflare Worker named `gazelle-food-safety-outreach` in Richard's existing tools hosting account
- Database: a separate Cloudflare D1 database named `gazelle-food-safety-outreach-db`
- Mail: Gazelle's dedicated Microsoft Entra app and `support@foodsafetywithgazelle.com`, with connection secrets kept outside GitHub
- Access: private passphrase, secure session cookie, and form protection

The Worker checks the official Southern Nevada Health District download and Microsoft mailbox hourly. It checks the official record again before a permitted live send. The default controls are **Test mode** and **Paused**. Adding a sender address or connecting mail does not turn on live outreach. The business postal address, offer, and approved message style are still required.

## Operator guide

Gazelle opens the tools link, enters her access code, and uses five pages: Home, Places, Letters, Replies, and Settings. The Settings page shows whether sending is on, the daily limit and hours, missing business details, and the never-contact list. The code to unlock the panel is stored privately on Richard's T7 at `food-safety-outreach/data/hosted-access-code.txt`; give it to Gazelle privately. Sign out on a shared computer.

The official import is hourly, so the database updates at least weekly even when the Mac is off. The local SQLite database on the T7 remains a backup; it is not the hosted database. Back up the D1 database periodically with Cloudflare's export tools, and restore it only to Gazelle's dedicated database.

## Deployment and recovery

Run Wrangler from `food-safety-outreach/worker/`. Its `wrangler.jsonc` binds only Gazelle's D1 database and sets an hourly cron. `schema.sql` creates the tables and conservative Test/Paused defaults. Never commit `hosted-secrets.json`, `hosted-migration.sql`, the Microsoft token, access code, or a database export. They are stored in the separate private T7 data folder and excluded from the repository.

If Microsoft's delegated connection expires, Richard must reconnect `support@foodsafetywithgazelle.com` through the dedicated Entra app and replace the hosted connection secret. Until then, the engine must leave sending off and report the mail check failure. No password for Exchange is stored.

## Before live outreach

Richard and Gazelle must supply a valid business postal address, the actual service offer, approved message style, and sending limits; review sample drafts and the opt-out wording; confirm the mailbox works; and explicitly activate Live mode in Settings. Only approved letters can send, during the chosen weekday business hours. A current official B or C record and a verified public contact email are required for each lead.
