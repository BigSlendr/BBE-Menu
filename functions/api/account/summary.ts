import { getSessionUserId, json } from "../_auth";

interface Env {
  DB: D1Database;
}

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  const db = env.DB;

  const user = await db
    .prepare(`SELECT points_balance, lifetime_points FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ points_balance?: number; lifetime_points?: number }>();

  const ledger = await db
    .prepare(
      `SELECT id, order_id, type, points, note, created_at
       FROM rewards_ledger
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 25`
    )
    .bind(userId)
    .all();

  const orders = await db
    .prepare(
      `SELECT id, created_at, status, subtotal_cents, points_earned, points_redeemed, discount_cents, items_json
       FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 25`
    )
    .bind(userId)
    .all();

  return json({
    ok: true,
    points_balance: Number(user?.points_balance || 0),
    lifetime_points: Number(user?.lifetime_points || 0),
    ledger: ledger.results || [],
    orders: orders.results || [],
  });
};
