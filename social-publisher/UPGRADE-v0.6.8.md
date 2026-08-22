# Social Publisher v0.6.8

Performance Learning turns Reach Intelligence from general guidance into a system that learns from published results.

- Automatically tracks supported Instagram and Facebook post engagement after publishing.
- Samples results around 2h, 24h and 72h and backfills recent published posts.
- Normalizes performance within each platform before comparing formats and timing.
- Learns best day/time windows, strongest format and useful caption patterns after 5 usable posts.
- Reach Intelligence switches from Learning Mode to Personalized Mode automatically.
- Browser timezone is stored on new posts so timing is learned in the creator's local time.
- Threads is prepared for performance learning but needs threads_manage_insights permission before its metrics can join the model.
- TikTok draft uploads cannot be reliably mapped to a final TikTok post yet, so TikTok is not used in the learning score.
- Existing Max Reach routing, retries and publishing behavior are unchanged.

Database migration required: npm run db:migrate
No new secrets are required. Existing platform connections do not need to be disconnected.
