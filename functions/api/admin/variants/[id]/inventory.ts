import { json } from "../../../_auth";
import { createId, nowIso } from "../../../_products";
import { requireAdminRequest } from "../../_helpers";

export const onRequestPost: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const variantId = String(params.id || "").trim();
  if (!variantId) return json({ error: "Missing variant id" }, 400);

  const body = await request.json<any>();
  const mode = String(body?.mode || "").trim();
  const qty = Number(body?.qty);
  if (!(mode === "set" || mode === "adjust")) return json({ error: "mode must be set or adjust" }, 400);
  if (!Number.isFinite(qty)) return json({ error: "qty must be a number" }, 400);

  const db = env.DB as D1Database;
  const current = await db
    .prepare("SELECT id, inventory_qty FROM product_variants WHERE id = ?")
    .bind(variantId)
    .first<any>();
  if (!current) return json({ error: "Variant not found" }, 404);

  const previousQty = Number(current.inventory_qty || 0);
  let nextQty = previousQty;
  if (mode === "set") nextQty = Math.max(0, Math.round(qty));
  if (mode === "adjust") nextQty = Math.max(0, previousQty + Math.round(qty));
  const delta = nextQty - previousQty;

  await db
    .prepare("UPDATE product_variants SET inventory_qty = ?, updated_at = ? WHERE id = ?")
    .bind(nextQty, nowIso(), variantId)
    .run();

  const hasMovementsTable = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory_movements'")
    .first();

  if (hasMovementsTable) {
    await db
      .prepare(
        `INSERT INTO inventory_movements (id, variant_id, delta_qty, reason, created_at, created_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(createId("mov"), variantId, delta, body?.reason ? String(body.reason).trim() : null, nowIso(), auth.adminId)
      .run();
  }

  return json({ ok: true, variant_id: variantId, previous_qty: previousQty, inventory_qty: nextQty, delta });
};
