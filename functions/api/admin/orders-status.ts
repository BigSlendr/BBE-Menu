import { json, requireAdmin } from "../_auth";
import { awardPointsForOrder } from "../_rewards";

const allowedStatuses = new Set(["pending", "completed", "cancelled"]);

export const onRequestPost: PagesFunction = async (context) => {
  const { request, env } = context;

  if (!requireAdmin(request, env)) return json({ error: "Forbidden" }, 403);

  let body: { order_id?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";

  if (!orderId) return json({ ok: false, error: "order_id is required" }, 400);
  if (!allowedStatuses.has(status)) {
    return json({ ok: false, error: "status must be pending, completed, or cancelled" }, 400);
  }

  const db = env.DB as D1Database;

  const updateResult = await db
    .prepare(`UPDATE orders SET status = ? WHERE id = ?`)
    .bind(status, orderId)
    .run();

  if (!updateResult.success || (updateResult.meta?.changes || 0) < 1) {
    return json({ ok: false, error: "Order not found" }, 404);
  }

  if (status !== "completed") {
    return json({ ok: true });
  }

  const awardResult = await awardPointsForOrder(db, orderId);
  if (!awardResult.ok) {
    return json({ ok: false, error: awardResult.reason || "Unable to award points" }, 400);
  }

  if (awardResult.skipped) {
    return json({ ok: true, awarded: { skipped: true } });
  }

  return json({ ok: true, awarded: { pointsEarned: awardResult.pointsEarned || 0 } });
};
