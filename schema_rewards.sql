-- Run statements one-by-one in D1 console.
-- If an ALTER TABLE statement fails because the column already exists, you can safely ignore that error.

-- users points
ALTER TABLE users ADD COLUMN points_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN lifetime_points INTEGER NOT NULL DEFAULT 0;

-- track award to prevent double-credit
ALTER TABLE orders ADD COLUMN points_awarded_at TEXT;

-- ledger
CREATE TABLE IF NOT EXISTS rewards_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT,
  type TEXT NOT NULL, -- earn | redeem | adjust
  points INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rewards_user_created ON rewards_ledger(user_id, created_at);
