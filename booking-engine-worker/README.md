# Rick Parma Booking Engine Worker

Cloudflare Worker + D1 backend for the Booking Engine CRM.

## Purpose

The browser app remains local-first using localStorage. This worker adds the secure cloud layer for:

- sync CRM state between Mac/iPhone
- preserve room preferences and `Already Playing Here` choices
- store campaign state/history
- store outbound/inbound message records
- send individually approved Microsoft 365 email
- send individually approved Twilio SMS only when `Text OK` is true
- store Microsoft message/conversation IDs for future reply detection
- store Twilio message SIDs for delivery/reply tracking

There is deliberately **no bulk-send endpoint**.

## One-time Cloudflare setup

```bash
cd booking-engine-worker
npm install
npx wrangler d1 create rick-booking-crm
```

Copy the returned D1 `database_id` into `wrangler.jsonc` in place of `REPLACE_AFTER_CREATING_D1_DATABASE`.

Initialize the database:

```bash
npm run db:init
```

### Login secrets

The browser never receives a permanent API secret. It exchanges Rick's app password for a short-lived signed session.

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Use a long random value for `SESSION_SECRET`.

Optional server/CLI fallback only:

```bash
npx wrangler secret put BOOKING_API_TOKEN
```

Do **not** put that token into front-end JavaScript.

### Microsoft 365 / Graph

The provider uses Microsoft Graph rather than SMTP AUTH. The tenant currently has SMTP AUTH disabled, which should remain that way.

Configure an Entra/Microsoft app with the required application mail permission and admin consent, then add:

```bash
npx wrangler secret put MS_TENANT_ID
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put MS_SENDER_USER
npx wrangler secret put MS_BOOKING_ALIAS
```

Expected sender values:

- `MS_SENDER_USER`: `saxman@rickparma.com`
- `MS_BOOKING_ALIAS`: `booking@rickparma.com`

The provider creates a draft first, captures Microsoft's message ID and conversation ID, then sends it. This is intentional so a later reply watcher can connect inbound replies to the correct campaign.

GoDaddy/Microsoft may still rewrite the alias to the licensed mailbox. The CRM preserves the requested identity separately so the alias issue can be resolved later without changing campaign history.

### Twilio

```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM_NUMBER
```

The SMS send endpoint requires all of these on every request:

- one recipient only
- `approved: true`
- `complianceOk: true`
- `textOk: true`

Deploy:

```bash
npm run deploy
```

## Authentication API

### `GET /api/auth/config`

Public health-style check showing whether app login is configured. Does not expose secret values.

### `POST /api/auth/login`

```json
{ "password": "..." }
```

Returns a signed session token valid for up to 12 hours. Store it in `sessionStorage`, not source code or persistent configuration.

### `GET /api/auth/status`

Requires `Authorization: Bearer <session-token>`.

All CRM/provider routes accept a valid short-lived session. `BOOKING_API_TOKEN`, when configured, is only an optional server/CLI fallback.

## Provider status

`GET /api/providers`

Reports whether Microsoft Graph and Twilio have all required configuration, without exposing the secret values.

## State

`GET /api/state`

Returns the saved Booking Engine state and its version.

`PUT /api/state`

```json
{
  "state": { "...": "full browser CRM state" },
  "expectedVersion": 3
}
```

`expectedVersion` is optional. When provided, conflicting writes return HTTP 409 rather than silently overwriting newer state.

## CRM events

`POST /api/events`

```json
{
  "contactId": "LV-0001",
  "eventType": "campaign_step_completed",
  "channel": "email",
  "payload": { "step": 1 }
}
```

`GET /api/events?contactId=LV-0001&limit=50`

## Message records

`GET /api/messages?contactId=LV-0001&limit=50`

The `providerMessageId` and `threadId` fields attach provider messages to CRM campaigns.

## Individually approved sends

### `POST /api/send/email`

Requires a logged-in session plus:

```json
{
  "approved": true,
  "complianceOk": true,
  "contactId": "LV-0001",
  "campaignId": "LV-0001",
  "from": "saxman@rickparma.com",
  "to": "buyer@example.com",
  "subject": "Live music introduction",
  "body": "..."
}
```

### `POST /api/send/sms`

```json
{
  "approved": true,
  "complianceOk": true,
  "textOk": true,
  "contactId": "LV-0001",
  "campaignId": "LV-0001",
  "to": "+17025551212",
  "body": "..."
}
```

## Security rules

- Never commit Microsoft, Twilio, password, session, or API secrets.
- No bulk-send route exists.
- Browser sessions expire.
- SMS requires the contact-level `Text OK` decision.
- Send requests require explicit approval and compliance confirmation.
- The Worker only allows configured Booking Engine origins through CORS.
- Keep the browser app functional without cloud sync so a backend outage never blocks Rick from accessing the CRM.
