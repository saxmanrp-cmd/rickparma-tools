# Rick Parma Booking Engine

A lightweight, mobile-first CRM and campaign queue for Las Vegas music booking.

## What v1 does

- Loads 105 researched booking contacts plus the property-to-buyer map.
- Ranks leads by campaign score and priority.
- Separates working rooms, strategic casino buyers, and agencies/promoters.
- Builds a smart daily queue: due follow-ups first, targeted email leads next, then manual-approval relationship targets.
- Enforces the research workbook guardrails:
  - `YES - TARGETED`: eligible for personalized queueing.
  - `MANUAL APPROVAL`: always requires human review.
  - `NO`: never enters the outreach queue.
- Generates lane-specific email drafts or call scripts.
- Tracks status, last contacted date, next follow-up, and private notes in browser storage.
- Exports/imports CRM state as JSON.

## Important

This v1 intentionally does **not** auto-send email. It prepares and sorts campaigns while preserving human approval. Direct Gmail sending and cloud persistence can be added as the next phase.

## Files

- `index.html` — app shell
- `styles.css` — responsive UI
- `app.js` — CRM, ranking, queue and campaign logic
- `data.js` — seed data generated from `Las_Vegas_Music_Booking_Contacts_2026_DEEP_RESEARCH.xlsx`
