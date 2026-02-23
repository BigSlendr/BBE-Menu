import { json } from "../_auth";
import { requireAdminRequest } from "./_helpers";
import { ensureRewardsAdminSchema, getAnnualSpendCents, getLifetimeSpendCents, getPointsBalance, resolveTier } from "./_rewards-admin";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const db = env.DB as D1Database;
  await ensureRewardsAdminSchema(db);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50) || 50));
  const query = (url.searchParams.get("query") || "").trim().toLowerCase();

  const { results } = await db.prepare(`SELECT u.id AS user_id, u.email, u.first_name, u.last_name, u.phone, u.created_at,
      COALESCE(u.is_active,1) AS is_active, COALESCE(u.account_status,'pending') AS account_status
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT ?`).bind(limit).all<any>();

  const rows = results || [];
  const customers = [] as any[];
  for (const row of rows) {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    if (query && !String(row.email || "").toLowerCase().includes(query) && !fullName.toLowerCase().includes(query)) continue;
    const userId = String(row.user_id || row.id || "");
    const [annual, lifetime, points, ordersCount, tags, tier] = await Promise.all([
      getAnnualSpendCents(db, userId),
      getLifetimeSpendCents(db, userId),
      getPointsBalance(db, userId),
      db.prepare("SELECT COUNT(1) AS c FROM orders WHERE user_id = ?").bind(userId).first<{ c: number }>(),
      db.prepare("SELECT tag FROM customer_tags WHERE user_id = ? ORDER BY tag ASC").bind(userId).all<{ tag: string }>(),
      (async () => resolveTier(db, userId, await getAnnualSpendCents(db, userId)))(),
    ]);

    customers.push({
      user_id: userId,
      id: userId,
      email: row.email,
      name: fullName,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      created_at: row.created_at,
      is_active: Number(row.is_active || 1),
      account_status: row.account_status,
      lifetime_spend_cents: lifetime,
      annual_spend_cents: annual,
      points_balance: points,
      orders_count: Number(ordersCount?.c || 0),
      tier_code: tier.code,
      effectiveTier: tier.code,
      tags: (tags.results || []).map((t) => t.tag),
    });
  }

  return json({ ok: true, customers });
};
