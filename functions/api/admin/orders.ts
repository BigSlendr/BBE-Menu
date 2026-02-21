import { json } from "../_auth";
import { requireAdminRequest } from "./_helpers";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const db = env.DB as D1Database;
  const url = new URL(request.url);

  const query = (url.searchParams.get("query") || "").trim();
  const status = (url.searchParams.get("status") || "").trim().toLowerCase();
  const dateFrom = (url.searchParams.get("dateFrom") || "").trim();
  const dateTo = (url.searchParams.get("dateTo") || "").trim();
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50) || 50));

  const where: string[] = [];
  const binds: unknown[] = [];

  if (query) {
    where.push(`(o.id LIKE ? COLLATE NOCASE OR o.customer_email LIKE ? COLLATE NOCASE OR o.customer_phone LIKE ? COLLATE NOCASE OR o.customer_name LIKE ? COLLATE NOCASE)`);
    const like = `%${query}%`;
    binds.push(like, like, like, like);
  }
  if (status && status !== "all") {
    where.push("LOWER(o.status) = ?");
    binds.push(status);
  }
  if (dateFrom) {
    where.push("o.created_at >= ?");
    binds.push(dateFrom);
  }
  if (dateTo) {
    where.push("o.created_at <= ?");
    binds.push(dateTo);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results } = await db
    .prepare(
      `SELECT
        o.id,
        o.created_at,
        o.status,
        o.subtotal_cents,
        o.total_cents,
        o.customer_name,
        o.customer_email,
        o.customer_phone,
        o.user_id,
        o.points_earned
      FROM orders o
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ?`
    )
    .bind(...binds, limit)
    .all();

  return json({ ok: true, orders: results || [] });
};
