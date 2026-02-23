import { nowIso } from "./_helpers";

type TierRow = {
  code: string;
  name: string;
  min_annual_cents: number;
  max_annual_cents: number | null;
  earn_rate_ppd: number;
  no_expiration: number;
  invite_only: number;
  benefits: string | null;
  sort_order: number;
  is_active: number;
};

export async function ensureRewardsAdminSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS reward_tiers (
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
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS customer_rewards (
    user_id TEXT PRIMARY KEY,
    tier_override_code TEXT,
    updated_at TEXT,
    notes TEXT
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS order_rewards (
    order_id TEXT PRIMARY KEY,
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    credit_cents_used INTEGER DEFAULT 0,
    is_overridden INTEGER DEFAULT 0,
    overridden_by_admin_id TEXT,
    updated_at TEXT,
    notes TEXT
  )`).run();

  const seeds = [
    ["member", "Member", 0, 49900, 10, 0, 0, null, 10, 1],
    ["insider", "Insider", 50000, 149900, 11, 1, 0, null, 20, 1],
    ["elite", "Elite", 150000, 399900, 12, 0, 0, null, 30, 1],
    ["black_reserve", "Black Reserve", 400000, null, 15, 1, 1, null, 40, 1],
  ] as const;
  for (const row of seeds) {
    await db.prepare(`INSERT OR IGNORE INTO reward_tiers (
      code,name,min_annual_cents,max_annual_cents,earn_rate_ppd,no_expiration,invite_only,benefits,sort_order,is_active
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(...row).run();
  }
}

export async function getAnnualSpendCents(db: D1Database, userId: string) {
  const r = await db.prepare(`SELECT COALESCE(SUM(COALESCE(subtotal_cents,0)),0) AS annual_spend_cents
    FROM orders
    WHERE user_id = ?
      AND LOWER(COALESCE(status,'pending')) != 'cancelled'
      AND datetime(created_at) >= datetime('now', '-365 days')`).bind(userId).first<{ annual_spend_cents: number }>();
  return Number(r?.annual_spend_cents || 0);
}

export async function getLifetimeSpendCents(db: D1Database, userId: string) {
  const r = await db.prepare(`SELECT COALESCE(SUM(COALESCE(subtotal_cents,0)),0) AS lifetime_spend_cents
    FROM orders WHERE user_id = ? AND LOWER(COALESCE(status,'pending')) != 'cancelled'`).bind(userId).first<{ lifetime_spend_cents: number }>();
  return Number(r?.lifetime_spend_cents || 0);
}

export async function getPointsBalance(db: D1Database, userId: string) {
  const r = await db.prepare("SELECT COALESCE(SUM(points_delta),0) AS points_balance FROM points_ledger WHERE user_id = ?").bind(userId).first<{ points_balance: number }>();
  return Number(r?.points_balance || 0);
}

export async function getActiveTiers(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM reward_tiers WHERE COALESCE(is_active,1)=1 ORDER BY sort_order ASC, min_annual_cents ASC").all<TierRow>();
  return results || [];
}

export async function resolveTier(db: D1Database, userId: string, annualSpendCents: number) {
  const override = await db.prepare("SELECT tier_override_code FROM customer_rewards WHERE user_id = ?").bind(userId).first<{ tier_override_code: string | null }>();
  const overrideCode = String(override?.tier_override_code || "").trim().toLowerCase();
  if (overrideCode) {
    const row = await db.prepare("SELECT * FROM reward_tiers WHERE LOWER(code)=LOWER(?) LIMIT 1").bind(overrideCode).first<TierRow>();
    if (row) return row;
  }

  const row = await db.prepare(`SELECT * FROM reward_tiers
    WHERE COALESCE(is_active,1)=1
      AND min_annual_cents <= ?
      AND (max_annual_cents IS NULL OR max_annual_cents >= ?)
    ORDER BY min_annual_cents DESC
    LIMIT 1`).bind(annualSpendCents, annualSpendCents).first<TierRow>();

  if (row) return row;
  return { code: "member", name: "Member", min_annual_cents: 0, max_annual_cents: 49900, earn_rate_ppd: 10, no_expiration: 0, invite_only: 0, benefits: null, sort_order: 10, is_active: 1 };
}

export async function syncUserRewardSnapshot(db: D1Database, userId: string) {
  const annual = await getAnnualSpendCents(db, userId);
  const lifetime = await getLifetimeSpendCents(db, userId);
  const balance = await getPointsBalance(db, userId);
  const tier = await resolveTier(db, userId, annual);
  await db.prepare(`UPDATE users SET points_balance = ?, lifetime_spend_cents = ?, tier = ?, updated_at = ? WHERE id = ?`)
    .bind(balance, lifetime, tier.code, nowIso(), userId).run();
  return { annual_spend_cents: annual, lifetime_spend_cents: lifetime, points_balance: balance, tier_code: tier.code, tier };
}
