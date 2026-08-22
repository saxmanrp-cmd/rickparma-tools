ALTER TABLE posts ADD COLUMN timezone TEXT;

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
