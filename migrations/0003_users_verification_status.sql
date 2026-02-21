ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN verified_at TEXT;
ALTER TABLE users ADD COLUMN verified_by_admin_id TEXT;
ALTER TABLE users ADD COLUMN status_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_verified_at ON users(verified_at);
