import { json } from "../../_auth";
import { nowIso, requireAdminRequest } from "../_helpers";
import { ensureRewardsAdminSchema, getAnnualSpendCents, getLifetimeSpendCents, getPointsBalance, resolveTier, syncUserRewardSnapshot } from "../_rewards-admin";

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);

  const db = env.DB as D1Database;
  await ensureRewardsAdminSchema(db);
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
  if (!user) return json({ error: "Customer not found" }, 404);

  const annual = await getAnnualSpendCents(db, id);
  const lifetime = await getLifetimeSpendCents(db, id);
  const points = await getPointsBalance(db, id);
  const tier = await resolveTier(db, id, annual);

  const tags = await db.prepare("SELECT tag FROM customer_tags WHERE user_id = ? ORDER BY tag ASC").bind(id).all<{ tag: string }>();
  const verification = await db.prepare("SELECT * FROM user_verification WHERE user_id = ?").bind(id).first();
  const recentOrders = await db.prepare("SELECT id, created_at, status, subtotal_cents, total_cents, points_earned, points_redeemed, credit_cents_used FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 25").bind(id).all();
  const recentLedger = await db.prepare("SELECT id, created_at, type, points_delta, reason, order_id FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all();

  return json({
    ok: true,
    customer: {
      ...user,
      annual_spend_cents: annual,
      lifetime_spend_cents: lifetime,
      points_balance: points,
      tier_code: tier.code,
      effectiveTier: tier.code,
    },
    tags: (tags.results || []).map((r) => r.tag),
    verification: verification || null,
    recent_orders: recentOrders.results || [],
    recent_ledger: recentLedger.results || [],
    tier,
  });
};

export const onRequestPut: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);

  const body = await request.json<any>().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const email = body?.email == null ? null : String(body.email).trim().toLowerCase();
  const first_name = body?.first_name == null ? null : String(body.first_name).trim();
  const last_name = body?.last_name == null ? null : String(body.last_name).trim();
  const phone = body?.phone == null ? null : String(body.phone).trim();

  const db = env.DB as D1Database;
  const existing = await db.prepare("SELECT id, email FROM users WHERE id = ?").bind(id).first<any>();
  if (!existing) return json({ error: "Customer not found" }, 404);

  if (email && email !== String(existing.email || "").toLowerCase()) {
    const dup = await db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1").bind(email, id).first();
    if (dup) return json({ error: "email_in_use" }, 409);
  }

  await db.prepare(`UPDATE users
    SET email = COALESCE(?, email),
        first_name = ?,
        last_name = ?,
        phone = ?,
        updated_at = ?
    WHERE id = ?`).bind(email, first_name, last_name, phone, nowIso(), id).run();

  await syncUserRewardSnapshot(db, id);
  return json({ ok: true });
};

export const onRequestDelete: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;
  if (auth.admin.role !== "superadmin") return json({ ok: false, error: "forbidden" }, 403);

  const userId = String(params?.id || "").trim();
  if (!userId) return json({ error: "customer id required" }, 400);

  const db = env.DB as D1Database;
  const user = await db.prepare("SELECT id, email FROM users WHERE id = ?").bind(userId).first<{ id: string; email: string }>();
  if (!user) return json({ error: "Customer not found" }, 404);

  const anonEmail = `deleted+${userId}@deleted.local`;
  const now = nowIso();

  try {
    await db.prepare("UPDATE users SET is_active = 0, account_status = 'deleted', deleted_at = ?, email = ?, first_name = NULL, last_name = NULL, phone = NULL, updated_at = ? WHERE id = ?")
      .bind(now, anonEmail, now, userId).run();
  } catch {
    await db.prepare("UPDATE users SET is_active = 0, account_status = 'deleted', email = ?, first_name = NULL, last_name = NULL, phone = NULL, updated_at = ? WHERE id = ?")
      .bind(anonEmail, now, userId).run();
  }
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM customer_tags WHERE user_id = ?").bind(userId).run();
  await db.prepare("INSERT OR REPLACE INTO customer_rewards (user_id, tier_override_code, updated_at, notes) VALUES (?, NULL, ?, ?)")
    .bind(userId, now, "account_soft_deleted").run();

  return json({ ok: true });
};
