import { json } from "../_auth";
import { requireAdminRequest } from "./_helpers";

function resolveRange(url: URL) {
  const range = (url.searchParams.get("range") || "7").toLowerCase();
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let start = new Date(today);
  let end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 1);

  if (range === "today") {
    return { start: today.toISOString(), end: end.toISOString() };
  }
  if (range === "30") {
    start.setUTCDate(start.getUTCDate() - 29);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (range === "custom") {
    const s = url.searchParams.get("start") || "";
    const e = url.searchParams.get("end") || "";
    const parsedStart = s ? new Date(`${s}T00:00:00.000Z`) : today;
    const parsedEnd = e ? new Date(`${e}T23:59:59.999Z`) : end;
    return { start: parsedStart.toISOString(), end: parsedEnd.toISOString() };
  }

  start.setUTCDate(start.getUTCDate() - 6);
  return { start: start.toISOString(), end: end.toISOString() };
}

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const db = env.DB as D1Database;
  const url = new URL(request.url);
  const { start, end } = resolveRange(url);

  const metrics = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN total_cents ELSE 0 END), 0) AS revenue_completed_cents,
        COALESCE(SUM(CASE WHEN LOWER(status) IN ('pending','placed') THEN total_cents ELSE 0 END), 0) AS pending_cents,
        COALESCE(SUM(CASE WHEN LOWER(status) = 'cancelled' THEN total_cents ELSE 0 END), 0) AS cancelled_cents,
        COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END), 0) AS orders_completed_count,
        COALESCE(SUM(CASE WHEN LOWER(status) IN ('pending','placed') THEN 1 ELSE 0 END), 0) AS orders_pending_count,
        COALESCE(SUM(CASE WHEN LOWER(status) = 'cancelled' THEN 1 ELSE 0 END), 0) AS orders_cancelled_count
       FROM orders
       WHERE created_at >= ? AND created_at <= ?`
    )
    .bind(start, end)
    .first<any>();

  const customers = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM users) AS customers_total,
        (SELECT COUNT(*) FROM users WHERE COALESCE(is_active, 1) = 1) AS customers_active,
        (SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at <= ?) AS new_customers_count`
    )
    .bind(start, end)
    .first<any>();

  const points = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN points_delta > 0 THEN points_delta ELSE 0 END), 0) AS points_issued,
        COALESCE(SUM(CASE WHEN points_delta < 0 THEN ABS(points_delta) ELSE 0 END), 0) AS points_redeemed
      FROM points_ledger
      WHERE created_at >= ? AND created_at <= ?`
    )
    .bind(start, end)
    .first<any>();

  const outstanding = await db.prepare("SELECT COALESCE(SUM(COALESCE(points_balance, 0)),0) AS points_outstanding FROM users").first<any>();

  const topCustomers = await db
    .prepare(
      `SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        COALESCE(SUM(CASE WHEN LOWER(o.status) = 'completed' THEN o.total_cents ELSE 0 END), 0) AS lifetime_spend_completed_cents,
        COALESCE(u.points_balance,0) AS points_balance
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id
      ORDER BY lifetime_spend_completed_cents DESC, points_balance DESC
      LIMIT 10`
    )
    .all();

  const completedCount = Number(metrics?.orders_completed_count || 0);
  const revenueCompleted = Number(metrics?.revenue_completed_cents || 0);

  return json({
    ok: true,
    range: { start, end },
    metrics: {
      revenue_completed_cents: revenueCompleted,
      pending_cents: Number(metrics?.pending_cents || 0),
      cancelled_cents: Number(metrics?.cancelled_cents || 0),
      orders_completed_count: completedCount,
      orders_pending_count: Number(metrics?.orders_pending_count || 0),
      orders_cancelled_count: Number(metrics?.orders_cancelled_count || 0),
      aov_completed_cents: completedCount > 0 ? Math.round(revenueCompleted / completedCount) : 0,
      customers_total: Number(customers?.customers_total || 0),
      customers_active: Number(customers?.customers_active || 0),
      new_customers_count: Number(customers?.new_customers_count || 0),
      points_issued: Number(points?.points_issued || 0),
      points_redeemed: Number(points?.points_redeemed || 0),
      points_outstanding: Number(outstanding?.points_outstanding || 0),
    },
    top_customers: topCustomers.results || [],
  });
};
