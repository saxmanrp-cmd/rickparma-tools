# Gazelle's private tools page

Gazelle's familiar tools link is `https://saxmanrp-cmd.github.io/rickparma-tools/gazelle.html`. It forwards to her passkey-protected panel at `https://gazelle-food-safety-outreach.saxmanrp.workers.dev/`. The forwarding page contains no private data.

## Where it runs

- Source: `rickparma-tools/food-safety-outreach/worker/`
- Host: a dedicated Cloudflare Worker named `gazelle-food-safety-outreach` in Richard's existing tools hosting account
- Database: a separate Cloudflare D1 database named `gazelle-food-safety-outreach-db`
- Mail: Gazelle's dedicated Microsoft Entra app and `support@foodsafetywithgazelle.com`, with connection secrets kept outside GitHub
- Access: device passkey with Face ID, Touch ID, or a device screen lock; secure session cookie and form protection

The Worker checks the official Southern Nevada Health District download and Microsoft mailbox hourly. It checks the official record again before a permitted live send. The default controls are **Test mode** and **Paused**. Adding a sender address or connecting mail does not turn on live outreach. The business postal address, offer, and approved message style are still required.

## Operator guide

Richard gives Gazelle the one-time setup link stored privately on the T7 at `food-safety-outreach/data/passkey-setup-link.txt`. She opens that link on her own device and taps **Set up Face ID**. Her device may offer Face ID, Touch ID, a screen lock, or a nearby phone. After setup, she uses the normal tools link and taps **Open with Face ID**. No Gazelle passphrase was created. The setup link works once and expires after seven days; Richard can issue a new one if needed. Sign out on a shared computer.

The panel has five pages: Home, Places, Letters, Replies, and Settings. Settings shows whether sending is on, the daily limit and hours, missing business details, and the never-contact list.

The official import is hourly, so the database updates at least weekly even when the Mac is off. The local SQLite database on the T7 remains a backup; it is not the hosted database. Back up the D1 database periodically with Cloudflare's export tools, and restore it only to Gazelle's dedicated database.

## Deployment and recovery

Run Wrangler from `food-safety-outreach/worker/`. Its `wrangler.jsonc` binds only Gazelle's D1 database and sets an hourly cron. `schema.sql` creates the tables and conservative Test/Paused defaults. Never commit `hosted-secrets.json`, `hosted-migration.sql`, the Microsoft token, setup link, or a database export. They are stored in the separate private T7 data folder and excluded from the repository.

If Microsoft's delegated connection expires, Richard must reconnect `support@foodsafetywithgazelle.com` through the dedicated Entra app and replace the hosted connection secret. Until then, the engine must leave sending off and report the mail check failure. No password for Exchange is stored.

## Before live outreach

Richard and Gazelle must supply a valid business postal address, the actual service offer, approved message style, and sending limits; review sample drafts and the opt-out wording; confirm the mailbox works; and explicitly activate Live mode in Settings. Only approved letters can send, during the chosen weekday business hours. A current official B or C record and a verified public contact email are required for each lead.
