-- users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  dob TEXT,
  created_at TEXT NOT NULL
);

-- sessions for cookie auth
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- verification status + upload keys
CREATE TABLE IF NOT EXISTS user_verification (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,          -- unverified | pending | approved | rejected
  id_key TEXT,                   -- later: R2 object key
  selfie_key TEXT,               -- later: R2 object key
  id_expiration TEXT,
  updated_at TEXT NOT NULL
);
