import { json } from "../../../_auth";
import { nowIso, requireAdminRequest } from "../../_helpers";

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
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

  const pointsDelta = Number(body?.points_delta);
  const reason = String(body?.reason || "").trim();

  if (!Number.isInteger(pointsDelta)) return json({ error: "points_delta must be an integer" }, 400);
  if (!reason) return json({ error: "reason is required" }, 400);

  const db = env.DB as D1Database;
  const user = await db
    .prepare(
      `SELECT
        id, email, first_name, last_name, phone,
        COALESCE(points_balance, 0) AS points_balance,
        COALESCE(lifetime_spend_cents, 0) AS lifetime_spend_cents,
        COALESCE(tier, 'member') AS tier,
        tier_override,
        COALESCE(tier_override, tier, 'member') AS effectiveTier,
        COALESCE(is_active, 1) AS is_active,
        COALESCE(account_status, 'pending') AS account_status,
        created_at,
        updated_at
      FROM users
      WHERE id = ?`
    )
    .bind(userId)
    .first<any>();

  if (!user) return json({ error: "Customer not found" }, 404);

  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO points_ledger (
        id,
        user_id,
        created_at,
        type,
        points_delta,
        reason,
        meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      userId,
      now,
      "admin_adjust",
      pointsDelta,
      reason,
      JSON.stringify({ admin_id: auth.adminId || null })
    )
    .run();

  await db
    .prepare(`UPDATE users SET points_balance = points_balance + ?, updated_at = ? WHERE id = ?`)
    .bind(pointsDelta, now, userId)
    .run();

  const updatedCustomer = await db
    .prepare(
      `SELECT
        id, email, first_name, last_name, phone,
        COALESCE(is_active, 1) AS is_active,
        COALESCE(account_status, 'pending') AS account_status,
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
    .bind(userId)
    .first();

  return json({ ok: true, points_balance: Number((updatedCustomer as any)?.points_balance || 0), customer: updatedCustomer });
};
