import { getSessionUserId, json } from "../_auth";

interface Env {
  DB: D1Database;
}

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const result = await env.DB
      .prepare(
        `SELECT id, created_at, status, subtotal_cents, total_cents, points_earned, points_redeemed, credit_cents_used
         FROM orders
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20`
      )
      .bind(userId)
      .all();

    return json({ ok: true, orders: result.results || [] });
  } catch (error) {
    console.error("[orders/me] failed to fetch orders", error);
    return json({ ok: false, error: "failed to fetch orders" }, 500);
  }
};
