import { json, requireAdmin } from "../_auth";

export const onRequestGet: PagesFunction = async (context) => {
  const { request, env } = context;

  if (!requireAdmin(request, env)) return json({ error: "Forbidden" }, 403);

  const db = env.DB as D1Database;

  const { results } = await db
    .prepare(
      `SELECT
        o.id,
        o.created_at,
        o.status,
        o.subtotal_cents,
        o.points_earned,
        o.user_id,
        u.email
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT 50`
    )
    .all();

  return json({ ok: true, orders: results || [] });
};
