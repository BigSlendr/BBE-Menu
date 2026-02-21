import { json, requireAdmin } from "../../../_auth";

export const onRequestGet: PagesFunction = async (context) => {
  const { request, env, params } = context;

  if (!requireAdmin(request, env)) return json({ error: "Forbidden" }, 403);

  const userId = String(params?.id || "").trim();
  if (!userId) return json({ error: "user id required" }, 400);

  const db = env.DB as D1Database;

  const { results } = await db
    .prepare(
      `SELECT
        id,
        created_at,
        status,
        subtotal_cents,
        total_cents,
        points_earned,
        points_redeemed,
        credit_cents_used,
        cart_json
      FROM orders
      WHERE user_id = ?
      ORDER BY created_at DESC`
    )
    .bind(userId)
    .all();

  return json({ ok: true, orders: results || [] });
};
