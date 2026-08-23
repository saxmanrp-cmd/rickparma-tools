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
