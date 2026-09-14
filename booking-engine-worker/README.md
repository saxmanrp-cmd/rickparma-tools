# Rick Parma Booking Engine Worker

Cloudflare Worker + D1 backend for the Booking Engine CRM.

## Purpose

The browser app currently works offline-first using localStorage. This worker is the persistence layer for the next phase:

- sync CRM state between Mac/iPhone
- preserve room preferences and `Already Playing Here` choices
- store campaign state/history
- store outbound/inbound message records
- provide the thread/message IDs needed for future Microsoft 365 reply detection
- provide the message records needed for future Twilio booking SMS

It intentionally does **not** send email or SMS yet. Sending providers will be added behind dedicated endpoints after credentials/permissions are configured.

## One-time Cloudflare setup

```bash
cd booking-engine-worker
npm install
npx wrangler d1 create rick-booking-crm
```

Copy the returned D1 `database_id` into `wrangler.jsonc` in place of `REPLACE_AFTER_CREATING_D1_DATABASE`.

Then initialize the database:

```bash
npm run db:init
```

Create an API token secret used only by Rick's Booking Engine:

```bash
npx wrangler secret put BOOKING_API_TOKEN
```

Deploy:

```bash
npm run deploy
```

## API

All routes except `/api/health` require:

```text
Authorization: Bearer <BOOKING_API_TOKEN>
```

### State

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

### CRM events

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

### Message records

`POST /api/messages` stores prepared/sent/received message metadata. It does not send the message.

`GET /api/messages?contactId=LV-0001&limit=50`

The `providerMessageId` and `threadId` fields are reserved for Microsoft Graph/Twilio integration so replies can later be attached to the correct campaign automatically.

## Security

- Do not commit `BOOKING_API_TOKEN`.
- The Worker only allows configured Booking Engine origins through CORS.
- Keep the static Booking Engine functional without cloud sync so a backend outage never blocks Rick from accessing the CRM.
