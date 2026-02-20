-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'placed',
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,

  points_earned INTEGER NOT NULL DEFAULT 0,
  points_redeemed INTEGER NOT NULL DEFAULT 0,
  credit_cents_used INTEGER NOT NULL DEFAULT 0,

  customer_name TEXT,
  customer_phone TEXT,
  delivery_method TEXT,
  address_json TEXT,
  cart_json TEXT NOT NULL,

  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id_created ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- POINTS LEDGER
CREATE TABLE IF NOT EXISTS points_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,

  type TEXT NOT NULL,
  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id TEXT,
  meta_json TEXT,

  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON points_ledger(user_id, created_at);

-- PASSWORD RESET TOKENS
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens(expires_at);

-- ADMINS
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Ensure existing sessions table from older migrations has required columns
ALTER TABLE sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE sessions ADD COLUMN session_token_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN created_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_role ON sessions(user_id, role);

-- USERS REWARDS COLUMNS (safe to run once in a migration)
ALTER TABLE users ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN lifetime_spend_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN last_activity_at TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;
