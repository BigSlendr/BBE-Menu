import { json } from "../../../_auth";
import { nowIso, requireAdminRequest } from "../../_helpers";
import { ensureRewardsAdminSchema, resolveTier, syncUserRewardSnapshot, getAnnualSpendCents } from "../../_rewards-admin";

const valid = new Set(["pending", "placed", "processing", "completed", "cancelled"]);

async function applyStatusChange(db: D1Database, orderId: string, next: string) {
  const order = await db.prepare("SELECT id, user_id, status, COALESCE(subtotal_cents,0) AS subtotal_cents, COALESCE(points_earned,0) AS points_earned FROM orders WHERE id = ?").bind(orderId).first<any>();
  if (!order) return { status: 404 as const, body: { ok: false, error: "not_found" } };

  const current = String(order.status || "pending").toLowerCase();
  if (current === next) return { status: 200 as const, body: { ok: true, data: { id: orderId, status: next, unchanged: true } } };

  await db.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(next, orderId).run();

  const userId = String(order.user_id || "").trim();
  if (userId) {
    await ensureRewardsAdminSchema(db);
    const annual = await getAnnualSpendCents(db, userId);
    const tier = await resolveTier(db, userId, annual);
    const computedEarn = Math.floor(Number(order.subtotal_cents || 0) / 100) * Number(tier.earn_rate_ppd || 10);
    const pointsEarned = Math.max(0, Number(order.points_earned || computedEarn));
    await db.prepare("UPDATE orders SET points_earned = ? WHERE id = ?").bind(pointsEarned, orderId).run();

    if (next === "cancelled" && current !== "cancelled") {
      const hasReverse = await db.prepare("SELECT id FROM points_ledger WHERE order_id = ? AND type = 'reverse' LIMIT 1").bind(orderId).first();
      if (!hasReverse && pointsEarned > 0) {
        await db.prepare("INSERT INTO points_ledger (id, user_id, created_at, type, points_delta, reason, order_id, meta_json) VALUES (?, ?, ?, 'reverse', ?, 'order_status_cancelled', ?, ?)")
          .bind(crypto.randomUUID(), userId, nowIso(), -pointsEarned, orderId, JSON.stringify({ status_to: next })).run();
      }
    }

    if (current === "cancelled" && next !== "cancelled") {
      const hasEarn = await db.prepare("SELECT id FROM points_ledger WHERE order_id = ? AND type = 'earn' LIMIT 1").bind(orderId).first();
      if (!hasEarn && pointsEarned > 0) {
        await db.prepare("INSERT INTO points_ledger (id, user_id, created_at, type, points_delta, reason, order_id, meta_json) VALUES (?, ?, ?, 'earn', ?, 'order_status_restore', ?, ?)")
          .bind(crypto.randomUUID(), userId, nowIso(), pointsEarned, orderId, JSON.stringify({ status_to: next })).run();
      }
    }

    await syncUserRewardSnapshot(db, userId);
  }

  return { status: 200 as const, body: { ok: true, data: { id: orderId, status: next } } };
}

const handler: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const id = String(params.id || "").trim();
  const body = await request.json<any>().catch(() => null);
  const next = String(body?.status || "").toLowerCase();
  if (!id || !valid.has(next)) return json({ ok: false, error: "invalid_payload", code: "INVALID_PAYLOAD" }, 400);

  const result = await applyStatusChange(env.DB as D1Database, id, next);
  return json(result.body, result.status);
};

export const onRequestPatch = handler;
export const onRequestPut = handler;
