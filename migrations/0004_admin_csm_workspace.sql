-- Admin CSM workspace schema updates

-- Users soft delete fields
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN deactivated_at TEXT;
ALTER TABLE users ADD COLUMN deactivation_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Users tier override fields
ALTER TABLE users ADD COLUMN tier_override TEXT;
ALTER TABLE users ADD COLUMN tier_override_reason TEXT;
ALTER TABLE users ADD COLUMN tier_override_at TEXT;
ALTER TABLE users ADD COLUMN tier_override_by_admin_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_tier_override ON users(tier_override);

-- Admin tags
CREATE TABLE IF NOT EXISTS customer_tags (
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_admin_id TEXT,
  PRIMARY KEY (user_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tag ON customer_tags(tag);

-- Ensure orders.user_id is nullable and keep modern columns
CREATE TABLE IF NOT EXISTS orders_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT,
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
  customer_email TEXT,
  special_instructions TEXT,
  delivery_method TEXT,
  address_json TEXT,
  cart_json TEXT NOT NULL
);

INSERT INTO orders_v2 (
  id, user_id, created_at, status, subtotal_cents, tax_cents, total_cents,
  points_earned, points_redeemed, credit_cents_used,
  customer_name, customer_phone, customer_email, special_instructions,
  delivery_method, address_json, cart_json
)
SELECT
  id,
  user_id,
  created_at,
  status,
  subtotal_cents,
  COALESCE(tax_cents, 0),
  total_cents,
  COALESCE(points_earned, 0),
  COALESCE(points_redeemed, 0),
  COALESCE(credit_cents_used, 0),
  customer_name,
  customer_phone,
  NULL,
  NULL,
  delivery_method,
  address_json,
  cart_json
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_v2 RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
