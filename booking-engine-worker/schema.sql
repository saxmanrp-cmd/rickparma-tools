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

INSERT OR IGNORE INTO app_state (id, state_json, version)
VALUES ('rick', '{}', 1);
