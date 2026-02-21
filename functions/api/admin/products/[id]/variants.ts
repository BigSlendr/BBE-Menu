import { json } from "../../../_auth";
import { createId, nowIso, toBoolInt } from "../../../_products";
import { requireAdminRequest } from "../../_helpers";

export const onRequestPost: PagesFunction = async ({ params, request, env }) => {
  const auth = await requireAdminRequest(request, env);
  if (!auth.ok) return auth.response;

  const productId = String(params.id || "").trim();
  if (!productId) return json({ error: "Missing product id" }, 400);

  const db = env.DB as D1Database;
  const product = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
  if (!product) return json({ error: "Product not found" }, 404);

  const body = await request.json<any>();
  const label = String(body?.label || "").trim();
  const priceCents = Number(body?.price_cents);
  if (!label) return json({ error: "label is required" }, 400);
  if (!Number.isFinite(priceCents) || priceCents < 0) return json({ error: "price_cents must be >= 0" }, 400);

  const now = nowIso();
  const variant = {
    id: createId("var"),
    product_id: productId,
    label,
    price_cents: Math.round(priceCents),
    inventory_qty: Math.max(0, Number(body?.inventory_qty || 0) || 0),
    low_stock_threshold: body?.low_stock_threshold === undefined || body?.low_stock_threshold === null || body.low_stock_threshold === "" ? null : Math.max(0, Number(body.low_stock_threshold) || 0),
    is_active: toBoolInt(body?.is_active, 1),
    sort_order: Number(body?.sort_order || 0) || 0,
    created_at: now,
    updated_at: now,
  };

  await db
    .prepare(
      `INSERT INTO product_variants (id, product_id, label, price_cents, inventory_qty, low_stock_threshold, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      variant.id,
      variant.product_id,
      variant.label,
      variant.price_cents,
      variant.inventory_qty,
      variant.low_stock_threshold,
      variant.is_active,
      variant.sort_order,
      variant.created_at,
      variant.updated_at
    )
    .run();

  return json({ ok: true, variant }, 201);
};
