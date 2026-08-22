# v0.6.4 Upgrade Checklist

1. Keep the existing Worker, D1 database, R2 bucket, OAuth apps, and secrets.
2. From this folder run `npm install`.
3. Run `npm run db:migrate` **once** to add `instagram_options` to the existing D1 database.
4. Run `npm run deploy`.
5. Refresh/reopen Social Publisher.
6. Test Instagram Feed photo: add one **Tag Profile**, tap **Position**, publish.
7. Test Instagram Feed or Reel: add one **Collaborator**, publish, then verify the invite appears in Instagram.
8. After those pass, scheduled tags/collaborators can be tested.

No Meta reconnection is required.
