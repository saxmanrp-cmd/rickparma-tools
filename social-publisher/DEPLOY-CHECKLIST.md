# Social Publisher Upgrade Checklist

## v0.6.9 — Face ID / Passkey Login

1. Keep the existing Worker, D1 database, R2 bucket, OAuth apps, secrets, and password login.
2. GitHub Actions runs the test suite automatically.
3. Apply D1 migration `0003_passkeys.sql` to create passkey credential storage.
4. Deploy the Worker and refreshed PWA shell.
5. On iPhone, open Social Publisher and sign in with the existing password once.
6. Open **Settings → Face ID Login → Enable Face ID** and approve the iPhone passkey prompt.
7. Log out and confirm **Sign in with Face ID** opens the app.
8. Password login remains available as a fallback.

No Meta, Threads, or TikTok reconnection is required.

## v0.6.4 — Instagram Options

1. Keep the existing Worker, D1 database, R2 bucket, OAuth apps, and secrets.
2. Run the automated test suite.
3. Apply the existing D1 migrations.
4. Deploy the Worker.
5. Refresh/reopen Social Publisher.
6. Test Instagram Feed photo: add one **Tag Profile**, tap **Position**, publish.
7. Test Instagram Feed or Reel: add one **Collaborator**, publish, then verify the invite appears in Instagram.
8. After those pass, scheduled tags/collaborators can be tested.

No Meta reconnection is required.
