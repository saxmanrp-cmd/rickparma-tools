# Social Publisher v0.6.6.1

Reliability patch for multi-platform Max Reach video posts.

- Threads video processing now waits up to roughly four minutes instead of about 30 seconds.
- Video jobs that include Threads are owned by the scheduled worker rather than an HTTP background task.
- Retry preserves prior successful platform receipts and publishes only destinations that previously failed.
- Retry is accepted only for failed or partially failed posts.
- Publishing stale-job recovery window increased to 20 minutes to accommodate sequential Meta/Threads video processing.
- No D1 migration, secrets, or account reconnects are required.
