CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  caption TEXT NOT NULL,
  platforms TEXT NOT NULL,
  media_key TEXT,
  media_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  publish_results TEXT,
  instagram_options TEXT,
  timezone TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_status_schedule ON posts(status, scheduled_at);

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL UNIQUE,
  account_name TEXT,
  username TEXT,
  external_account_id TEXT,
  parent_account_id TEXT,
  access_token_encrypted TEXT,
  token_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta_page_candidates (
  page_id TEXT PRIMARY KEY,
  page_name TEXT NOT NULL,
  page_token_encrypted TEXT NOT NULL,
  instagram_id TEXT,
  instagram_username TEXT,
  instagram_name TEXT,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS tiktok_account (
  id TEXT PRIMARY KEY,
  open_id TEXT,
  display_name TEXT,
  avatar_url TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  scopes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads_account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT,
  access_token_encrypted TEXT NOT NULL,
  access_token_expires_at TEXT,
  scopes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS performance_tracking (
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT,
  check_index INTEGER NOT NULL DEFAULT 0,
  next_check_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  last_metrics TEXT,
  last_score REAL NOT NULL DEFAULT 0,
  last_error TEXT,
  last_checked_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (post_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_performance_tracking_due ON performance_tracking(completed, next_check_at);

CREATE TABLE IF NOT EXISTS performance_snapshots (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT,
  captured_at TEXT NOT NULL,
  age_hours REAL NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL,
  performance_score REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_performance_snapshots_post ON performance_snapshots(post_id, platform, captured_at);

CREATE TABLE IF NOT EXISTS passkeys (
  credential_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  algorithm INTEGER NOT NULL DEFAULT -7,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  label TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_passkeys_created_at ON passkeys(created_at);
