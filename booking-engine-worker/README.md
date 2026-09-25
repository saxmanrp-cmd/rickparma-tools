# Rick Parma Booking Engine Worker

Cloudflare Worker + D1 backend for the autonomous Rick Parma Booking Agent.

## What the agent does

The browser remains local-first, but this Worker is designed to run the booking operation without daily babysitting:

- imports the existing Booking Engine research database
- verifies stale/manual contacts with current web research
- discovers additional Las Vegas rooms, buyers, agencies, promoters and appropriate event buyers
- scores fit and confidence conservatively
- writes target-specific outreach using Rick's real bio, casino/festival credits, videos, calendar and social links
- sends one-to-one Microsoft 365 email when Autopilot is in a sending mode
- follows up on the Day 5 / Day 10 / Day 16 / Day 75 cadence
- polls Microsoft replies and ties them to the correct campaign by conversation ID
- classifies replies and automatically handles routine responses
- stops campaigns on replies, passes and opt-outs
- surfaces only business decisions that genuinely need Rick

Cold automated SMS is intentionally disabled. Twilio remains available for known contacts where `Text OK` is explicitly set, but it is not part of autonomous cold prospecting.

## Autopilot modes

- **Off** — agent does nothing.
- **Shadow** — research, verify, draft and classify, but sends nothing. This is the default.
- **Pilot** — autonomous sending with small daily limits (default 3 new emails/day, 5 follow-ups/day).
- **Live** — autonomous operation using the configured daily limits.

The agent will not enter a sending mode successfully until its safety requirements are met.

## What always escalates to Rick

The agent can automatically handle normal relationship maintenance, promo requests, follow-up-later requests, submission redirects, basic questions and positive replies that do not require a commitment.

It creates a **Needs Rick** escalation for:

- rates / money
- contracts or legal terms
- a real date hold or booking offer
- availability commitments
- exclusivity
- unusual or ambiguous business commitments

For those messages the agent may send a brief acknowledgement to keep the conversation warm, but it will not invent a rate, promise a date or accept a contract.

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

## Login secrets

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

## OpenAI research + automation

The autonomous research/writing layer uses the OpenAI Responses API with web search for current prospect verification and lower-cost structured model calls for classification/drafting.

```bash
npx wrangler secret put OPENAI_API_KEY
```

Default model variables in `wrangler.jsonc`:

- `OPENAI_RESEARCH_MODEL`: `gpt-5.6-terra`
- `OPENAI_MODEL`: `gpt-5.6-luna`

They can be changed without changing the campaign code.

## Microsoft 365 / Graph

The provider uses Microsoft Graph rather than SMTP AUTH.

Configure an Entra/Microsoft app with the required application mail permissions and admin consent, then add:

```bash
npx wrangler secret put MS_TENANT_ID
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
```

The non-secret sender values are already in `wrangler.jsonc`:

- `MS_SENDER_USER`: `saxman@rickparma.com`
- `MS_BOOKING_ALIAS`: `booking@rickparma.com`

Initial outreach uses Rick's personal sender identity. The provider creates a Microsoft draft first, captures message/conversation IDs and then sends it. Automated replies use `createReply`, so they stay inside the existing buyer thread.

GoDaddy/Microsoft may still rewrite the alias to the licensed mailbox. That does not block the personal-sender campaign path.

## Business postal address / commercial email safety

Before Pilot or Live can send, Settings → Booking Agent must contain a valid **business postal address**. Use an appropriate business address, PO Box or commercial mailbox; do not fabricate one.

Every autonomous cold email receives:

- truthful sender identity
- a business postal address
- a clear reply-based opt-out line

Opt-outs are propagated across duplicate records tied to the same email/phone.

## Twilio (optional / relationship contacts only)

```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM_NUMBER
```

The existing SMS endpoint requires one recipient, explicit approval, compliance confirmation and contact-level `Text OK`. The autonomous cold engine never uses it.

## Deploy

```bash
npm run deploy
```

The Worker cron runs every 10 minutes. Each scheduled cycle:

1. syncs Microsoft inbox replies
2. processes inbound replies before any new outbound work
3. runs daily research once per Las Vegas local day
4. generates/sends due initial emails and follow-ups according to mode/limits

## Autonomous API

All routes below require a valid Booking Engine session.

### `GET /api/autopilot/status`

Returns mode, readiness, provider state, counts and the latest run summary.

### `GET /api/autopilot/config`

Returns Autopilot configuration and readiness.

### `PUT /api/autopilot/config`

Saves mode, daily limits, thresholds, business postal address and other policy settings.

### `POST /api/autopilot/run`

Runs one booking-agent cycle immediately.

```json
{ "forceResearch": false }
```

### `GET /api/autopilot/drafts`

Returns Shadow Mode drafts for inspection.

### `POST /api/prospects/import`

Seeds/updates D1 from the existing `BOOKING_DATA.contacts` plus current browser CRM state. The operation is idempotent.

### `GET /api/prospects`

Returns server-side prospects, including newly discovered research.

### `GET /api/escalations`

Returns the **Needs Rick** queue.

### `POST /api/escalations/:id/resolve`

Marks one exception resolved.

## Existing core API

- `GET /api/health`
- `GET /api/auth/config`
- `POST /api/auth/login`
- `GET /api/auth/status`
- `GET /api/providers`
- `GET/PUT /api/state`
- `GET/POST /api/events`
- `GET/POST /api/messages`
- `POST /api/send/email`
- `POST /api/send/sms`
- `POST /api/webhooks/twilio`

## Security rules

- Never commit OpenAI, Microsoft, Twilio, password, session or API secrets.
- The browser receives only a short-lived signed Booking Engine session.
- No general bulk-send endpoint exists.
- Cold automated SMS is disabled in policy code.
- Autonomous email requires fit/confidence thresholds and a verified professional email route.
- Do Not Contact, Pass, Booked, current venues and room-level skips stop automation.
- Replies are processed before new sends so the agent cannot send a follow-up after a response has already arrived.
- Local browser CRM remains usable if the Worker is unavailable.
