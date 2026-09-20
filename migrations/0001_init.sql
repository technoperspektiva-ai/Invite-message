CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  recipient_type TEXT NOT NULL,
  recipient_name TEXT,
  headline TEXT NOT NULL,
  subtitle TEXT,
  date_text TEXT,
  time_text TEXT,
  location_text TEXT,
  dress_code TEXT,
  note_text TEXT,
  photo_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations(created_at);
