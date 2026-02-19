export function calcEarnPoints(subtotal_cents: number): number {
  if (!Number.isFinite(subtotal_cents) || subtotal_cents <= 0) return 0;
  return Math.floor(subtotal_cents / 10);
}

export async function awardPointsForOrder(db: D1Database, orderId: string) {
  const order = await db
    .prepare(
      `SELECT id, user_id, status, subtotal_cents, points_awarded_at
       FROM orders
       WHERE id = ?`
    )
    .bind(orderId)
    .first<{ id: string; user_id: string; status: string; subtotal_cents: number; points_awarded_at: string | null }>();

  if (!order) {
    return { ok: false, reason: "Order not found" };
  }

  if (order.status !== "completed") {
    return { ok: false, reason: "Order is not completed" };
  }

  if (order.points_awarded_at) {
    return { ok: true, skipped: true };
  }

  const pointsEarned = calcEarnPoints(Number(order.subtotal_cents || 0));
  const awardedAt = new Date().toISOString();

  const updateOrder = await db
    .prepare(
      `UPDATE orders
       SET points_earned = ?,
           points_awarded_at = ?
       WHERE id = ?
         AND points_awarded_at IS NULL`
    )
    .bind(pointsEarned, awardedAt, order.id)
    .run();

  if (!updateOrder.success || (updateOrder.meta?.changes || 0) < 1) {
    return { ok: true, skipped: true };
  }

  await db
    .prepare(
      `INSERT INTO rewards_ledger (id, user_id, order_id, type, points, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), order.user_id, order.id, "earn", pointsEarned, "Order completed", awardedAt)
    .run();

  await db
    .prepare(
      `UPDATE users
       SET points_balance = points_balance + ?,
           lifetime_points = lifetime_points + ?
       WHERE id = ?`
    )
    .bind(pointsEarned, pointsEarned, order.user_id)
    .run();

  return { ok: true, pointsEarned };
}
