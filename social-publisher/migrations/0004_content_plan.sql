CREATE TABLE IF NOT EXISTS content_plan_items (
  id TEXT PRIMARY KEY,
  week_key TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  media_accept TEXT,
  caption_starter TEXT NOT NULL,
  why_text TEXT,
  scheduled_for TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  source TEXT NOT NULL DEFAULT 'weekly-planner',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_plan_week ON content_plan_items(week_key, status, scheduled_for);
