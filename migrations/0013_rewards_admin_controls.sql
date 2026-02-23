-- Rewards/admin control additions (backwards compatible)
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS reward_tiers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_annual_cents INTEGER NOT NULL,
  max_annual_cents INTEGER,
  earn_rate_ppd INTEGER NOT NULL,
  no_expiration INTEGER NOT NULL DEFAULT 0,
  invite_only INTEGER NOT NULL DEFAULT 0,
  benefits TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customer_rewards (
  user_id TEXT PRIMARY KEY,
  tier_override_code TEXT,
  updated_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS order_rewards (
  order_id TEXT PRIMARY KEY,
  points_earned INTEGER DEFAULT 0,
  points_redeemed INTEGER DEFAULT 0,
  credit_cents_used INTEGER DEFAULT 0,
  is_overridden INTEGER DEFAULT 0,
  overridden_by_admin_id TEXT,
  updated_at TEXT,
  notes TEXT
);

INSERT OR IGNORE INTO reward_tiers (code, name, min_annual_cents, max_annual_cents, earn_rate_ppd, no_expiration, invite_only, sort_order, is_active)
VALUES ('member','Member',0,49900,10,0,0,10,1);
INSERT OR IGNORE INTO reward_tiers (code, name, min_annual_cents, max_annual_cents, earn_rate_ppd, no_expiration, invite_only, sort_order, is_active)
VALUES ('insider','Insider',50000,149900,11,1,0,20,1);
INSERT OR IGNORE INTO reward_tiers (code, name, min_annual_cents, max_annual_cents, earn_rate_ppd, no_expiration, invite_only, sort_order, is_active)
VALUES ('elite','Elite',150000,399900,12,0,0,30,1);
INSERT OR IGNORE INTO reward_tiers (code, name, min_annual_cents, max_annual_cents, earn_rate_ppd, no_expiration, invite_only, sort_order, is_active)
VALUES ('black_reserve','Black Reserve',400000,NULL,15,1,1,40,1);
