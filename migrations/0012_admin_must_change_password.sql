CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

ALTER TABLE admins ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN password_updated_at TEXT;
ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE admins ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
