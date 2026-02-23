import { json } from "../../../_auth";
import { nowIso, requireAdminRequest } from "../../_helpers";
import { ensureRewardsAdminSchema, syncUserRewardSnapshot } from "../../_rewards-admin";

export const onRequestPut: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;
  if (auth.admin.role !== "superadmin") return json({ ok: false, error: "forbidden" }, 403);

  const orderId = String(params.id || "").trim();
  if (!orderId) return json({ ok: false, error: "missing_order_id" }, 400);
  const body = await request.json<any>().catch(() => null);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);

  const points_earned = Math.max(0, Number(body.points_earned || 0));
  const points_redeemed = Math.max(0, Number(body.points_redeemed || 0));
  const credit_cents_used = Math.max(0, Number(body.credit_cents_used || 0));
  const notes = String(body.notes || "").trim() || null;

  const db = env.DB as D1Database;
  await ensureRewardsAdminSchema(db);

  const order = await db.prepare("SELECT id, user_id, COALESCE(points_earned,0) AS points_earned FROM orders WHERE id = ?").bind(orderId).first<any>();
  if (!order) return json({ ok: false, error: "not_found" }, 404);

  const prevEarned = Number(order.points_earned || 0);
  const diff = points_earned - prevEarned;
  const now = nowIso();

  await db.prepare("UPDATE orders SET points_earned = ?, points_redeemed = ?, credit_cents_used = ? WHERE id = ?")
    .bind(points_earned, points_redeemed, credit_cents_used, orderId).run();

  await db.prepare(`INSERT INTO order_rewards (order_id, points_earned, points_redeemed, credit_cents_used, is_overridden, overridden_by_admin_id, updated_at, notes)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET points_earned=excluded.points_earned, points_redeemed=excluded.points_redeemed, credit_cents_used=excluded.credit_cents_used,
      is_overridden=1, overridden_by_admin_id=excluded.overridden_by_admin_id, updated_at=excluded.updated_at, notes=excluded.notes`)
    .bind(orderId, points_earned, points_redeemed, credit_cents_used, auth.adminId, now, notes).run();

  if (diff !== 0 && order.user_id) {
    const existing = await db.prepare("SELECT id FROM points_ledger WHERE order_id = ? AND type = 'admin_adjust' AND reason = 'order_rewards_override' AND meta_json = ? LIMIT 1")
      .bind(orderId, JSON.stringify({ diff })).first();
    if (!existing) {
      await db.prepare("INSERT INTO points_ledger (id, user_id, created_at, type, points_delta, reason, order_id, meta_json) VALUES (?, ?, ?, 'admin_adjust', ?, 'order_rewards_override', ?, ?)")
        .bind(crypto.randomUUID(), order.user_id, now, diff, orderId, JSON.stringify({ diff, admin_id: auth.adminId, notes })).run();
    }
    await syncUserRewardSnapshot(db, String(order.user_id));
  }

  return json({ ok: true, order_id: orderId, points_earned, points_redeemed, credit_cents_used, diff });
};
