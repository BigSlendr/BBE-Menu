import { json } from "../../_auth";
import { nowIso, requireAdminRequest } from "../_helpers";

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);

  const db = env.DB as D1Database;
  const user = await db
    .prepare(
      `SELECT
        id, email, first_name, last_name, phone, dob,
        COALESCE(is_active, 1) AS is_active,
        deactivated_at, deactivation_reason,
        COALESCE(account_status, 'pending') AS account_status,
        verified_at, status_reason,
        COALESCE(points_balance, 0) AS points_balance,
        COALESCE(lifetime_spend_cents, 0) AS lifetime_spend_cents,
        COALESCE(tier, 'member') AS tier,
        tier_override,
        COALESCE(tier_override, tier, 'member') AS effectiveTier,
        created_at,
        updated_at
      FROM users
      WHERE id = ?`
    )
    .bind(id)
    .first();

  if (!user) return json({ error: "Customer not found" }, 404);

  const tags = await db.prepare("SELECT tag FROM customer_tags WHERE user_id = ? ORDER BY tag ASC").bind(id).all<{ tag: string }>();
  const verification = await db.prepare("SELECT * FROM user_verification WHERE user_id = ?").bind(id).first();

  return json({ ok: true, customer: user, tags: (tags.results || []).map((r) => r.tag), verification: verification || null });
};

export const onRequestPut: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params?.id || "").trim();
  if (!id) return json({ error: "customer id required" }, 400);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const first_name = body?.first_name == null ? null : String(body.first_name).trim();
  const last_name = body?.last_name == null ? null : String(body.last_name).trim();
  const phone = body?.phone == null ? null : String(body.phone).trim();

  const now = nowIso();
  const db = env.DB as D1Database;
  const existing = await db.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "Customer not found" }, 404);

  await db
    .prepare(
      `UPDATE users
       SET first_name = ?,
           last_name = ?,
           phone = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(first_name, last_name, phone, now, id)
    .run();

  return json({ ok: true });
};

export const onRequestDelete: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const userId = String(params?.id || "").trim();
  if (!userId) return json({ error: "customer id required" }, 400);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const confirmEmail = String(body?.confirmEmail || "");
  const anonymizeOrders = Boolean(body?.anonymizeOrders);

  const db = env.DB as D1Database;
  const user = await db.prepare("SELECT id, email FROM users WHERE id = ?").bind(userId).first<{ id: string; email: string }>();
  if (!user) return json({ error: "Customer not found" }, 404);
  if (confirmEmail !== user.email) return json({ error: "confirmEmail mismatch" }, 400);

  const orders = await db.prepare("SELECT id FROM orders WHERE user_id = ?").bind(userId).all<{ id: string }>();
  const orderIds = (orders.results || []).map((o) => o.id);

  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM user_verification WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM points_ledger WHERE user_id = ?").bind(userId).run();
  await db.prepare("DELETE FROM customer_tags WHERE user_id = ?").bind(userId).run();

  await db.prepare("UPDATE orders SET user_id = NULL WHERE user_id = ?").bind(userId).run();

  if (anonymizeOrders && orderIds.length) {
    const placeholders = orderIds.map(() => "?").join(",");
    await db
      .prepare(
        `UPDATE orders
         SET customer_name = NULL,
             customer_phone = NULL,
             customer_email = NULL,
             address_json = NULL
         WHERE id IN (${placeholders})`
      )
      .bind(...orderIds)
      .run();
  }

  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

  return json({ ok: true, deleted: true });
};
