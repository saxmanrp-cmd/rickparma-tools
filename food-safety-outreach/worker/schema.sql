CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS source_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, url TEXT NOT NULL,
  sha256 TEXT NOT NULL, checked_at TEXT NOT NULL, rows_seen INTEGER NOT NULL,
  qualified INTEGER NOT NULL, held INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS businesses (
  business_key TEXT PRIMARY KEY, facility_id TEXT, permit_number TEXT, name TEXT NOT NULL,
  location_name TEXT, address TEXT, city TEXT, zip_code TEXT, record_status TEXT,
  grade TEXT, inspection_date TEXT, latest_grade TEXT, latest_date TEXT,
  source_run_id INTEGER, source_url TEXT, checked_at TEXT, eligible INTEGER NOT NULL DEFAULT 0,
  hold_reason TEXT NOT NULL DEFAULT '', contact_email TEXT, contact_source TEXT,
  contact_verified_at TEXT, contact_name TEXT, last_seen_run INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_contact_email ON businesses(contact_email) WHERE contact_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS businesses_queue ON businesses(eligible,contact_email);
CREATE TABLE IF NOT EXISTS contact_research (
  business_key TEXT PRIMARY KEY, phone TEXT, phone_source TEXT,
  parent_name TEXT, parent_source TEXT, website_url TEXT, website_source TEXT,
  parent_phone TEXT, parent_phone_source TEXT, parent_email TEXT, parent_email_source TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_key TEXT NOT NULL, email TEXT NOT NULL,
  source_url TEXT NOT NULL, discovered_at TEXT NOT NULL,
  UNIQUE(business_key,email,source_url)
);
CREATE TABLE IF NOT EXISTS phone_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_key TEXT NOT NULL, phone TEXT NOT NULL,
  source_url TEXT NOT NULL, discovered_at TEXT NOT NULL,
  UNIQUE(business_key,phone,source_url)
);
CREATE TABLE IF NOT EXISTS suppressions (
  kind TEXT NOT NULL, value TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(kind,value)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_key TEXT NOT NULL, kind TEXT NOT NULL,
  recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL,
  grade_at_draft TEXT NOT NULL, date_at_draft TEXT NOT NULL, created_at TEXT NOT NULL,
  approved_at TEXT, send_started_at TEXT, sent_at TEXT, message_id TEXT, error TEXT,
  UNIQUE(business_key,kind)
);
CREATE INDEX IF NOT EXISTS messages_status ON messages(status);
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT NOT NULL UNIQUE,
  business_key TEXT, from_email TEXT, subject TEXT, classification TEXT NOT NULL,
  excerpt TEXT, received_at TEXT NOT NULL, needs_handoff INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, event TEXT NOT NULL,
  business_key TEXT, detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, first_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS private_tokens (name TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS enrollment_tokens (
  token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id_hash TEXT PRIMARY KEY, challenge TEXT NOT NULL, purpose TEXT NOT NULL,
  setup_hash TEXT, expires_at TEXT NOT NULL
);
INSERT OR IGNORE INTO settings VALUES ('mode','test');
INSERT OR IGNORE INTO settings VALUES ('paused','1');
INSERT OR IGNORE INTO settings VALUES ('daily_limit','5');
INSERT OR IGNORE INTO settings VALUES ('hour_start','09:00');
INSERT OR IGNORE INTO settings VALUES ('hour_end','17:00');
INSERT OR IGNORE INTO settings VALUES ('followup_days','7');
INSERT OR IGNORE INTO settings VALUES ('mention_grade','0');
INSERT OR IGNORE INTO settings VALUES ('mail_provider','microsoft365');
INSERT OR IGNORE INTO settings VALUES ('profile_business_name','Food Safety with Gazelle');
INSERT OR IGNORE INTO settings VALUES ('profile_services','Food Safety Inspections, HACCP Planning, Food Handler Certification, Retail Compliance, Vendor Food Safety, Health Department Prep');
INSERT OR IGNORE INTO settings VALUES ('profile_sender_name','Gazelle Jacobs');
INSERT OR IGNORE INTO settings VALUES ('profile_title','Food Safety Consultant & Trainer');
INSERT OR IGNORE INTO settings VALUES ('profile_sender_email','support@foodsafetywithgazelle.com');
INSERT OR IGNORE INTO settings VALUES ('profile_contact_details','562.533.3230');
INSERT OR IGNORE INTO settings VALUES ('profile_instagram','Food_Safety_With_Gazelle');
