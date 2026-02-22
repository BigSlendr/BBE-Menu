-- Admin users schema guarantees via rebuild (safe for prior schemas)
CREATE TABLE IF NOT EXISTS admin_users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  last_login_at TEXT
);

INSERT OR REPLACE INTO admin_users_new (id, email, name, password_hash, is_active, is_super_admin, created_at, updated_at, last_login_at)
SELECT
  id,
  email,
  name,
  password_hash,
  COALESCE(is_active, 1),
  CASE
    WHEN COALESCE(is_super_admin, 0) = 1 THEN 1
    WHEN LOWER(COALESCE(role, '')) IN ('owner', 'super_admin', 'superadmin') THEN 1
    ELSE 0
  END,
  COALESCE(created_at, datetime('now')),
  updated_at,
  last_login_at
FROM admin_users;

DROP TABLE admin_users;
ALTER TABLE admin_users_new RENAME TO admin_users;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_super ON admin_users(is_super_admin, is_active);

-- Sessions schema rebuild to allow admin sessions and preserve existing user sessions
CREATE TABLE IF NOT EXISTS sessions_new (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  admin_user_id TEXT,
  session_type TEXT NOT NULL DEFAULT 'user',
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

INSERT OR REPLACE INTO sessions_new (id, user_id, admin_user_id, session_type, expires_at, ip, user_agent, created_at)
SELECT
  id,
  user_id,
  admin_user_id,
  CASE
    WHEN COALESCE(session_type, '') IN ('user', 'admin') THEN session_type
    WHEN admin_user_id IS NOT NULL THEN 'admin'
    ELSE 'user'
  END,
  expires_at,
  ip,
  user_agent,
  COALESCE(created_at, expires_at)
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_admin_user_id ON sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Optional admin audit trail
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_time ON admin_audit(admin_user_id, created_at DESC);
