import { getSessionUserId, json } from "../_auth";

interface Env {
  DB: D1Database;
}

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  const result = await env.DB
    .prepare(
      `SELECT id, created_at, status, subtotal_cents, points_earned, points_redeemed, discount_cents, items_json
       FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .bind(userId)
    .all();

  return json({ ok: true, orders: result.results || [] });
};
