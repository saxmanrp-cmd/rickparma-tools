CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT,
  event_type TEXT NOT NULL,
  channel TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_events_contact_created
  ON crm_events(contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  channel TEXT NOT NULL,
  provider TEXT,
  sender TEXT,
  recipient TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'prepared',
  provider_message_id TEXT,
  thread_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  received_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_contact_created
  ON messages(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages(thread_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_message_unique
  ON messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sync_state (
  provider TEXT PRIMARY KEY,
  cursor TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS autopilot_config (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  entity TEXT NOT NULL,
  room TEXT,
  category TEXT,
  profile TEXT,
  contact_name TEXT,
  contact_role TEXT,
  email TEXT,
  phone TEXT,
  website_url TEXT,
  booking_url TEXT,
  contact_route TEXT,
  fit_score INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  automation_safe TEXT NOT NULL DEFAULT 'MANUAL',
  fit_reason TEXT,
  evidence_summary TEXT,
  source_urls_json TEXT,
  buyer_key TEXT,
  status TEXT NOT NULL DEFAULT 'researched',
  room_preference TEXT NOT NULL DEFAULT 'OPEN',
  relationship TEXT NOT NULL DEFAULT 'Cold',
  text_ok INTEGER NOT NULL DEFAULT 0,
  current_venue INTEGER NOT NULL DEFAULT 0,
  suppressed INTEGER NOT NULL DEFAULT 0,
  campaign_type TEXT,
  campaign_stage INTEGER NOT NULL DEFAULT 0,
  campaign_active INTEGER NOT NULL DEFAULT 0,
  touch_count INTEGER NOT NULL DEFAULT 0,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  last_researched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_research_at TEXT,
  last_contacted_at TEXT,
  next_action_at TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_prospects_status_action
  ON prospects(status, campaign_active, next_action_at);

CREATE INDEX IF NOT EXISTS idx_prospects_fit_confidence
  ON prospects(fit_score DESC, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_prospects_email
  ON prospects(email);

CREATE TABLE IF NOT EXISTS prospect_contacts (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  market TEXT,
  website_url TEXT,
  social_url TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  source_message_id TEXT,
  source_kind TEXT NOT NULL DEFAULT 'reply',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect
  ON prospect_contacts(prospect_id, is_primary DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_contacts_email
  ON prospect_contacts(email);

CREATE INDEX IF NOT EXISTS idx_prospect_contacts_phone
  ON prospect_contacts(phone);

CREATE TABLE IF NOT EXISTS suppressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(kind, value)
);

CREATE INDEX IF NOT EXISTS idx_suppressions_contact
  ON suppressions(contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  message_id TEXT,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  summary TEXT NOT NULL,
  proposed_action TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalations_status_created
  ON escalations(status, created_at DESC);

CREATE TABLE IF NOT EXISTS autopilot_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  summary_json TEXT,
  error_text TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_autopilot_runs_type_started
  ON autopilot_runs(run_type, started_at DESC);

INSERT OR IGNORE INTO app_state (id, state_json, version)
VALUES ('rick', '{}', 1);

INSERT OR IGNORE INTO autopilot_config (id, config_json)
VALUES ('default', '{"mode":"shadow"}');

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'rick',
  public_key_b64url TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  transports_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user
  ON passkey_credentials(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'rick',
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry
  ON auth_challenges(expires_at);
