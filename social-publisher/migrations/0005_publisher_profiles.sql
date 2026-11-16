-- Existing posts and connections belong to Rick's music profile.
ALTER TABLE posts ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'music';
CREATE INDEX IF NOT EXISTS idx_posts_profile_created ON posts(profile_id, created_at DESC);

-- The legacy social_accounts table stays intact for the music profile.
CREATE TABLE IF NOT EXISTS profile_social_accounts (
  profile_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_name TEXT,
  username TEXT,
  external_account_id TEXT NOT NULL,
  parent_account_id TEXT,
  access_token_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, platform)
);
