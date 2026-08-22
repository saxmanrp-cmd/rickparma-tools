# Upgrade to v0.6.4

Advanced Instagram people tools.

## New
- **Tag Profiles** on Instagram photo posts and Reels.
- Photo tags include real X/Y placement: tap **Position**, then tap the person in the image.
- Reel tags are sent by username (Instagram ignores image coordinates for video tags).
- **Invite Collaborators** supports up to 3 Instagram usernames on Feed posts and Reels.
- Tag/collaborator settings are saved with drafts and scheduled posts and restored by **Use Again**.
- Posts history shows tagged profiles and collaborators.

## Important limitations
- Instagram Stories do not use the new collaborator controls in this build.
- Instagram does not provide a reliable autocomplete for arbitrary consumer usernames through this publishing connection, so Social Publisher validates username format but Meta validates the account when publishing.
- Collaborators receive an Instagram invite and must accept it.

## Upgrade an existing v0.6.3 database
Run once:
```bash
npm install
npm run db:migrate
npm run deploy
```

No new secrets and no account reconnection are required.
